// Master Gift Wrapper: the rules of the game.
// Pure logic, no drawing and no networking, so it is easy to tweak.

// ---------- Workshop layout ----------
// Each letter is one floor square.
//   .  floor            #  worktop (put things down here)
//   T U V  toy crates   B  box stack
//   1 2 3 4  paper      R  ribbon      O  bows
//   W  wrapping table   D  dispatch    X  bin
export const MAP = [
  "#TUV#BB#1234RO#",
  "#.............#",
  "#.............#",
  "#..##.WW.##...D",
  "#.............D",
  "#.............D",
  "#..##.WW.##...#",
  "#.............#",
  "#.............X",
  "###############",
];
export const COLS = MAP[0].length;
export const ROWS = MAP.length;
export const SPAWNS = [[2.5, 4.5], [5.5, 5.5], [8.5, 4.5], [11.5, 5.5]];

export const TOYS = { T: "teddy", U: "ball", V: "car" };
export const PAPERS = { 1: "red", 2: "green", 3: "blue", 4: "purple" };
export const TOY_LIST = Object.values(TOYS);
export const PAPER_LIST = Object.values(PAPERS);
export const TOY_EMOJI = { teddy: "🧸", ball: "⚽", car: "🚗" };
export const PAPER_HEX = { red: "#e23b3b", green: "#2fa35a", blue: "#3b82e6", purple: "#a05be0" };

export const GAME_MS = 180_000; // every shift lasts exactly 3 minutes
export const MAX_PLAYERS = 4;

export const tileAt = (c, r) => (r < 0 || r >= ROWS || c < 0 || c >= COLS ? "#" : MAP[r][c]);
export const tileIdx = (c, r) => r * COLS + c;
export const tileOf = (i) => MAP[Math.floor(i / COLS)]?.[i % COLS] ?? "#";
export const isSolid = (c, r) => tileAt(c, r) !== ".";

// ---------- Difficulty ----------
// taps: taps needed to wrap a present.     life: seconds before an order expires.
// gap:  seconds between new orders at the start and at the end of the shift.
// max:  most orders waiting at once.       pace: how early the harder orders arrive.
// bounce: wrong presents come back to your hands instead of being lost.
export const DIFFICULTY = {
  easy:   { label: "Easy",   emoji: "🧸", taps: 3, life: 110, gap: [20, 13], max: 3, pace: 1.3, bounce: true },
  normal: { label: "Normal", emoji: "🎁", taps: 4, life: 75,  gap: [16, 8.5], max: 5, pace: 1.0, bounce: false },
  chaos:  { label: "Chaos",  emoji: "🔥", taps: 5, life: 52,  gap: [11, 5],  max: 6, pace: 0.7, bounce: false },
};
// Fewer elves means orders arrive more slowly.
const PLAYER_PACE = [1.6, 1.6, 1.15, 0.95, 0.8];

export const POINTS_CORRECT = 10;
export const POINTS_PERFECT = 5;

// ---------- Items ----------
// {k:"toy",v} {k:"box"} {k:"paper",v} {k:"ribbon"} {k:"bow"}
// {k:"gift", toy, paper?, w (wrap taps done), rib?, bow?}
export function dispense(type) {
  if (TOYS[type]) return { k: "toy", v: TOYS[type] };
  if (PAPERS[type]) return { k: "paper", v: PAPERS[type] };
  if (type === "B") return { k: "box" };
  if (type === "R") return { k: "ribbon" };
  if (type === "O") return { k: "bow" };
  return null;
}

export const isWrapped = (g, taps) => g?.k === "gift" && !!g.paper && (g.w || 0) >= taps;
export const needsWrap = (g, taps) => g?.k === "gift" && !!g.paper && (g.w || 0) < taps;

/** Put two things together. Returns the new item, or null if they don't fit. */
export function combine(a, b, taps) {
  if (!a || !b) return null;
  for (const [x, y] of [[a, b], [b, a]]) {
    if (x.k === "box" && y.k === "toy") return { k: "gift", toy: y.v, w: 0 };
    if (x.k === "gift" && y.k === "paper" && !x.paper) return { ...x, paper: y.v, w: 0 };
    if (x.k === "gift" && y.k === "ribbon" && isWrapped(x, taps) && !x.rib) return { ...x, rib: true };
    if (x.k === "gift" && y.k === "bow" && isWrapped(x, taps) && !x.bow) return { ...x, bow: true };
  }
  return null;
}

