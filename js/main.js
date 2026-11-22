import { firebaseConfig } from "./firebase-config.js";
import { createLocalBackend } from "./backend-local.js";
import { Game, unlockAudio } from "./game.js";
import { supportsWebGL, ELF_COLOURS } from "./scene.js";
import { DIFFICULTY, GAME_MS, MAX_PLAYERS } from "./rules.js";

// ---------- Settings ----------
const ROOT = "giftRooms";      // where rooms live in the database
const COUNTDOWN_MS = 3800;     // 3, 2, 1, go
const HOST_GRACE_MS = 60_000;  // how long the host can be away before someone else takes over

// ---------- Helpers ----------
const $ = (id) => document.getElementById(id);
const params = new URLSearchParams(location.search);
const VIEWS = ["home", "lobby", "game", "results"];
const CODE_LETTERS = "ABCDEFGHJKLMNPQRSTUVWXYZ"; // no I or O
const store = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch { /* private mode */ } },
};

const randomCode = () => Array.from({ length: 4 }, () => CODE_LETTERS[Math.floor(Math.random() * CODE_LETTERS.length)]).join("");
const cleanCode = (s) => (s || "").toUpperCase().replace(/[^A-Z]/g, "").slice(0, 4);
const inviteUrl = (code) => `${location.origin}${location.pathname}?room=${code}${backend?.kind === "local" ? "&local" : ""}`;

/** Keep the room in the address bar, so a reload offers to rejoin. Some embedded previews forbid this. */
function setUrl(url) { try { history.replaceState(null, "", url); } catch { /* not allowed here */ } }

function show(view) {
  const changed = document.body.dataset.view !== view;
  for (const v of VIEWS) $(`view-${v}`).hidden = v !== view;
  document.body.dataset.view = view;
  if (changed && view !== "home") window.scrollTo(0, 0);
}

// ---------- State ----------
let backend = null;
let code = null;            // current room code
let room = null;            // latest room snapshot
let unwatch = null;
let game = null;            // the round being played on this device
let hostOfflineSince = 0;
let wakeLock = null;
let qrFor = null;
let celebratedRound = null;

const looksLikePhone = () => matchMedia("(pointer: coarse)").matches;
const me = () => room?.players?.[backend.uid];
const isHost = () => room?.hostId === backend.uid;
const roomPath = (p = "") => `${ROOT}/${code}${p ? "/" + p : ""}`;
const onlinePlayers = () => Object.entries(room?.players || {})
  .filter(([, p]) => p.online)
  .sort(([, a], [, b]) => (a.joinedAt || 0) - (b.joinedAt || 0));

// ---------- Controls: touch or keyboard ----------
let selectedMode = store.get("gift-wrapper-mode") || (looksLikePhone() ? "touch" : "keys");

function selectMode(mode) {
  selectedMode = mode;
  store.set("gift-wrapper-mode", mode);
  document.body.classList.toggle("touch", mode === "touch");
  for (const [id, m] of [["home-touch", "touch"], ["home-keys", "keys"]]) {
    $(id).classList.toggle("selected", m === mode);
    $(id).setAttribute("aria-pressed", String(m === mode));
  }
}

async function keepAwake(on) {
  try {
    if (on && !wakeLock && "wakeLock" in navigator) wakeLock = await navigator.wakeLock.request("screen");
    if (!on && wakeLock) { await wakeLock.release(); wakeLock = null; }
  } catch { /* not supported */ }
}

// ---------- Rooms ----------
function playerRecord(name) {
  return { name, online: true, joinedAt: backend.serverNow(), touch: selectedMode === "touch" };
}

async function createRoom() {
  const name = readName();
  if (!name) return;
  unlockAudio();
  setBusy(true);
  try {
    for (let i = 0; i < 8; i++) {
      const c = randomCode();
      const ok = await backend.createIfAbsent(`${ROOT}/${c}`, {
        hostId: backend.uid,
        status: "lobby",
        round: 0,
        difficulty: store.get("gift-wrapper-difficulty") || "normal",
        createdAt: backend.serverNow(),
        players: { [backend.uid]: playerRecord(name) },
      });
      if (ok) return enterRoom(c);
    }
    homeError("Couldn't create a room. Try again.");
  } catch (err) {
    console.error(err);
    homeError("Couldn't create a room. Check your connection.");
  } finally {
    setBusy(false);
  }
}

