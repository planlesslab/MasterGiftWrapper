// Master Gift Wrapper: one round of play on this device.
// Moves your own elf, shows everyone else's, and (on the host's device) runs the workshop.

import { Workshop } from "./scene.js";
import { Input } from "./input.js";
import {
  COLS, SPAWNS, DIFFICULTY, GAME_MS, PAPER_HEX, TOY_EMOJI,
  isSolid, tileIdx, newGame, orderPoints, normalise, tickOrders, applyAction, actionLabel, describeItem,
} from "./rules.js";

const $ = (id) => document.getElementById(id);
const ELF_RADIUS = 0.3;
const ELF_SPEED = 4.4;       // squares per second
const POS_EVERY_MS = 90;     // how often we share our position
const STATE_EVERY_MS = 100;  // how often the host checks the order queue

// ---------- sound ----------
let audio = null;
export function unlockAudio() {
  try {
    audio = audio || new (window.AudioContext || window.webkitAudioContext)();
    if (audio.state === "suspended") audio.resume();
  } catch { /* no sound */ }
}
function beep(freq, len = 0.15, vol = 0.08, type = "triangle", delay = 0) {
  if (!audio) return;
  const t = audio.currentTime + delay;
  const o = audio.createOscillator(), g = audio.createGain();
  o.type = type; o.frequency.value = freq;
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t + len);
  o.connect(g).connect(audio.destination);
  o.start(t); o.stop(t + len + 0.05);
}
const SOUNDS = {
  grab: () => beep(660, 0.08), place: () => beep(440, 0.08), combine: () => { beep(660, 0.08); beep(880, 0.1, 0.08, "triangle", 0.07); },
  wrap: () => beep(300 + Math.random() * 80, 0.07, 0.07, "square"), wrapped: () => { beep(784, 0.1); beep(1046, 0.18, 0.09, "triangle", 0.09); },
  serve: () => [784, 988, 1318].forEach((f, i) => beep(f, 0.22, 0.1, "triangle", i * 0.09)),
  wrong: () => { beep(200, 0.25, 0.09, "sawtooth"); beep(150, 0.3, 0.09, "sawtooth", 0.12); },
  no: () => beep(180, 0.1, 0.05, "square"), miss: () => beep(220, 0.4, 0.06, "sine"), bin: () => beep(240, 0.12, 0.06, "square"),
  order: () => beep(1318, 0.12, 0.05), tick: () => beep(880, 0.12, 0.1), go: () => beep(1318, 0.5, 0.12),
};

export class Game {
  constructor({ backend, roomPath, room }) {
    this.backend = backend;
    this.roomPath = roomPath;
    this.round = room.round;
    this.uid = backend.uid;
    this.cfg = DIFFICULTY[room.difficulty] || DIFFICULTY.normal;
    this.room = room;
    this.seenFx = new Set();
    this.firstState = true;
    this.lastPos = 0;
    this.lastSent = "";
    this.target = null;
    this.over = false;
    this.lastCount = null;

    this.scene = new Workshop($("stage"));
    this.playing = !!room.participants?.[this.uid];
    const slot = room.slots?.[this.uid] ?? 0;
    const saved = room.players?.[this.uid]?.pos;
    this.me = { x: saved?.x ?? SPAWNS[slot % 4][0], z: saved?.z ?? SPAWNS[slot % 4][1], r: saved?.r ?? 0 };
    this.actN = room.players?.[this.uid]?.act?.n || 0;

    this.input = new Input({ stick: $("stick"), knob: $("stick-knob"), button: $("action-btn"), onAction: () => this.pressAction() });
    $("spectate").hidden = this.playing;
    $("controls").hidden = !this.playing;
    $("orders").innerHTML = "";
    $("popups").innerHTML = "";

    // Host bookkeeping.
    this.host = null;
    this.onRoom(room);
    this.layout();
    this.onLayout = () => this.layout();
    window.addEventListener("resize", this.onLayout);
    // The order tickets can wrap onto a second row on narrow phones.
    this.hudWatch = "ResizeObserver" in window ? new ResizeObserver(this.onLayout) : null;
    this.hudWatch?.observe($("hud"));
    try { screen.orientation?.lock?.("landscape")?.catch?.(() => {}); } catch { /* only some phones allow this */ }

    this.prev = performance.now();
    const loop = (t) => {
      if (this.dead) return;
      this.frame(Math.min(0.12, (t - this.prev) / 1000));
      this.prev = t;
      this.raf = requestAnimationFrame(loop);
    };
    this.raf = requestAnimationFrame(loop);
    // Host duties run on a timer so they keep going if the tab is in the background.
    this.timer = setInterval(() => this.hostTick(), STATE_EVERY_MS);
  }