// ---------- Game state ----------
export function newGame(now) {
  return { t: {}, h: {}, o: {}, fx: {}, st: {}, nid: 1, fid: 1, nextAt: now, score: 0, served: 0, perfect: 0, missed: 0, wrong: 0 };
}
/** The database drops empty lists, so put them back after reading. */
export function normalise(g) {
  if (!g) return null;
  // It also hands back number-keyed lists as arrays with gaps, so turn those back into objects.
  const fix = (v) => (Array.isArray(v) ? Object.fromEntries(v.map((x, i) => [i, x]).filter(([, x]) => x != null)) : v || {});
  for (const k of ["t", "h", "o", "fx", "st"]) g[k] = fix(g[k]);
  return g;
}

function addFx(G, now, fx) {
  const id = G.fid++;
  G.fx[id] = { id, at: now, ...fx };
  for (const k of Object.keys(G.fx)) if (now - G.fx[k].at > 4000) delete G.fx[k];
}

// ---------- Orders ----------
function orderLevel(frac, pace, rnd) {
  const f = frac / pace;
  const r = rnd();
  if (f < 0.15) return 0;                                  // toy in a box
  if (f < 0.4) return r < 0.25 ? 0 : 1;                    // + wrapping paper
  if (f < 0.7) return r < 0.1 ? 0 : r < 0.45 ? 1 : 2;      // + ribbon or bow
  return r < 0.2 ? 1 : r < 0.6 ? 2 : 3;                    // + ribbon and bow
}

export function makeOrder(G, cfg, now, frac, rnd = Math.random) {
  const level = orderLevel(frac, cfg.pace, rnd);
  const pick = (list) => list[Math.floor(rnd() * list.length)];
  const o = { id: G.nid++, toy: pick(TOY_LIST), at: now, exp: now + (cfg.life + level * 8) * 1000 };
  if (level >= 1) o.paper = pick(PAPER_LIST);
  if (level === 2) { if (rnd() < 0.5) o.rib = true; else o.bow = true; }
  if (level === 3) { o.rib = true; o.bow = true; }
  return o;
}

/** Host calls this a few times a second. Returns true if anything changed. */
export function tickOrders(G, cfg, now, startAt, players, rnd = Math.random) {
  let changed = false;
  for (const id of Object.keys(G.o)) {
    if (now >= G.o[id].exp) {
      delete G.o[id];
      G.missed++;
      addFx(G, now, { k: "miss" });
      changed = true;
    }
  }
  const frac = Math.min(1, Math.max(0, (now - startAt) / GAME_MS));
  const waiting = Object.keys(G.o).length;
  if (now >= G.nextAt || waiting === 0) {
    if (waiting < cfg.max) {
      let o = makeOrder(G, cfg, now, frac, rnd);
      // Avoid two identical orders in the queue where we can.
      const same = (a, b) => a.toy === b.toy && a.paper === b.paper && !!a.rib === !!b.rib && !!a.bow === !!b.bow;
      for (let i = 0; i < 4 && Object.values(G.o).some((x) => same(x, o)); i++) { G.nid--; o = makeOrder(G, cfg, now, frac, rnd); }
      G.o[o.id] = o;
      addFx(G, now, { k: "order" });
      changed = true;
    }
    const gap = (cfg.gap[0] + (cfg.gap[1] - cfg.gap[0]) * frac) * (PLAYER_PACE[players] || 1);
    // The second order comes quickly so nobody stands around at the start.
    G.nextAt = now + (G.nid === 2 ? Math.min(gap, 7) : gap) * 1000;
    changed = true;
  }
  return changed;
}

