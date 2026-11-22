// Master Gift Wrapper: the 3D workshop (Three.js).
// Draws whatever the game state says; it makes no game decisions itself.

import * as THREE from "./vendor/three.module.min.js";
import { MAP, COLS, ROWS, TOYS, PAPERS, PAPER_HEX, TOY_EMOJI, tileOf, needsWrap } from "./rules.js";

export function supportsWebGL() {
  try {
    const c = document.createElement("canvas");
    return !!(c.getContext("webgl2") || c.getContext("webgl"));
  } catch { return false; }
}

const TOP = 0.8; // worktop height
export const ELF_COLOURS = ["#5fb4f0", "#ff8fb0", "#ffd24a", "#8fdc5a"];
const HAT_COLOURS = ["#2f9e4f", "#d8343a", "#d8343a", "#2f9e4f"];
const CARD = "#c89a62";
const GOLD = "#f5c542";
const CREAM = "#fff3d6";

// ---------- small helpers ----------
const matCache = new Map();
function mat(color, opts = {}) {
  const key = color + JSON.stringify(opts);
  if (!matCache.has(key)) matCache.set(key, new THREE.MeshStandardMaterial({ color, roughness: 0.75, metalness: 0, ...opts }));
  return matCache.get(key);
}
const geoCache = new Map();
function geo(kind, ...a) {
  const key = kind + a.join(",");
  if (!geoCache.has(key)) {
    const G = { box: THREE.BoxGeometry, sph: THREE.SphereGeometry, cyl: THREE.CylinderGeometry, cone: THREE.ConeGeometry, tor: THREE.TorusGeometry }[kind];
    geoCache.set(key, new G(...a));
  }
  return geoCache.get(key);
}
function mesh(g, m, x = 0, y = 0, z = 0, shadow = true) {
  const o = new THREE.Mesh(g, m);
  o.position.set(x, y, z);
  o.castShadow = shadow;
  o.receiveShadow = true;
  return o;
}
const box = (w, h, d, color, x, y, z, opts) => mesh(geo("box", w, h, d), mat(color, opts), x, y, z);
const ball = (r, color, x, y, z, opts) => mesh(geo("sph", r, 20, 14), mat(color, opts), x, y, z);

const texCache = new Map();
/** A round speech-bubble sign with a drawing in it. */
function signTexture(key, draw) {
  if (texCache.has(key)) return texCache.get(key);
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const g = c.getContext("2d");
  g.fillStyle = "rgba(255,255,255,0.94)";
  g.strokeStyle = "rgba(90,60,30,0.55)";
  g.lineWidth = 5;
  g.beginPath();
  g.roundRect(8, 6, 112, 100, 26);
  g.fill(); g.stroke();
  g.beginPath(); g.moveTo(50, 104); g.lineTo(64, 124); g.lineTo(78, 104); g.closePath();
  g.fillStyle = "rgba(255,255,255,0.94)"; g.fill();
  draw(g);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  texCache.set(key, t);
  return t;
}
function drawEmoji(g, text) {
  g.font = '62px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif';
  g.textAlign = "center"; g.textBaseline = "middle"; g.fillStyle = "#333";
  g.fillText(text, 64, 60);
}
function drawGift(g, color, rib, bow) {
  g.fillStyle = color; g.beginPath(); g.roundRect(34, 34, 60, 54, 8); g.fill();
  if (rib) { g.fillStyle = GOLD; g.fillRect(58, 34, 12, 54); g.fillRect(34, 55, 60, 12); }
  if (bow) {
    g.fillStyle = CREAM; g.strokeStyle = "#c9a45a"; g.lineWidth = 3;
    for (const dx of [-14, 14]) { g.beginPath(); g.ellipse(64 + dx, 30, 13, 9, dx > 0 ? -0.4 : 0.4, 0, 7); g.fill(); g.stroke(); }
    g.beginPath(); g.arc(64, 32, 6, 0, 7); g.fill(); g.stroke();
  }
}
function sprite(tex, size, y) {
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true }));
  s.scale.set(size, size, 1);
  s.position.y = y;
  s.renderOrder = 10;
  return s;
}
function labelSprite(text, color) {
  const c = document.createElement("canvas");
  c.width = 256; c.height = 64;
  const g = c.getContext("2d");
  g.font = "700 30px system-ui, sans-serif";
  const w = Math.min(240, g.measureText(text).width + 28);
  g.fillStyle = "rgba(20,12,8,0.7)";
  g.beginPath(); g.roundRect(128 - w / 2, 10, w, 44, 22); g.fill();
  g.fillStyle = color; g.textAlign = "center"; g.textBaseline = "middle";
  g.fillText(text, 128, 33, 220);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  const s = sprite(t, 1, 1.62);
  s.scale.set(1.5, 0.375, 1);
  return s;
}