async function joinRoom(c) {
  const name = readName();
  if (!name) return;
  c = cleanCode(c);
  if (c.length !== 4) return homeError("Room codes are 4 letters.");
  unlockAudio();
  setBusy(true);
  try {
    const r = await backend.get(`${ROOT}/${c}`);
    if (!r?.hostId) {
      setInviteMode(null); // let them create their own room instead
      return homeError(`Room ${c} doesn't exist any more. Create a new one, or check the code.`);
    }
    const existing = r.players?.[backend.uid];
    const others = Object.entries(r.players || {}).filter(([id, p]) => id !== backend.uid && p.online).length;
    if (!existing && others >= MAX_PLAYERS) return homeError(`Room ${c} is full: the workshop only fits ${MAX_PLAYERS} elves.`);
    await backend.update(`${ROOT}/${c}/players/${backend.uid}`, existing
      ? { name, online: true, touch: selectedMode === "touch" }
      : playerRecord(name));
    enterRoom(c);
  } catch (err) {
    console.error(err);
    homeError("Couldn't join that room. Check your connection.");
  } finally {
    setBusy(false);
  }
}

function enterRoom(c) {
  code = c;
  setUrl(`?room=${c}${backend.kind === "local" ? "&local" : ""}`);
  backend.onDisconnectSet(roomPath(`players/${backend.uid}/online`), false);
  unwatch?.();
  unwatch = backend.watch(roomPath(), (r) => { room = r; render(); });
}

async function leaveRoom() {
  if (!code) return;
  const c = code;
  unwatch?.();
  unwatch = null;
  await backend.cancelOnDisconnect(roomPath(`players/${backend.uid}/online`));
  await backend.set(`${ROOT}/${c}/players/${backend.uid}`, null);
  code = null;
  room = null;
  endGame();
  setUrl(location.pathname + (backend.kind === "local" && params.has("local") ? "?local" : ""));
  setInviteMode(null);
  show("home");
}

async function startGame() {
  if (!isHost()) return;
  const elves = onlinePlayers().slice(0, MAX_PLAYERS);
  if (!elves.length) return;
  const startAt = backend.serverNow() + COUNTDOWN_MS;
  const updates = {
    status: "playing",
    round: (room.round || 0) + 1,
    seed: Math.floor(Math.random() * 1e9),
    startAt,
    endsAt: startAt + (+params.get("secs") * 1000 || GAME_MS), // ?secs=30 gives a short test shift
    participants: Object.fromEntries(elves.map(([id, p]) => [id, p.name])),
    slots: Object.fromEntries(elves.map(([id], i) => [id, i])),
    game: null,
    result: null,
  };
  for (const id of Object.keys(room.players)) {
    updates[`players/${id}/pos`] = null;
    updates[`players/${id}/act`] = null;
  }
  await backend.update(roomPath(), updates);
}

async function playAgain() {
  if (!isHost()) return;
  await backend.update(roomPath(), { status: "lobby", participants: null, slots: null, startAt: null, endsAt: null, game: null });
}

async function setDifficulty(key) {
  if (!isHost() || !DIFFICULTY[key]) return;
  store.set("gift-wrapper-difficulty", key);
  await backend.update(roomPath(), { difficulty: key });
}

async function switchControls() {
  selectMode(selectedMode === "touch" ? "keys" : "touch");
  await backend.update(roomPath(`players/${backend.uid}`), { touch: selectedMode === "touch" });
}

// ---------- Game lifecycle ----------
function ensureGame() {
  if (game && game.round === room.round) { game.onRoom(room); return true; }
  endGame();
  show("game");
  if (!supportsWebGL()) {
    $("spectate").hidden = false;
    $("spectate").textContent = "This browser can't show the 3D workshop. Try Chrome or Safari.";
    return false;
  }
  game = new Game({ backend, roomPath, room });
  keepAwake(true);
  return true;
}