  get isHost() { return this.room.hostId === this.uid; }
  get G() { return this.isHost && this.host ? this.host.G : this.shared; }
  now() { return this.backend.serverNow(); }
  live() { const n = this.now(); return n >= this.room.startAt && n < this.room.endsAt; }

  layout() {
    // Phones play in landscape. If the phone is held upright (or its rotation is locked),
    // the whole game is turned on its side so that turning the phone makes it right.
    const coarse = document.body.classList.contains("touch") || matchMedia("(pointer: coarse)").matches;
    const rotated = coarse && innerHeight > innerWidth;
    document.body.classList.toggle("rotated", rotated);
    this.input.rotated = rotated;
    if (rotated && !this.tipShown) {
      this.tipShown = true;
      $("rotate-tip").hidden = false;
      setTimeout(() => ($("rotate-tip").hidden = true), 6000);
    }
    if (!rotated) $("rotate-tip").hidden = true;
    this.scene.setInsets(Math.round($("hud").offsetHeight * 0.6), 10);
  }

  // ---------- room updates ----------
  onRoom(room) {
    this.room = room;
    this.shared = normalise(room.game ? JSON.parse(JSON.stringify(room.game)) : null);

    const elves = Object.keys(room.participants || {}).map((uid) => {
      const slot = room.slots?.[uid] ?? 0;
      const p = room.players?.[uid];
      const pos = uid === this.uid ? this.me : p?.pos || { x: SPAWNS[slot % 4][0], z: SPAWNS[slot % 4][1], r: 0 };
      return { uid, slot, name: p?.name || room.participants[uid], me: uid === this.uid, online: p?.online !== false, x: pos.x, z: pos.z, r: pos.r || 0 };
    });
    this.scene.setElves(elves);
    for (const e of elves) if (!e.me) this.scene.moveElf(e.uid, e.x, e.z, e.r, false);

    if (this.isHost) this.hostSync(room);
    this.refresh();
  }

  // ---------- host ----------
  hostSync(room) {
    if (!this.host) {
      // First time we are host this round (start of round, or took over from someone).
      const G = normalise(room.game ? JSON.parse(JSON.stringify(room.game)) : null) || newGame(room.startAt);
      this.host = { G, seen: {}, dirty: !room.game };
      for (const [uid, p] of Object.entries(room.players || {})) this.host.seen[uid] = p.act?.n || 0;
      return;
    }
    for (const uid of Object.keys(room.participants || {})) {
      if (uid === this.uid) continue;
      const act = room.players?.[uid]?.act;
      if (act && act.n > (this.host.seen[uid] || 0)) {
        this.host.seen[uid] = act.n;
        this.hostApply(uid, act.t);
      }
    }
    this.hostFlush();
  }
  hostFlush() {
    const h = this.host;
    if (!h?.dirty) return;
    h.dirty = false;
    this.backend.set(this.roomPath("game"), h.G);
  }
  hostApply(uid, tile) {
    if (!this.live() || typeof tile !== "number") return;
    if (applyAction(this.host.G, this.cfg, uid, tile, this.now())) this.host.dirty = true;
  }
  hostTick() {
    if (this.dead || !this.isHost || !this.host || this.room.status !== "playing") return;
    const now = this.now();
    const h = this.host;
    if (now >= this.room.endsAt) {
      if (this.over) return;
      this.over = true;
      const G = h.G;
      const key = this.room.difficulty || "normal";
      const best = Math.max(this.room.best?.[key] || 0, G.score);
      this.backend.update(this.roomPath(), {
        status: "results",
        game: G,
        result: { score: G.score, served: G.served, perfect: G.perfect, missed: G.missed, wrong: G.wrong, st: G.st, difficulty: key, newBest: G.score > (this.room.best?.[key] || 0) && G.score > 0 },
        [`best/${key}`]: best,
      });
      return;
    }
    if (now >= this.room.startAt) {
      const players = Object.keys(this.room.participants || {}).length;
      if (tickOrders(h.G, this.cfg, now, this.room.startAt, players)) h.dirty = true;
    }
    if (h.dirty) { this.hostFlush(); this.refresh(); }
  }

  // ---------- acting ----------
  pressAction() {
    unlockAudio();
    if (!this.playing || !this.live() || this.target == null) return;
    if (this.isHost && this.host) {
      this.hostApply(this.uid, this.target);
      this.hostFlush();
      this.refresh();
    } else {
      this.actN++;
      this.backend.set(this.roomPath(`players/${this.uid}/act`), { n: this.actN, t: this.target });
    }
    this.scene.bump(this.target);
  }