// ---------- models ----------
function toyModel(kind) {
  const g = new THREE.Group();
  if (kind === "teddy") {
    const fur = "#a8692f";
    g.add(ball(0.17, fur, 0, 0.17, 0), ball(0.13, fur, 0, 0.4, 0));
    g.add(ball(0.05, fur, -0.1, 0.5, 0), ball(0.05, fur, 0.1, 0.5, 0));
    g.add(ball(0.06, "#e2b885", 0, 0.37, 0.1), ball(0.022, "#2a1a10", 0, 0.39, 0.155));
    g.add(ball(0.02, "#2a1a10", -0.05, 0.44, 0.105), ball(0.02, "#2a1a10", 0.05, 0.44, 0.105));
    for (const sx of [-1, 1]) g.add(ball(0.065, fur, sx * 0.17, 0.24, 0.04), ball(0.07, fur, sx * 0.1, 0.06, 0.1));
  } else if (kind === "ball") {
    g.add(ball(0.2, "#fafafa", 0, 0.2, 0, { roughness: 0.4 }));
    const dots = [[0, 0.4, 0], [0.17, 0.27, 0.07], [-0.17, 0.27, 0.07], [0, 0.27, 0.18], [0.1, 0.27, -0.16], [-0.1, 0.27, -0.16], [0.12, 0.1, 0.14], [-0.12, 0.1, 0.14]];
    for (const [x, y, z] of dots) g.add(ball(0.06, "#22242a", x * 0.9, 0.2 + (y - 0.2) * 0.9, z * 0.9));
  } else {
    g.add(box(0.44, 0.13, 0.24, "#e0393e", 0, 0.14, 0, { roughness: 0.35 }));
    g.add(box(0.22, 0.12, 0.2, "#9fd8ff", -0.02, 0.26, 0, { roughness: 0.2 }));
    g.add(box(0.24, 0.03, 0.22, "#e0393e", -0.02, 0.33, 0, { roughness: 0.35 }));
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      const w = mesh(geo("cyl", 0.07, 0.07, 0.05, 14), mat("#26262b"), sx * 0.14, 0.07, sz * 0.13);
      w.rotation.x = Math.PI / 2;
      g.add(w);
    }
  }
  return g;
}

function bowModel(scale = 1) {
  const g = new THREE.Group();
  for (const sx of [-1, 1]) {
    const loop = mesh(geo("tor", 0.07, 0.03, 8, 16), mat(CREAM, { roughness: 0.4 }), sx * 0.08, 0.06, 0);
    loop.rotation.y = Math.PI / 2 + sx * 0.5;
    loop.rotation.z = sx * 0.3;
    g.add(loop);
  }
  g.add(ball(0.045, CREAM, 0, 0.05, 0, { roughness: 0.4 }));
  g.scale.setScalar(scale);
  return g;
}

function tagSprite(toy) {
  return sprite(signTexture("toy" + toy, (g) => drawEmoji(g, TOY_EMOJI[toy])), 0.42, 0.86);
}

/** Build the model for any item. It stands on y = 0. */
function itemModel(it, taps) {
  const g = new THREE.Group();
  if (it.k === "toy") { g.add(toyModel(it.v)); return g; }
  if (it.k === "box") {
    g.add(box(0.5, 0.34, 0.5, CARD, 0, 0.17, 0));
    g.add(box(0.42, 0.02, 0.42, "#6b4a2b", 0, 0.345, 0));
    for (const s of [-1, 1]) {
      const f = box(0.5, 0.02, 0.2, "#d6ab74", 0, 0.37, s * 0.33);
      f.rotation.x = s * 0.7;
      g.add(f);
    }
    return g;
  }
  if (it.k === "paper") {
    const roll = mesh(geo("cyl", 0.09, 0.09, 0.62, 16), mat(PAPER_HEX[it.v], { roughness: 0.5 }), 0, 0.1, 0);
    roll.rotation.z = Math.PI / 2;
    const core = mesh(geo("cyl", 0.04, 0.04, 0.64, 10), mat("#f3e6cf"), 0, 0.1, 0);
    core.rotation.z = Math.PI / 2;
    g.add(roll, core);
    return g;
  }
  if (it.k === "ribbon") {
    const spool = mesh(geo("cyl", 0.15, 0.15, 0.16, 18), mat(GOLD, { roughness: 0.3, metalness: 0.3 }), 0, 0.12, 0);
    g.add(spool);
    g.add(mesh(geo("cyl", 0.19, 0.19, 0.03, 18), mat("#b98455"), 0, 0.02, 0), mesh(geo("cyl", 0.19, 0.19, 0.03, 18), mat("#b98455"), 0, 0.22, 0));
    return g;
  }
  if (it.k === "bow") { const b = bowModel(1.7); b.position.y = 0.02; g.add(b); return g; }

  // A gift at some stage.
  const W = 0.52, H = 0.4;
  if (!it.paper) {
    // Toy sitting in an open box.
    g.add(box(W, 0.3, W, CARD, 0, 0.15, 0));
    g.add(box(W - 0.08, 0.02, W - 0.08, "#6b4a2b", 0, 0.305, 0));
    const toy = toyModel(it.toy);
    toy.scale.setScalar(0.72);
    toy.position.y = 0.2;
    g.add(toy);
    return g;
  }
  const colour = PAPER_HEX[it.paper];
  const done = !needsWrap(it, taps);
  if (!done) {
    // Paper climbs up the box with every wrap tap.
    const p = Math.max(0.12, (it.w || 0) / taps);
    g.add(box(W, H, W, CARD, 0, H / 2, 0));
    g.add(box(0.8, 0.012, 0.8, colour, 0, 0.008, 0, { roughness: 0.5 }));
    g.add(box(W + 0.02, H * p, W + 0.02, colour, 0, (H * p) / 2, 0, { roughness: 0.5 }));
    // progress pips
    for (let i = 0; i < taps; i++) {
      g.add(ball(0.045, i < (it.w || 0) ? "#ffe27a" : "#5b4636", (i - (taps - 1) / 2) * 0.13, 0.56, 0, i < (it.w || 0) ? { emissive: "#ffb300", emissiveIntensity: 0.8 } : {}));
    }
  } else {
    g.add(box(W, H, W, colour, 0, H / 2, 0, { roughness: 0.45 }));
    g.add(box(W + 0.04, 0.09, W + 0.04, colour, 0, H - 0.02, 0, { roughness: 0.45 }));
    // little dots so the paper looks printed
    for (const [x, y] of [[-0.14, 0.12], [0.12, 0.2], [-0.05, 0.27], [0.16, 0.08]]) {
      g.add(ball(0.025, "#ffffff", x, y, W / 2 + 0.003, { roughness: 0.5 }), ball(0.025, "#ffffff", W / 2 + 0.003, y, x));
    }
    if (it.rib) {
      const m = { roughness: 0.3, metalness: 0.35 };
      g.add(box(0.1, H + 0.08, W + 0.06, GOLD, 0, H / 2 + 0.01, 0, m), box(W + 0.06, H + 0.08, 0.1, GOLD, 0, H / 2 + 0.01, 0, m));
    }
    if (it.bow) { const b = bowModel(1.6); b.position.y = H + 0.03; g.add(b); }
  }
  g.add(tagSprite(it.toy));
  return g;
}