function endGame() {
  game?.destroy();
  game = null;
  keepAwake(false);
}

// ---------- Rendering ----------
function render() {
  if (!code) return show("home");
  if (!room) {
    const c = code;
    code = null;
    unwatch?.();
    endGame();
    show("home");
    homeError(`Room ${c} has closed.`);
    return;
  }
  if (!me()) return; // our join write hasn't landed yet

  maybeTakeOverHost();

  if (room.status === "lobby") {
    if (game) endGame();
    return renderLobby();
  }
  if (room.status === "results") {
    if (game) endGame();
    return renderResults();
  }
  ensureGame();
}

function renderLobby() {
  show("lobby");
  $("room-code").textContent = code;
  renderQr();

  const players = onlinePlayers();
  $("player-count").textContent = Math.min(players.length, MAX_PLAYERS);
  const list = $("player-list");
  list.innerHTML = "";
  players.forEach(([id, p], i) => {
    const li = document.createElement("li");
    const name = document.createElement("span");
    const dot = document.createElement("i");
    dot.className = "elf-dot";
    dot.style.background = ELF_COLOURS[i % 4];
    name.append(dot, (id === room.hostId ? "👑 " : "") + p.name + (id === backend.uid ? " (you)" : ""));
    if (id === backend.uid) name.classList.add("me");
    const tag = document.createElement("span");
    tag.className = "tag ok";
    tag.textContent = p.touch ? "📱 touch" : "⌨️ keyboard";
    li.append(name, tag);
    list.appendChild(li);
  });

  const diff = room.difficulty || "normal";
  for (const b of $("difficulty").children) {
    b.classList.toggle("selected", b.dataset.diff === diff);
    b.disabled = !isHost();
  }
  const best = room.best?.[diff];
  $("best-note").textContent = best ? `Room best on ${DIFFICULTY[diff].label}: ${best} points` : "";

  $("start-btn").hidden = !isHost();
  $("start-btn").disabled = players.length === 0;
  const n = Math.min(players.length, MAX_PLAYERS);
  $("start-btn").textContent = `Start game · ${n} ${n === 1 ? "elf" : "elves"}`;
  $("lobby-wait").textContent = isHost()
    ? "Tap Start once everyone has joined. You can play solo too."
    : "Waiting for the host to start…";
}

function renderQr() {
  if (qrFor === code) return;
  const box = $("qr");
  if (!window.qrcode) {
    box.innerHTML = "";
    window.addEventListener("load", () => { qrFor = null; if (room?.status === "lobby") renderQr(); }, { once: true });
    return;
  }
  const qr = window.qrcode(0, "M");
  qr.addData(inviteUrl(code));
  qr.make();
  box.innerHTML = qr.createImgTag(5, 0, "QR code to join");
  qrFor = code;
}