  findTarget() {
    const { x, z, r } = this.me;
    const px = x + Math.sin(r) * 0.62, pz = z + Math.cos(r) * 0.62;
    let best = null, bestD = 0.85;
    const c0 = Math.floor(px), r0 = Math.floor(pz);
    for (let rr = r0 - 1; rr <= r0 + 1; rr++) for (let cc = c0 - 1; cc <= c0 + 1; cc++) {
      if (!isSolid(cc, rr) || cc < 0 || rr < 0 || cc >= COLS) continue;
      // must be within arm's reach of the elf
      const nx = Math.max(cc, Math.min(x, cc + 1)), nz = Math.max(rr, Math.min(z, rr + 1));
      if (Math.hypot(x - nx, z - nz) > 0.55) continue;
      const d = Math.hypot(px - (cc + 0.5), pz - (rr + 0.5));
      if (d < bestD) { bestD = d; best = tileIdx(cc, rr); }
    }
    return best;
  }

  moveMe(dt) {
    const a = this.input.axis();
    if (!a.x && !a.y) return;
    // Screen directions -> workshop directions (the view turns sideways on tall phones).
    const cos = Math.cos(this.scene.yaw), sin = Math.sin(this.scene.yaw);
    const dx = a.x * cos - a.y * sin;
    const dz = -a.x * sin - a.y * cos;
    const m = this.me;
    m.r = Math.atan2(dx, dz);
    // Small steps, so a slow phone can't skip an elf through a worktop.
    const steps = Math.ceil(dt / 0.03);
    const step = (ELF_SPEED * dt) / steps;
    for (let i = 0; i < steps; i++) for (const [sx, sz] of [[dx * step, 0], [0, dz * step]]) {
      m.x += sx; m.z += sz;
      const c0 = Math.floor(m.x), r0 = Math.floor(m.z);
      for (let rr = r0 - 1; rr <= r0 + 1; rr++) for (let cc = c0 - 1; cc <= c0 + 1; cc++) {
        if (!isSolid(cc, rr)) continue;
        const nx = Math.max(cc, Math.min(m.x, cc + 1)), nz = Math.max(rr, Math.min(m.z, rr + 1));
        const ddx = m.x - nx, ddz = m.z - nz;
        const d = Math.hypot(ddx, ddz);
        if (d < ELF_RADIUS && d > 0.0001) { m.x = nx + (ddx / d) * ELF_RADIUS; m.z = nz + (ddz / d) * ELF_RADIUS; }
      }
    }
  }

  // ---------- every frame ----------
  frame(dt) {
    const now = this.now();
    const room = this.room;

    // countdown
    const cd = $("countdown");
    if (now < room.startAt) {
      const n = Math.ceil((room.startAt - now) / 1000);
      const label = n > 3 ? "" : String(n);
      cd.hidden = !label;
      if (label && label !== this.lastCount) {
        cd.textContent = label;
        cd.classList.remove("pop"); void cd.offsetWidth; cd.classList.add("pop");
        SOUNDS.tick();
      }
      this.lastCount = label;
    } else if (this.lastCount !== "go") {
      this.lastCount = "go";
      cd.hidden = true;
      SOUNDS.go();
    }

    if (this.playing && this.live()) {
      this.moveMe(dt);
      const s = `${this.me.x.toFixed(2)},${this.me.z.toFixed(2)},${this.me.r.toFixed(2)}`;
      if (s !== this.lastSent && now - this.lastPos > POS_EVERY_MS) {
        this.lastSent = s; this.lastPos = now;
        this.backend.set(this.roomPath(`players/${this.uid}/pos`), { x: +this.me.x.toFixed(2), z: +this.me.z.toFixed(2), r: +this.me.r.toFixed(2) });
      }
    }
    this.scene.moveElf(this.uid, this.me.x, this.me.z, this.me.r, true);

    const target = this.playing && this.live() ? this.findTarget() : null;
    if (target !== this.target) { this.target = target; this.scene.setTarget(target); this.updateButton(); }

    // clock
    const left = Math.max(0, Math.min(GAME_MS, room.endsAt - now));
    const secs = Math.ceil(left / 1000);
    $("hud-time").textContent = `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, "0")}`;
    $("hud-time").classList.toggle("urgent", secs <= 10 && now >= room.startAt);
    if (now >= room.endsAt && !this.timeUp) { this.timeUp = true; $("countdown").hidden = false; $("countdown").textContent = "⏰"; $("countdown").classList.add("small"); }

    // order timers
    for (const el of $("orders").children) {
      const exp = +el.dataset.exp, at = +el.dataset.at;
      const k = Math.max(0, Math.min(1, (exp - now) / (exp - at)));
      el.firstElementChild.style.width = k * 100 + "%";
      el.classList.toggle("late", k < 0.25);
    }

    this.scene.render(dt);
  }

  // ---------- drawing the shared state ----------
  refresh() {
    const G = this.G;
    if (!G) return;
    this.scene.setState(G, this.cfg.taps);
    $("hud-score").textContent = G.score;
    this.drawOrders(G);
    this.updateButton();

    for (const fx of Object.values(G.fx)) {
      if (this.seenFx.has(fx.id)) continue;
      this.seenFx.add(fx.id);
      if (this.firstState || this.now() - fx.at > 2500) continue; // old news (e.g. after a reload)
      this.playFx(fx);
    }
    this.firstState = false;
  }