function elfModel(slot) {
  const g = new THREE.Group();
  const body = new THREE.Group();
  const skin = ELF_COLOURS[slot % 4];
  const b = ball(0.36, skin, 0, 0.4, 0, { roughness: 0.22, metalness: 0.05 });
  b.scale.y = 0.94;
  body.add(b);
  // glowing happy face
  const glow = mat("#e8fbff", { emissive: "#7fe9ff", emissiveIntensity: 1.6 });
  for (const sx of [-1, 1]) {
    const eye = mesh(geo("tor", 0.06, 0.02, 6, 12, Math.PI), glow, sx * 0.13, 0.56, 0.29, false);
    eye.rotation.x = -0.75;
    body.add(eye);
  }
  const mouth = mesh(geo("tor", 0.075, 0.02, 6, 12, Math.PI), glow, 0, 0.46, 0.345, false);
  mouth.rotation.z = Math.PI;
  mouth.rotation.x = -0.35;
  body.add(mouth);
  // ears
  for (const sx of [-1, 1]) {
    const ear = mesh(geo("cone", 0.07, 0.24, 10), mat("#f0a04b", { roughness: 0.5 }), sx * 0.4, 0.46, 0);
    ear.rotation.z = -sx * 1.25;
    body.add(ear);
  }
  // hat
  const hat = new THREE.Group();
  hat.add(mesh(geo("cone", 0.2, 0.36, 16), mat(HAT_COLOURS[slot % 4], { roughness: 0.8 }), 0, 0.18, 0));
  hat.add(mesh(geo("tor", 0.19, 0.055, 8, 20), mat("#ffffff", { roughness: 0.9 }), 0, 0.02, 0));
  hat.children[1].rotation.x = Math.PI / 2;
  hat.add(ball(0.065, GOLD, 0, 0.38, 0, { metalness: 0.4, roughness: 0.3 }));
  hat.position.set(0, 0.66, -0.16);
  hat.rotation.set(-0.55, 0, 0.18);
  body.add(hat);
  // arms
  const arms = [];
  for (const sx of [-1, 1]) {
    const arm = mesh(geo("sph", 0.075, 10, 8), mat("#f4f4f4", { roughness: 0.4 }), sx * 0.3, 0.3, 0.2);
    body.add(arm);
    arms.push(arm);
  }
  body.scale.setScalar(1.18);
  g.add(body);
  g.userData = { body, arms };
  return g;
}

function zoneColour(c, r) {
  let col;
  if (r <= 2) col = c <= 4 ? "#8fb9ea" : c <= 7 ? "#f1c79c" : c <= 11 ? "#c9a0ea" : "#f3d572";
  else if (r <= 6 && c >= 5 && c <= 8) col = "#a3d99d";
  else if (r >= 2 && r <= 6 && c >= 11) col = "#f3a9a2";
  else col = "#e3c59a";
  const k = new THREE.Color(col);
  if ((c + r) % 2) k.multiplyScalar(0.93);
  return k;
}