function renderResults() {
  if (document.body.dataset.view !== "results") {
    // Avoid accidental taps on the buttons while people are still mashing the action button.
    for (const id of ["again-btn", "leave-btn-2"]) {
      $(id).disabled = true;
      setTimeout(() => ($(id).disabled = false), 1500);
    }
  }
  show("results");
  const res = room.result || { score: 0, served: 0, perfect: 0, missed: 0 };
  const diff = res.difficulty || room.difficulty || "normal";
  $("result-diff").textContent = `Team score · ${DIFFICULTY[diff].emoji} ${DIFFICULTY[diff].label}`;
  $("result-score").textContent = res.score || 0;
  $("stat-served").textContent = res.served || 0;
  $("stat-perfect").textContent = res.perfect || 0;
  $("stat-missed").textContent = res.missed || 0;

  // High score on this device, per difficulty.
  const key = `gift-wrapper-best-${diff}`;
  const mine = +store.get(key) || 0;
  if (celebratedRound !== room.round) {
    celebratedRound = room.round;
    if ((res.score || 0) > mine) {
      store.set(key, String(res.score));
      $("result-best").textContent = mine ? `🎉 New high score! (was ${mine})` : "🎉 New high score!";
      confetti();
    } else {
      $("result-best").textContent = res.score ? `Your high score: ${mine}` : "No presents made it to the sleigh. Try again!";
    }
  }

  const rows = Object.keys(room.participants || {}).map((id) => ({
    id,
    slot: room.slots?.[id] ?? 0,
    name: room.players?.[id]?.name || room.participants[id],
    gifts: res.st?.[id]?.g || 0,
    points: res.st?.[id]?.p || 0,
  })).sort((a, b) => b.points - a.points);

  const podium = $("podium");
  podium.innerHTML = "";
  const medals = ["🥇", "🥈", "🥉"];
  for (let i = 0; i < 3; i++) {
    const r = rows[i];
    const step = document.createElement("div");
    step.className = `step p${i + 1}` + (r ? "" : " empty");
    if (r) {
      const crown = document.createElement("div");
      crown.className = "crown";
      crown.textContent = medals[i];
      const who = document.createElement("div");
      who.className = "who";
      who.textContent = r.name + (r.id === backend.uid ? " (you)" : "");
      const t = document.createElement("div");
      t.className = "t";
      t.textContent = `${r.gifts} sent · ${r.points} pts`;
      step.append(crown, who, t);
    }
    const block = document.createElement("div");
    block.className = "block";
    block.textContent = i + 1;
    if (r) block.style.borderBottom = `6px solid ${ELF_COLOURS[r.slot % 4]}`;
    step.appendChild(block);
    podium.appendChild(step);
  }
  const rest = $("rest-list");
  rest.innerHTML = "";
  rows.slice(3).forEach((r, i) => {
    const li = document.createElement("li");
    const n = document.createElement("span");
    n.textContent = `${i + 4}.  ${r.name}`;
    const t = document.createElement("span");
    t.className = "t";
    t.textContent = `${r.gifts} sent · ${r.points} pts`;
    li.append(n, t);
    rest.appendChild(li);
  });

  $("again-btn").hidden = !isHost();
  $("again-wait").hidden = isHost();
}

function confetti() {
  const layer = document.createElement("div");
  layer.className = "confetti";
  document.body.appendChild(layer);
  const colours = ["#ffd56b", "#e8323c", "#34c472", "#ffffff"];
  for (let i = 0; i < 70; i++) {
    const d = document.createElement("div");
    const size = 6 + Math.random() * 8;
    Object.assign(d.style, {
      position: "absolute", left: Math.random() * 100 + "vw", top: "-20px",
      width: size + "px", height: size * (Math.random() < 0.5 ? 1 : 0.5) + "px",
      background: colours[i % colours.length], borderRadius: Math.random() < 0.4 ? "50%" : "2px",
    });
    layer.appendChild(d);
    d.animate(
      [
        { transform: "translate(0,0) rotate(0)" },
        { transform: `translate(${(Math.random() - 0.5) * 200}px, 110vh) rotate(${Math.random() * 900}deg)` },
      ],
      { duration: 2200 + Math.random() * 1800, delay: Math.random() * 600, easing: "cubic-bezier(.3,.6,.6,1)", fill: "forwards" }
    );
  }
  setTimeout(() => layer.remove(), 5000);
}

// ---------- Clock tick: host duties ----------
setInterval(() => {
  if (!room || !code) return;
  // Safety net: if the round is long over and nobody has closed it, the host does.
  if (isHost() && room.status === "playing" && backend.serverNow() > room.endsAt + 4000 && !game) {
    backend.update(roomPath(), { status: "results" });
  }
  maybeTakeOverHost();
}, 500);

function maybeTakeOverHost() {
  if (!room || isHost() || !me()?.online) return;
  const host = room.players?.[room.hostId];
  if (host?.online) { hostOfflineSince = 0; return; }
  if (!hostOfflineSince) hostOfflineSince = Date.now();
  if (Date.now() - hostOfflineSince < HOST_GRACE_MS) return;
  const next = onlinePlayers()[0];
  if (next?.[0] === backend.uid) {
    hostOfflineSince = 0;
    backend.set(roomPath("hostId"), backend.uid).catch(() => {});
  }
}