  playFx(fx) {
    const mine = fx.uid === this.uid;
    if (fx.k === "serve") {
      SOUNDS.serve();
      this.scene.sendToSleigh(fx.gift, fx.tile);
      this.popup(fx.tile, `+${fx.p}${fx.perfect ? " Perfect!" : fx.off ? " (decoration wrong)" : ""}${fx.fast ? " ⚡" : ""}`, fx.perfect ? "gold" : "good");
      $("hud-score").classList.remove("bump"); void $("hud-score").offsetWidth; $("hud-score").classList.add("bump");
    } else if (fx.k === "wrong") {
      SOUNDS.wrong();
      this.popup(fx.tile, (fx.why === "unfinished" ? "Wrap it first!" : "No order for that!") + (fx.p ? ` −${fx.p}` : ""), "bad");
    } else if (fx.k === "miss") {
      this.toast(fx.p ? `Order missed −${fx.p}` : "Order missed", "bad");
      SOUNDS.miss();
    } else if (fx.k === "order") {
      SOUNDS.order();
    } else if (mine || fx.k === "wrapped") {
      SOUNDS[fx.k]?.();
      if (fx.k === "no" && navigator.vibrate) navigator.vibrate(30);
    }
    if (fx.k === "wrap" || fx.k === "wrapped") this.scene.bump(fx.tile);
  }

  /** A message under the order tickets, for things that didn't happen at a station. */
  toast(text, cls) {
    const el = document.createElement("div");
    el.className = `popup ${cls}`;
    el.textContent = text;
    el.style.left = "50%";
    el.style.top = $("hud").offsetTop + $("hud").offsetHeight + 34 + "px";
    $("popups").appendChild(el);
    setTimeout(() => el.remove(), 1500);
  }

  popup(tile, text, cls) {
    const p = this.scene.project((tile % COLS) + 0.5, 1.6, Math.floor(tile / COLS) + 0.5);
    const el = document.createElement("div");
    el.className = `popup ${cls}`;
    el.textContent = text;
    el.style.left = Math.max(70, Math.min($("stage").clientWidth - 70, p.x)) + "px";
    el.style.top = Math.max(90, p.y) + "px";
    $("popups").appendChild(el);
    setTimeout(() => el.remove(), 1500);
  }

  drawOrders(G) {
    const box = $("orders");
    const want = Object.values(G.o).sort((a, b) => a.id - b.id);
    const have = new Map([...box.children].map((el) => [el.dataset.id, el]));
    for (const o of want) {
      if (have.has(String(o.id))) { have.delete(String(o.id)); continue; }
      const el = document.createElement("div");
      el.className = "order";
      el.dataset.id = o.id; el.dataset.exp = o.exp; el.dataset.at = o.at;
      const bar = document.createElement("i");
      const toy = document.createElement("span");
      toy.className = "order-toy";
      toy.textContent = TOY_EMOJI[o.toy];
      const gift = document.createElement("span");
      gift.className = "gp" + (o.paper ? "" : " plain") + (o.rib ? " rib" : "") + (o.bow ? " bow" : "");
      if (o.paper) gift.style.background = PAPER_HEX[o.paper];
      if (o.bow) gift.appendChild(Object.assign(document.createElement("b"), { className: "bowtie" }));
      const words = document.createElement("small");
      words.textContent = [o.paper || "box only", o.rib && "ribbon", o.bow && "bow"].filter(Boolean).join(" + ");
      const worth = document.createElement("em");
      worth.textContent = orderPoints(o);
      words.appendChild(worth);
      el.append(bar, toy, gift, words);
      box.appendChild(el);
    }
    for (const el of have.values()) el.remove();
  }

  updateButton() {
    const G = this.G;
    const label = G && this.playing ? actionLabel(G, this.cfg, this.uid, this.target) : "";
    const btn = $("action-btn");
    btn.textContent = label || "✋";
    btn.classList.toggle("ready", !!label);
    const held = G?.h?.[this.uid];
    $("hint").textContent = !this.playing ? "" : label ? `${label}` : held ? describeItem(held, this.cfg) : "Check the orders, then fetch a box and a toy";
    $("hint").classList.toggle("do", !!label);
  }

  destroy() {
    this.dead = true;
    cancelAnimationFrame(this.raf);
    clearInterval(this.timer);
    window.removeEventListener("resize", this.onLayout);
    this.hudWatch?.disconnect();
    this.input.destroy();
    this.scene.destroy();
    $("countdown").hidden = true;
    $("countdown").classList.remove("small");
    $("rotate-tip").hidden = true;
    document.body.classList.remove("rotated");
  }
}