// ---------- the workshop ----------
export class Workshop {
  constructor(container) {
    this.container = container;
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.15;
    this.renderer.domElement.className = "workshop3d";
    container.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color("#2a1810");
    this.camera = new THREE.OrthographicCamera(-10, 10, 10, -10, 0.1, 200);
    this.portrait = false;
    this.insets = { top: 0, bottom: 0 };

    this.tileItems = new Map();  // tile index -> { key, obj }
    this.elves = new Map();      // uid -> elf record
    this.anims = [];
    this.time = 0;
    this.taps = 4;

    this.buildRoom();
    this.buildBoard();
    this.buildLights();

    this.highlight = new THREE.Group();
    const edge = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(1.02, TOP + 0.04, 1.02)), new THREE.LineBasicMaterial({ color: "#fff3a0" }));
    edge.position.y = (TOP + 0.04) / 2;
    const glow = new THREE.Mesh(new THREE.PlaneGeometry(0.98, 0.98), new THREE.MeshBasicMaterial({ color: "#fff3a0", transparent: true, opacity: 0.35, depthWrite: false }));
    glow.rotation.x = -Math.PI / 2;
    glow.position.y = TOP + 0.03;
    this.highlight.add(edge, glow);
    this.highlight.userData.glow = glow;
    this.highlight.visible = false;
    this.scene.add(this.highlight);

    this.onResize = () => this.resize();
    window.addEventListener("resize", this.onResize);
    this.resize();
  }

  buildLights() {
    this.scene.add(new THREE.HemisphereLight("#ffe9cf", "#5a3b2a", 0.95));
    const sun = new THREE.DirectionalLight("#fff1dc", 1.7);
    sun.position.set(1, 14, 11);
    sun.target.position.set(8, 0, 5);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1536, 1536);
    Object.assign(sun.shadow.camera, { left: -12, right: 12, top: 10, bottom: -10, near: 1, far: 40 });
    sun.shadow.camera.updateProjectionMatrix();
    sun.shadow.bias = -0.0015;
    sun.shadow.radius = 4;
    this.scene.add(sun, sun.target);
    this.fire = new THREE.PointLight("#ff9440", 30, 9, 1.6);
    this.fire.position.set(-1.1, 1, 3.2);
    this.scene.add(this.fire);
  }

  buildRoom() {
    const s = this.scene;
    // wooden floor around the workshop
    const floor = mesh(new THREE.PlaneGeometry(80, 80), mat("#6d4630", { roughness: 0.9 }), 7.5, -0.02, 5, false);
    floor.rotation.x = -Math.PI / 2;
    s.add(floor);
    for (let i = -12; i < 30; i++) s.add(box(0.03, 0.01, 80, "#55351f", i * 1.6, -0.01, 5));

    // back wall (north) and side wall (east), with beams
    const wall = "#d9b48a";
    s.add(box(26, 3.2, 0.3, wall, 8, 1.6, -1.6), box(0.3, 3.2, 16, wall, 19.2, 1.6, 5.5));
    s.add(box(26, 0.3, 0.4, "#7a4e2c", 8, 0.15, -1.5), box(26, 0.25, 0.4, "#7a4e2c", 8, 3.1, -1.5));
    for (const x of [-4.5, 2.2, 7.6, 13, 18.8]) s.add(box(0.3, 3.2, 0.4, "#7a4e2c", x, 1.6, -1.5));
    s.add(box(0.4, 0.25, 16, "#7a4e2c", 19.1, 3.1, 5.5));

    // snowy windows
    for (const x of [4.9, 10.3]) {
      s.add(box(2.2, 1.5, 0.1, "#8fb1e6", x, 1.9, -1.42, { emissive: "#5d7fd0", emissiveIntensity: 0.7 }));
      s.add(box(2.4, 0.12, 0.2, "#7a4e2c", x, 2.68, -1.4), box(2.4, 0.16, 0.3, "#f4f6fb", x, 1.1, -1.36));
      s.add(box(0.1, 1.5, 0.16, "#7a4e2c", x, 1.9, -1.4), box(2.2, 0.1, 0.16, "#7a4e2c", x, 1.9, -1.4));
    }
    // string lights along the wall
    const bulbs = ["#ffd24a", "#ff6b6b", "#7fe08a", "#7fc4ff"];
    for (let i = 0; i < 26; i++) {
      const x = -4 + i * 0.9;
      const col = bulbs[i % 4];
      s.add(mesh(geo("sph", 0.07, 8, 6), mat(col, { emissive: col, emissiveIntensity: 2 }), x, 2.92 - Math.abs(Math.sin(i * 1.3)) * 0.14, -1.28, false));
    }
    // wreath
    const wreath = mesh(geo("tor", 0.42, 0.13, 10, 24), mat("#2f7d3f"), 15.6, 2.05, -1.38);
    s.add(wreath, ball(0.1, "#e23b3b", 15.6, 1.66, -1.3), ball(0.07, "#e23b3b", 15.9, 2.3, -1.28), ball(0.07, GOLD, 15.3, 2.3, -1.28));

    // fireplace on the west side
    const brick = "#9b5a3c";
    s.add(box(1, 2.2, 3.2, brick, -2.3, 1.1, 3.2), box(1.2, 0.16, 3.5, "#7a4e2c", -2.2, 2.26, 3.2));
    s.add(box(0.5, 1.2, 1.8, "#24130d", -1.85, 0.6, 3.2));
    this.flames = [];
    for (let i = 0; i < 4; i++) {
      const f = mesh(geo("cone", 0.22, 0.6, 8), mat(i % 2 ? "#ffb02e" : "#ff6a1a", { emissive: "#ff7a1a", emissiveIntensity: 2.2 }), -1.75, 0.42, 2.7 + i * 0.33, false);
      s.add(f);
      this.flames.push(f);
    }
    for (let i = 0; i < 3; i++) {
      s.add(box(0.06, 0.5, 0.3, i % 2 ? "#e23b3b" : "#f4f6fb", -1.62, 1.75, 2.3 + i * 0.9), box(0.06, 0.12, 0.34, "#f4f6fb", -1.6, 2.02, 2.3 + i * 0.9));
    }

    // Christmas tree
    const tree = new THREE.Group();
    tree.add(mesh(geo("cyl", 0.14, 0.18, 0.5, 8), mat("#6b4226"), 0, 0.25, 0));
    [[0.95, 1.1, 0.95], [0.75, 1.0, 1.6], [0.52, 0.9, 2.2]].forEach(([r, h, y]) => tree.add(mesh(geo("cone", r, h, 12), mat("#2c8a45", { roughness: 0.9 }), 0, y, 0)));
    tree.add(ball(0.13, GOLD, 0, 2.72, 0, { emissive: "#ffcf40", emissiveIntensity: 1.5 }));
    for (let i = 0; i < 14; i++) {
      const a = i * 2.4, y = 0.75 + (i / 14) * 1.6, r = 0.92 - (i / 14) * 0.66;
      const col = bulbs[i % 4];
      tree.add(mesh(geo("sph", 0.075, 8, 6), mat(col, { emissive: col, emissiveIntensity: 1.4 }), Math.cos(a) * r, y, Math.sin(a) * r, false));
    }
    tree.position.set(-2.2, 0, 7.6);
    s.add(tree);

    // spare presents lying about
    const pile = (x, z, col, sz, rot = 0) => {
      const p = new THREE.Group();
      p.add(box(sz, sz * 0.8, sz, col, 0, sz * 0.4, 0), box(sz * 0.18, sz * 0.82, sz * 1.02, GOLD, 0, sz * 0.4, 0), box(sz * 1.02, sz * 0.82, sz * 0.18, GOLD, 0, sz * 0.4, 0));
      p.position.set(x, 0, z); p.rotation.y = rot;
      s.add(p);
    };
    pile(-1.3, 9.3, PAPER_HEX.red, 0.7, 0.3); pile(-2.4, 9.6, PAPER_HEX.green, 0.55, -0.4); pile(-1.2, 6.2, PAPER_HEX.blue, 0.5, 0.6);
    pile(17.6, 8.4, PAPER_HEX.purple, 0.7, 0.4); pile(18.2, 7.2, PAPER_HEX.red, 0.5, -0.2); pile(-1.3, 0.2, PAPER_HEX.green, 0.6, 0.2);
  }

  buildBoard() {
    const s = this.scene;
    const tileGeo = geo("box", 0.97, 0.08, 0.97);
    const wood = "#b98455", top = "#d8b384";
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const ch = MAP[r][c];
        const x = c + 0.5, z = r + 0.5;
        if (ch === ".") {
          const m = new THREE.Mesh(tileGeo, new THREE.MeshStandardMaterial({ color: zoneColour(c, r), roughness: 0.85 }));
          m.position.set(x, 0.02, z);
          m.receiveShadow = true;
          s.add(m);
          continue;
        }
        const g = new THREE.Group();
        g.position.set(x, 0, z);
        g.add(box(1, TOP - 0.08, 1, wood, 0, (TOP - 0.08) / 2, 0));
        g.add(box(0.9, 0.02, 0.9, "#a5713f", 0, TOP * 0.45, 0.06)); // drawer line
        let topCol = top;
        if (ch === "W") topCol = "#58b876";
        if (ch === "D") topCol = "#3a3d47";
        if (TOYS[ch]) topCol = "#6f94c4";
        if (PAPERS[ch]) topCol = "#b98fe0";
        if (ch === "B") topCol = "#e7b98a";
        if (ch === "R" || ch === "O") topCol = "#efc956";
        g.add(box(1, 0.08, 1, topCol, 0, TOP - 0.04, 0));
        this.decorate(g, ch);
        s.add(g);
      }
    }
    // board plinth
    s.add(box(COLS + 0.3, 0.1, ROWS + 0.3, "#8a5a36", COLS / 2, -0.04, ROWS / 2));

    // conveyor belt to the sleigh
    const c = document.createElement("canvas");
    c.width = 32; c.height = 64;
    const g2 = c.getContext("2d");
    g2.fillStyle = "#3a3d47"; g2.fillRect(0, 0, 32, 64);
    g2.fillStyle = "#555a68"; g2.fillRect(0, 0, 32, 6); g2.fillRect(0, 32, 32, 6);
    this.beltTex = new THREE.CanvasTexture(c);
    this.beltTex.wrapS = this.beltTex.wrapT = THREE.RepeatWrapping;
    this.beltTex.repeat.set(1, 6);
    this.beltTex.colorSpace = THREE.SRGBColorSpace;
    const belt = mesh(new THREE.BoxGeometry(1.1, 0.12, 5.6), new THREE.MeshStandardMaterial({ map: this.beltTex, roughness: 0.6 }), 15.75, 0.62, 3.6);
    s.add(belt, box(1.3, 0.56, 5.6, "#b98455", 15.75, 0.28, 3.6));
    s.add(box(0.1, 0.16, 5.6, GOLD, 15.15, 0.7, 3.6, { metalness: 0.5, roughness: 0.3 }), box(0.1, 0.16, 5.6, GOLD, 16.35, 0.7, 3.6, { metalness: 0.5, roughness: 0.3 }));

    // sleigh
    const sl = new THREE.Group();
    const red = { roughness: 0.35 };
    sl.add(box(1.5, 0.5, 1.5, "#c9282d", 0, 0.5, 0, red), box(1.5, 0.9, 0.16, "#c9282d", 0, 0.75, -0.7, red), box(1.5, 0.3, 0.16, "#c9282d", 0, 0.9, 0.72, red));
    sl.add(box(1.3, 0.2, 0.7, "#2f7d3f", 0, 0.86, -0.25));
    for (const sx of [-1, 1]) {
      sl.add(box(0.08, 0.08, 2, GOLD, sx * 0.6, 0.08, 0, { metalness: 0.6, roughness: 0.25 }));
      sl.add(box(0.08, 0.2, 0.08, GOLD, sx * 0.6, 0.18, 0.5, { metalness: 0.6 }), box(0.08, 0.2, 0.08, GOLD, sx * 0.6, 0.18, -0.5, { metalness: 0.6 }));
      sl.add(box(1.56, 0.08, 0.08, GOLD, 0, 0.76, sx * 0.72, { metalness: 0.6 }));
    }
    sl.position.set(15.75, 0, -0.15);
    this.sleigh = sl;
    s.add(sl);
  }

  decorate(g, ch) {
    const sign = (key, draw) => g.add(sprite(signTexture(key, draw), 0.78, 2.0));
    if (TOYS[ch]) {
      const toy = TOYS[ch];
      for (const [dx, dz] of [[-0.44, 0], [0.44, 0], [0, -0.44], [0, 0.44]]) g.add(box(dx ? 0.1 : 0.98, 0.34, dx ? 0.98 : 0.1, "#5c7fae", dx, TOP + 0.17, dz));
      const a = toyModel(toy); a.position.set(-0.12, TOP + 0.06, 0.05); a.scale.setScalar(1.05); a.rotation.y = 0.3;
      const b = toyModel(toy); b.position.set(0.2, TOP + 0.02, -0.15); b.scale.setScalar(0.9); b.rotation.y = -0.6;
      g.add(a, b);
      sign("toy" + toy, (c) => drawEmoji(c, TOY_EMOJI[toy]));
    } else if (ch === "B") {
      g.add(box(0.66, 0.2, 0.66, CARD, 0, TOP + 0.1, 0), box(0.6, 0.2, 0.6, "#d6ab74", 0.03, TOP + 0.3, 0.02), box(0.56, 0.2, 0.56, CARD, -0.02, TOP + 0.5, 0));
      sign("box", (c) => drawEmoji(c, "📦"));
    } else if (PAPERS[ch]) {
      const col = PAPER_HEX[PAPERS[ch]];
      g.add(box(0.94, 0.3, 0.1, "#8a5a36", 0, TOP + 0.15, -0.42), box(0.94, 0.12, 0.1, "#8a5a36", 0, TOP + 0.06, 0.42));
      for (const dx of [-0.27, 0, 0.27]) {
        const roll = mesh(geo("cyl", 0.12, 0.12, 0.8, 14), mat(col, { roughness: 0.5 }), dx, TOP + 0.36, -0.02);
        roll.rotation.x = 0.35;
        g.add(roll);
      }
      sign("paper" + ch, (c) => drawGift(c, col, false, false));
    } else if (ch === "R") {
      for (const dx of [-0.3, 0, 0.3]) {
        const sp = mesh(geo("cyl", 0.2, 0.2, 0.16, 18), mat(GOLD, { roughness: 0.3, metalness: 0.35 }), dx, TOP + 0.32, 0);
        sp.rotation.z = Math.PI / 2;
        g.add(sp);
      }
      const rod = mesh(geo("cyl", 0.03, 0.03, 1, 8), mat("#7a4e2c"), 0, TOP + 0.32, 0);
      rod.rotation.z = Math.PI / 2;
      g.add(rod, box(0.08, 0.4, 0.3, "#8a5a36", -0.46, TOP + 0.2, 0), box(0.08, 0.4, 0.3, "#8a5a36", 0.46, TOP + 0.2, 0));
      sign("ribbon", (c) => drawGift(c, "#7d8aa0", true, false));
    } else if (ch === "O") {
      g.add(mesh(geo("cyl", 0.4, 0.32, 0.28, 16), mat("#a5713f"), 0, TOP + 0.14, 0));
      for (const [dx, dz, r] of [[-0.14, 0.05, 0.2], [0.14, -0.06, -0.5], [0.02, 0.16, 1.1]]) {
        const b = bowModel(1.5); b.position.set(dx, TOP + 0.27, dz); b.rotation.y = r; g.add(b);
      }
      sign("bow", (c) => drawGift(c, "#7d8aa0", false, true));
    } else if (ch === "W") {
      g.add(box(0.2, 0.1, 0.12, "#e23b3b", 0.33, TOP + 0.05, -0.36));
      const tape = mesh(geo("cyl", 0.07, 0.07, 0.06, 12), mat("#f4f6fb"), 0.33, TOP + 0.13, -0.36);
      tape.rotation.x = Math.PI / 2;
      g.add(tape);
    } else if (ch === "D") {
      for (const dz of [-0.3, 0, 0.3]) {
        const roller = mesh(geo("cyl", 0.05, 0.05, 0.9, 10), mat("#8b90a0", { metalness: 0.5, roughness: 0.4 }), 0, TOP + 0.02, dz);
        roller.rotation.z = Math.PI / 2;
        g.add(roller);
      }
      if (g.position.z === 4.5) sign("sleigh", (c) => drawEmoji(c, "🛷"));
    } else if (ch === "X") {
      g.add(mesh(geo("cyl", 0.34, 0.26, 0.4, 14), mat("#6f7684", { metalness: 0.4, roughness: 0.5 }), 0, TOP + 0.2, 0), mesh(geo("cyl", 0.3, 0.3, 0.02, 14), mat("#22242a"), 0, TOP + 0.41, 0));
      sign("bin", (c) => drawEmoji(c, "🗑️"));
    }
  }

  // ---------- camera ----------
  setInsets(top, bottom) { this.insets = { top, bottom }; this.resize(); }

  resize() {
    const w = this.container.clientWidth || window.innerWidth;
    const h = this.container.clientHeight || window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.portrait = h > w * 1.15;
    const yaw = this.portrait ? -Math.PI / 2 - 0.07 : 0.07;
    const el = 0.76; // camera height angle
    const centre = new THREE.Vector3(8.2, 0.4, 4.6);
    const cam = this.camera;
    cam.position.set(centre.x + 60 * Math.sin(yaw) * Math.cos(el), centre.y + 60 * Math.sin(el), centre.z + 60 * Math.cos(yaw) * Math.cos(el));
    cam.up.set(0, 1, 0);
    cam.lookAt(centre);
    cam.updateMatrixWorld(true);
    const inv = cam.matrixWorldInverse.copy(cam.matrixWorld).invert();
    // Everything that must stay on screen.
    let minX = 1e9, maxX = -1e9, minY = 1e9, maxY = -1e9;
    const v = new THREE.Vector3();
    const zs = this.portrait ? [-0.2, ROWS + 0.2] : [-1.0, ROWS + 0.4];
    for (const x of [-0.4, 16.7]) for (const y of [0, 2.3]) for (const z of zs) {
      v.set(x, y, z).applyMatrix4(inv);
      minX = Math.min(minX, v.x); maxX = Math.max(maxX, v.x);
      minY = Math.min(minY, v.y); maxY = Math.max(maxY, v.y);
    }
    const availH = Math.max(120, h - this.insets.top - this.insets.bottom);
    const unitsPerPx = Math.max((maxX - minX) / w, (maxY - minY) / availH);
    const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2;
    const shift = ((this.insets.bottom - this.insets.top) / 2) * unitsPerPx;
    cam.left = cx - (unitsPerPx * w) / 2;
    cam.right = cx + (unitsPerPx * w) / 2;
    cam.top = cy + (unitsPerPx * h) / 2 - shift;
    cam.bottom = cy - (unitsPerPx * h) / 2 - shift;
    cam.updateProjectionMatrix();
  }

  /** World position -> pixel position inside the container. */
  project(x, y, z) {
    const v = new THREE.Vector3(x, y, z).project(this.camera);
    const w = this.container.clientWidth, h = this.container.clientHeight;
    return { x: (v.x * 0.5 + 0.5) * w, y: (-v.y * 0.5 + 0.5) * h };
  }

  // ---------- elves ----------
  setElves(list) {
    const keep = new Set(list.map((p) => p.uid));
    for (const [uid, e] of this.elves) {
      if (!keep.has(uid)) { this.scene.remove(e.group); this.elves.delete(uid); }
    }
    for (const p of list) {
      let e = this.elves.get(p.uid);
      if (!e) {
        const group = elfModel(p.slot);
        const label = labelSprite(p.name, p.me ? "#ffe27a" : "#ffffff");
        group.add(label);
        if (p.me) {
          const ring = new THREE.Mesh(new THREE.RingGeometry(0.42, 0.52, 28), new THREE.MeshBasicMaterial({ color: "#fff3a0", transparent: true, opacity: 0.85, depthWrite: false }));
          ring.rotation.x = -Math.PI / 2;
          ring.position.y = 0.08;
          group.add(ring);
        }
        group.position.set(p.x, 0, p.z);
        this.scene.add(group);
        e = { group, x: p.x, z: p.z, r: 0, tx: p.x, tz: p.z, tr: 0, me: p.me, heldKey: "", held: null, moving: false, label };
        this.elves.set(p.uid, e);
      }
      e.away = !p.online;
    }
  }
  /** Where an elf should be. Our own elf snaps; others glide. */
  moveElf(uid, x, z, r, snap) {
    const e = this.elves.get(uid);
    if (!e) return;
    e.tx = x; e.tz = z; e.tr = r;
    if (snap) { e.x = x; e.z = z; }
  }

  // ---------- items ----------
  swap(holder, parent, item, y, z = 0) {
    const key = item ? JSON.stringify(item) : "";
    if (holder.key === key) return;
    if (holder.obj) parent.remove(holder.obj);
    holder.key = key;
    holder.obj = null;
    if (item) {
      holder.obj = itemModel(item, this.taps);
      holder.obj.position.set(0, y, z);
      parent.add(holder.obj);
      this.anims.push({ t: 0, d: 0.18, step: (k) => holder.obj && holder.obj.scale.setScalar(0.75 + 0.25 * Math.sin(k * Math.PI * 0.5) + 0.12 * Math.sin(k * Math.PI)) });
    }
  }

  setState(G, taps) {
    this.taps = taps;
    const seen = new Set();
    for (const [i, item] of Object.entries(G?.t || {})) {
      seen.add(+i);
      let h = this.tileItems.get(+i);
      if (!h) {
        const group = new THREE.Group();
        group.position.set((+i % COLS) + 0.5, 0, Math.floor(+i / COLS) + 0.5);
        this.scene.add(group);
        h = { key: "", obj: null, group };
        this.tileItems.set(+i, h);
      }
      this.swap(h, h.group, item, TOP + (tileOf(+i) === "D" ? 0.06 : 0));
    }
    for (const [i, h] of this.tileItems) if (!seen.has(i)) this.swap(h, h.group, null, 0);
    for (const [uid, e] of this.elves) {
      const holder = e.holder || (e.holder = { key: "", obj: null });
      this.swap(holder, e.group, G?.h?.[uid] || null, 0.22, 0.62);
      e.holding = !!holder.obj;
    }
  }

  setTarget(tile) {
    if (tile == null) { this.highlight.visible = false; return; }
    this.highlight.visible = true;
    this.highlight.position.set((tile % COLS) + 0.5, 0, Math.floor(tile / COLS) + 0.5);
  }

  /** A finished present rides the belt to the sleigh. */
  sendToSleigh(gift, tile) {
    const obj = itemModel(gift, this.taps);
    const z0 = Math.floor(tile / COLS) + 0.5;
    const path = [[14.5, TOP + 0.06, z0], [15.75, 0.68, z0], [15.75, 0.68, 1.1], [15.75, 0.95, -0.2]];
    const lens = [];
    let total = 0;
    for (let i = 1; i < path.length; i++) { const d = Math.hypot(path[i][0] - path[i - 1][0], path[i][1] - path[i - 1][1], path[i][2] - path[i - 1][2]); lens.push(d); total += d; }
    this.scene.add(obj);
    this.anims.push({
      t: 0, d: total / 3.2,
      step: (k) => {
        let dist = k * total, i = 0;
        while (i < lens.length - 1 && dist > lens[i]) { dist -= lens[i]; i++; }
        const f = Math.min(1, dist / lens[i]);
        obj.position.set(path[i][0] + (path[i + 1][0] - path[i][0]) * f, path[i][1] + (path[i + 1][1] - path[i][1]) * f, path[i][2] + (path[i + 1][2] - path[i][2]) * f);
        obj.scale.setScalar(k > 0.9 ? 1 - (k - 0.9) * 6 : 1);
      },
      done: () => { this.scene.remove(obj); this.sleighBounce = 0.35; },
    });
  }

  /** Little hop when a table is used. */
  bump(tile) {
    const h = this.tileItems.get(tile);
    if (!h?.obj) return;
    const o = h.obj;
    this.anims.push({ t: 0, d: 0.16, step: (k) => { if (h.obj === o) o.scale.set(1 + 0.12 * Math.sin(k * Math.PI), 1 - 0.14 * Math.sin(k * Math.PI), 1 + 0.12 * Math.sin(k * Math.PI)); } });
  }

  render(dt) {
    this.time += dt;
    const t = this.time;
    for (const [, e] of this.elves) {
      const k = e.me ? 1 : Math.min(1, dt * 12);
      const px = e.x, pz = e.z;
      e.x += (e.tx - e.x) * k;
      e.z += (e.tz - e.z) * k;
      const speed = Math.hypot(e.x - px, e.z - pz) / Math.max(dt, 0.001);
      e.moving = speed > 0.4;
      let dr = e.tr - e.r;
      dr = Math.atan2(Math.sin(dr), Math.cos(dr));
      e.r += dr * Math.min(1, dt * 16);
      e.group.position.set(e.x, 0, e.z);
      e.group.rotation.y = e.r;
      const body = e.group.userData.body;
      body.position.y = e.moving ? Math.abs(Math.sin(t * 13)) * 0.09 : Math.sin(t * 2.4) * 0.015;
      body.rotation.z = e.moving ? Math.sin(t * 13) * 0.07 : 0;
      const [a, b] = e.group.userData.arms;
      const fwd = e.holding ? 0.4 : 0.2;
      a.position.z += (fwd - a.position.z) * 0.3; b.position.z = a.position.z;
      a.position.y = b.position.y = e.holding ? 0.4 : 0.3;
      e.label.material.opacity = e.away ? 0.4 : 1;
      body.scale.setScalar(e.away ? 0.95 : 1.18);
    }
    for (let i = this.anims.length - 1; i >= 0; i--) {
      const a = this.anims[i];
      a.t += dt;
      const k = Math.min(1, a.t / a.d);
      a.step(k);
      if (k >= 1) { a.done?.(); this.anims.splice(i, 1); }
    }
    if (this.highlight.visible) this.highlight.userData.glow.material.opacity = 0.25 + 0.2 * Math.sin(t * 7);
    this.beltTex.offset.y = (t * 0.6) % 1;
    this.fire.intensity = 26 + Math.sin(t * 11) * 4 + Math.sin(t * 23) * 3;
    this.flames.forEach((f, i) => { f.scale.y = 1 + 0.25 * Math.sin(t * 9 + i * 1.7); f.position.y = 0.3 + 0.3 * f.scale.y * 0.6; });
    if (this.sleighBounce > 0) { this.sleighBounce -= dt; this.sleigh.position.y = Math.max(0, Math.sin((0.35 - this.sleighBounce) / 0.35 * Math.PI) * 0.12); }
    this.renderer.render(this.scene, this.camera);
  }

  destroy() {
    window.removeEventListener("resize", this.onResize);
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}