function dispatch(G, cfg, uid, gift, now, tile) {
  if (needsWrap(gift, cfg.taps)) return "unfinished";
  const fits = Object.values(G.o).filter((o) => o.toy === gift.toy && (o.paper || null) === (gift.paper || null));
  if (!fits.length) return "wrong";
  const exact = (o) => !!o.rib === !!gift.rib && !!o.bow === !!gift.bow;
  fits.sort((a, b) => (exact(b) - exact(a)) || (a.exp - b.exp));
  const o = fits[0];
  const perfect = exact(o) && (o.rib || o.bow);
  const pts = POINTS_CORRECT + (perfect ? POINTS_PERFECT : 0);
  delete G.o[o.id];
  G.score += pts;
  G.served++;
  if (perfect) G.perfect++;
  const st = (G.st[uid] = G.st[uid] || { g: 0, p: 0 });
  st.g++; st.p += pts;
  addFx(G, now, { k: "serve", uid, tile, p: pts, perfect: !!perfect, gift });
  return "serve";
}

/**
 * A player pressed the action button while facing a square.
 * Changes G and returns what happened (or null if nothing did).
 */
export function applyAction(G, cfg, uid, tile, now) {
  const type = tileOf(tile);
  if (type === ".") return null;
  const held = G.h[uid] || null;
  const on = G.t[tile] || null;
  const fx = (k, extra) => { addFx(G, now, { k, uid, tile, ...extra }); return k; };
  const no = () => fx("no");

  const fresh = dispense(type);
  if (fresh) {
    if (!held) { G.h[uid] = fresh; return fx("grab"); }
    const c = combine(held, fresh, cfg.taps);
    if (!c) return no();
    G.h[uid] = c;
    return fx("combine");
  }

  if (type === "D") {
    if (held?.k !== "gift") return no();
    const res = dispatch(G, cfg, uid, held, now, tile);
    if (res === "serve") { delete G.h[uid]; return res; }
    if (!cfg.bounce) { delete G.h[uid]; G.wrong++; }
    return fx("wrong", { why: res });
  }

  if (type === "X") {
    if (!held) return no();
    delete G.h[uid];
    return fx("bin");
  }

  // Worktops and wrapping tables.
  if (held && !on) { G.t[tile] = held; delete G.h[uid]; return fx("place"); }
  if (held && on) {
    const c = combine(on, held, cfg.taps);
    if (!c) return no();
    G.t[tile] = c; delete G.h[uid];
    return fx("combine");
  }
  if (!held && on) {
    if (type === "W" && needsWrap(on, cfg.taps)) {
      on.w = (on.w || 0) + 1;
      return fx(on.w >= cfg.taps ? "wrapped" : "wrap");
    }
    G.h[uid] = on; delete G.t[tile];
    return fx("grab");
  }
  return null;
}

/** Short label for the action button, so players know what a press will do. */
export function actionLabel(G, cfg, uid, tile) {
  if (tile == null || !G) return "";
  const type = tileOf(tile);
  const held = G.h[uid] || null;
  const on = G.t[tile] || null;
  const fresh = dispense(type);
  if (fresh) {
    if (!held) return "Grab";
    return combine(held, fresh, cfg.taps) ? (fresh.k === "paper" ? "Add paper" : fresh.k === "toy" || fresh.k === "box" ? "Pack" : "Decorate") : "";
  }
  if (type === "D") return held?.k === "gift" ? "Send!" : "";
  if (type === "X") return held ? "Bin it" : "";
  if (held && !on) return "Put down";
  if (held && on) return combine(on, held, cfg.taps) ? "Add" : "";
  if (!held && on) return type === "W" && needsWrap(on, cfg.taps) ? "Wrap!" : "Pick up";
  return "";
}

/** One-line tip for a gift that still needs something, shown to new players. */
export function describeItem(it, cfg) {
  if (!it) return "";
  if (it.k === "toy") return "Put it in a box";
  if (it.k === "box") return "Add a toy";
  if (it.k === "paper") return "Put it on a boxed toy";
  if (it.k === "ribbon" || it.k === "bow") return "Add to a wrapped present";
  if (needsWrap(it, cfg.taps)) return "Wrap it at a green table";
  return "Check the orders, then dispatch";
}