// ---------- Home screen ----------
function readName() {
  const name = $("name-input").value.trim().slice(0, 16);
  if (!name) {
    homeError("Enter your name first.");
    $("name-input").focus();
    return null;
  }
  store.set("gift-wrapper-name", name);
  return name;
}
function homeError(msg) { $("home-error").textContent = msg; }

/** Opened from an invite link: only show name + join. */
function setInviteMode(c) {
  const on = !!c;
  document.body.classList.toggle("invite", on);
  $("invite-head").hidden = !on;
  $("invite-code").textContent = c || "";
  $("invite-join-btn").hidden = !on;
  $("create-btn").hidden = on;
  $("join-divider").hidden = on;
  $("join-row").hidden = on;
  document.querySelector(".tagline").hidden = on;
}
function setBusy(b) { for (const id of ["create-btn", "join-btn", "invite-join-btn"]) $(id).disabled = b; }

$("create-btn").addEventListener("click", () => { homeError(""); createRoom(); });
$("join-btn").addEventListener("click", () => { homeError(""); joinRoom($("code-input").value); });
$("invite-join-btn").addEventListener("click", () => { homeError(""); joinRoom($("invite-code").textContent); });
$("name-input").addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !$("invite-join-btn").hidden) $("invite-join-btn").click();
});
$("code-input").addEventListener("input", (e) => { e.target.value = cleanCode(e.target.value); });
$("code-input").addEventListener("keydown", (e) => { if (e.key === "Enter") $("join-btn").click(); });
$("home-touch").addEventListener("click", () => selectMode("touch"));
$("home-keys").addEventListener("click", () => selectMode("keys"));
selectMode(selectedMode);
$("mode-change").addEventListener("click", switchControls);
$("difficulty").addEventListener("click", (e) => {
  const b = e.target.closest("[data-diff]");
  if (b) setDifficulty(b.dataset.diff);
});
$("start-btn").addEventListener("click", () => { unlockAudio(); startGame(); });
$("again-btn").addEventListener("click", playAgain);
$("leave-btn").addEventListener("click", leaveRoom);
$("leave-btn-2").addEventListener("click", leaveRoom);
$("share-btn").addEventListener("click", async () => {
  const url = inviteUrl(code);
  try {
    if (navigator.share) {
      await navigator.share({ title: "Master Gift Wrapper", text: `Join my workshop in Master Gift Wrapper: ${code}`, url });
    } else {
      await navigator.clipboard.writeText(url);
      $("share-note").textContent = "Link copied!";
      setTimeout(() => ($("share-note").textContent = ""), 2500);
    }
  } catch { /* share cancelled */ }
});
// The first touch anywhere switches sound on (browsers require a tap first).
window.addEventListener("pointerdown", unlockAudio, { passive: true });
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible" && game) keepAwake(true);
});

// Handy for testing from the browser console.
window.__mgw = { get game() { return game; }, get room() { return room; } };

// ---------- Boot ----------
async function boot() {
  show("home");
  $("name-input").value = store.get("gift-wrapper-name") || "";
  const roomParam = cleanCode(params.get("room"));
  if (roomParam) { $("code-input").value = roomParam; setInviteMode(roomParam); }

  const configured = firebaseConfig?.apiKey && !firebaseConfig.apiKey.startsWith("YOUR");
  const banner = $("mode-banner");
  setBusy(true);
  try {
    if (configured && !params.has("local")) {
      const { createFirebaseBackend } = await import("./backend-firebase.js");
      backend = await createFirebaseBackend(firebaseConfig);
      backend.onReconnect(() => {
        if (!code) return;
        backend.update(roomPath(`players/${backend.uid}`), { online: true });
        backend.onDisconnectSet(roomPath(`players/${backend.uid}/online`), false);
      });
    } else {
      backend = createLocalBackend();
      banner.hidden = false;
      banner.textContent = configured
        ? "Local demo mode: open more tabs on this device to add players."
        : "Local demo mode: add your Firebase config to play across phones. Open more tabs to add players.";
    }
  } catch (err) {
    console.error(err);
    banner.hidden = false;
    banner.textContent = "Couldn't connect to the game server. Check your connection and reload.";
    return;
  }
  setBusy(false);
}

boot();
