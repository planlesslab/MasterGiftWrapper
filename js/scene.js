// Master Gift Wrapper: the 3D workshop (Three.js).
// Draws whatever the game state says; it makes no game decisions itself.

import * as THREE from "./vendor/three.module.min.js";
import { MAP, COLS, ROWS, TOYS, PAPERS, PAPER_HEX, TOY_EMOJI, tileOf, tileAt, needsWrap } from "./rules.js";

export function supportsWebGL() {
  try {
    const c = document.createElement("canvas");
    return !!(c.getContext("webgl2") || c.getContext("webgl"));
  } catch { return false; }
}

// Read once at page load, because the address changes when you enter a room.
const FLAGS = new URLSearchParams(location.search);
const TOP = 0.78; // worktop height
// The view. ?yaw= and ?tilt= in the address let you try other angles.
const CAMERA_YAW = FLAGS.has("yaw") ? +FLAGS.get("yaw") : 0;      // how far the view is turned sideways
const CAMERA_TILT = FLAGS.has("tilt") ? +FLAGS.get("tilt") : 0.74; // how steeply the camera looks down
export const ELF_COLOURS = ["#6cb8ee", "#ff9db4", "#ffd84f", "#a6e36a"];
const HAT_COLOURS = ["#2f9e4f", "#d8343a", "#d8343a", "#2f9e4f"];
const CARD = "#c89a62";
const GOLD = "#f5c542";
const CREAM = "#fff3d6";
const WOOD = "#c79463";
const WOOD_DARK = "#8f5f3a";
const ZONE = { toys: "#62a2f0", boxes: "#f0b06e", paper: "#c183f2", trim: "#f8cc3c", wrap: "#7fd676", send: "#f58c80", plain: "#e6bd8c" };

// ---------- textures ----------
function canvasTex(w, h, draw, repeat) {
  const c = document.createElement("canvas");
  c.width = w; c.height = h;
  draw(c.getContext("2d"), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(repeat[0], repeat[1]); }
  return t;
}
function flake(g, x, y, r, colour) {
  g.strokeStyle = colour; g.lineWidth = Math.max(1.5, r / 4); g.lineCap = "round";
  for (let i = 0; i < 3; i++) {
    const a = (i * Math.PI) / 3;
    g.beginPath(); g.moveTo(x - Math.cos(a) * r, y - Math.sin(a) * r); g.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r); g.stroke();
  }
}
const TEX = {};
function textures() {
  if (TEX.tile) return TEX;
  // A chunky stone block: soft bevel, lighter face.
  const block = (flakes) => canvasTex(128, 128, (g) => {
    g.fillStyle = "#b9b9b9"; g.fillRect(0, 0, 128, 128);
    const grad = g.createLinearGradient(0, 0, 128, 128);
    grad.addColorStop(0, "#ffffff"); grad.addColorStop(1, "#e2e2e2");
    g.fillStyle = grad; g.beginPath(); g.roundRect(5, 5, 118, 118, 12); g.fill();
    g.strokeStyle = "rgba(255,255,255,0.9)"; g.lineWidth = 3; g.beginPath(); g.roundRect(8, 8, 112, 112, 10); g.stroke();
    if (flakes) for (const [x, y, r] of [[34, 36, 13], [92, 52, 9], [52, 96, 10], [100, 104, 7], [18, 80, 6]]) flake(g, x, y, r, "rgba(255,255,255,0.95)");
  });
  TEX.tile = block(false);
  TEX.mat = canvasTex(128, 128, (g) => {
    g.fillStyle = "#dcdcdc"; g.fillRect(0, 0, 128, 128);
    for (const [x, y, r] of [[30, 30, 14], [94, 40, 10], [58, 78, 12], [104, 104, 9], [20, 100, 8], [70, 14, 6]]) flake(g, x, y, r, "rgba(255,255,255,0.9)");
  });
  TEX.wood = canvasTex(128, 128, (g) => {
    g.fillStyle = "#f4f4f4"; g.fillRect(0, 0, 128, 128);
    for (let i = 0; i < 40; i++) { g.fillStyle = `rgba(0,0,0,${0.02 + Math.random() * 0.05})`; g.fillRect(0, Math.random() * 128, 128, 1 + Math.random() * 2); }
    g.fillStyle = "rgba(0,0,0,0.28)"; g.fillRect(0, 0, 128, 3); g.fillRect(0, 62, 128, 3);
    g.fillRect(40, 0, 3, 64); g.fillRect(96, 64, 3, 64);
    g.fillStyle = "rgba(255,255,255,0.5)"; g.fillRect(0, 3, 128, 2); g.fillRect(0, 65, 128, 2);
  });
  TEX.floor = canvasTex(256, 256, (g) => {
    g.fillStyle = "#8a5636"; g.fillRect(0, 0, 256, 256);
    for (let row = 0; row < 4; row++) for (let col = -1; col < 3; col++) {
      const x = col * 128 + (row % 2) * 64, y = row * 64;
      g.fillStyle = ["#93603e", "#84502f", "#8d5a39", "#7c4a2b"][(row * 3 + col + 4) % 4];
      g.fillRect(x + 2, y + 2, 124, 60);
      for (let i = 0; i < 6; i++) { g.fillStyle = "rgba(0,0,0,0.06)"; g.fillRect(x + 2, y + 6 + Math.random() * 52, 124, 1.5); }
    }
  }, [14, 14]);
  TEX.brick = canvasTex(128, 128, (g) => {
    g.fillStyle = "#6e3a26"; g.fillRect(0, 0, 128, 128);
    for (let row = 0; row < 4; row++) for (let col = -1; col < 2; col++) {
      g.fillStyle = ["#b0603f", "#a45636", "#bb6a47"][(row + col + 3) % 3];
      g.beginPath(); g.roundRect(col * 64 + (row % 2) * 32 + 3, row * 32 + 3, 58, 26, 4); g.fill();
    }
  }, [2, 2]);
  TEX.plaster = canvasTex(64, 64, (g) => {
    g.fillStyle = "#fff"; g.fillRect(0, 0, 64, 64);
    for (let i = 0; i < 60; i++) { g.fillStyle = `rgba(0,0,0,${Math.random() * 0.04})`; g.fillRect(Math.random() * 64, Math.random() * 64, 6, 6); }
  }, [8, 2]);
  TEX.belt = canvasTex(32, 64, (g) => {
    g.fillStyle = "#3d4150"; g.fillRect(0, 0, 32, 64);
    g.fillStyle = "#2a2d38"; g.fillRect(0, 0, 32, 4); g.fillRect(0, 32, 32, 4);
    g.fillStyle = "#565b6c"; g.fillRect(0, 4, 32, 2); g.fillRect(0, 36, 32, 2);
  }, [1, 6]);
  TEX.glow = canvasTex(64, 64, (g) => {
    const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    grad.addColorStop(0, "rgba(255,255,255,1)"); grad.addColorStop(0.25, "rgba(255,255,255,0.45)"); grad.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = grad; g.fillRect(0, 0, 64, 64);
  });
  for (const [name, hex] of Object.entries(PAPER_HEX)) {
    TEX["paper" + name] = canvasTex(128, 128, (g) => {
      g.fillStyle = hex; g.fillRect(0, 0, 128, 128);
      for (const [x, y, r] of [[26, 28, 13], [90, 22, 8], [62, 66, 11], [108, 84, 9], [22, 98, 9], [74, 112, 6]]) flake(g, x, y, r, "rgba(255,236,170,0.75)");
    });
  }
  return TEX;
}

// ---------- small helpers ----------
const matCache = new Map();
function mat(color, opts = {}) {
  const key = color + (opts.map ? opts.map.uuid : "") + JSON.stringify({ ...opts, map: undefined });
  if (!matCache.has(key)) matCache.set(key, new THREE.MeshStandardMaterial({ color, roughness: 0.72, metalness: 0, ...opts }));
  return matCache.get(key);
}
const glowMat = (color, k = 1.6) => mat(color, { emissive: color, emissiveIntensity: k });
const geoCache = new Map();
function geo(kind, ...a) {
  const key = kind + a.join(",");
  if (!geoCache.has(key)) {
    const G = { box: THREE.BoxGeometry, sph: THREE.SphereGeometry, cyl: THREE.CylinderGeometry, cone: THREE.ConeGeometry, tor: THREE.TorusGeometry, circ: THREE.CircleGeometry, plane: THREE.PlaneGeometry }[kind];
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
const woodBox = (w, h, d, color, x, y, z) => box(w, h, d, color, x, y, z, { map: textures().wood });

function sprite(tex, size, y, opts = {}) {
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true, ...opts }));
  s.scale.set(size, size, 1);
  s.position.y = y;
  s.renderOrder = 10;
  return s;
}
/** Soft halo of light, for bulbs and flames. */
function halo(color, size, x, y, z) {
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: textures().glow, color, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0.8 }));
  s.scale.set(size, size, 1);
  s.position.set(x, y, z);
  return s;
}

// ---------- icons and signs ----------
const ICONS = {
  gift(g, tint) {
    g.fillRect(36, 58, 56, 38); g.fillRect(31, 45, 66, 13);
    g.beginPath(); g.ellipse(52, 37, 13, 8, -0.5, 0, 7); g.ellipse(76, 37, 13, 8, 0.5, 0, 7); g.fill();
    g.fillStyle = tint; g.fillRect(59, 45, 10, 51); g.fillRect(36, 58, 56, 3);
    g.beginPath(); g.ellipse(52, 37, 6, 3, -0.5, 0, 7); g.ellipse(76, 37, 6, 3, 0.5, 0, 7); g.fill();
  },
  bow(g, tint) {
    g.beginPath(); g.moveTo(64, 56); g.quadraticCurveTo(22, 22, 26, 58); g.quadraticCurveTo(28, 82, 64, 60); g.fill();
    g.beginPath(); g.moveTo(64, 56); g.quadraticCurveTo(106, 22, 102, 58); g.quadraticCurveTo(100, 82, 64, 60); g.fill();
    g.beginPath(); g.moveTo(60, 62); g.lineTo(42, 98); g.lineTo(54, 94); g.lineTo(64, 68); g.lineTo(74, 94); g.lineTo(86, 98); g.lineTo(68, 62); g.fill();
    g.fillStyle = tint; g.beginPath(); g.arc(64, 58, 7, 0, 7); g.fill();
    g.fillStyle = "#fff"; g.beginPath(); g.arc(64, 58, 4, 0, 7); g.fill();
  },
  ribbon(g, tint) {
    g.beginPath(); g.arc(56, 60, 26, 0, 7); g.fill();
    g.fillStyle = tint; g.beginPath(); g.arc(56, 60, 15, 0, 7); g.fill();
    g.fillStyle = "#fff"; g.beginPath(); g.arc(56, 60, 6, 0, 7); g.fill();
    g.strokeStyle = "#fff"; g.lineWidth = 9; g.lineCap = "round";
    g.beginPath(); g.moveTo(74, 80); g.quadraticCurveTo(92, 98, 104, 84); g.stroke();
  },
  tape(g, tint) {
    g.beginPath(); g.arc(60, 54, 24, 0, 7); g.fill();
    g.fillStyle = tint; g.beginPath(); g.arc(60, 54, 11, 0, 7); g.fill();
    g.fillStyle = "#fff"; g.fillRect(60, 68, 44, 10);
    g.beginPath(); g.moveTo(26, 88); g.lineTo(100, 88); g.lineTo(92, 100); g.lineTo(34, 100); g.fill();
  },
  box(g, tint) {
    g.beginPath(); g.moveTo(64, 30); g.lineTo(100, 46); g.lineTo(64, 62); g.lineTo(28, 46); g.fill();
    g.beginPath(); g.moveTo(28, 52); g.lineTo(60, 67); g.lineTo(60, 100); g.lineTo(28, 85); g.fill();
    g.beginPath(); g.moveTo(100, 52); g.lineTo(68, 67); g.lineTo(68, 100); g.lineTo(100, 85); g.fill();
    g.fillStyle = tint; g.fillRect(0, 0, 0, 0);
  },
  swatch(g, tint) { ICONS.gift(g, tint); },
};
function drawIcon(g, name, tint) {
  g.save();
  g.shadowColor = "rgba(255,255,255,0.9)"; g.shadowBlur = 8;
  if (ICONS[name]) { g.fillStyle = "#fff"; ICONS[name](g, tint); }
  else {
    g.font = '58px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif';
    g.textAlign = "center"; g.textBaseline = "middle"; g.fillStyle = "#fff";
    g.fillText(name, 64, 64);
  }
  g.restore();
}
const signCache = new Map();
/** A glowing speech bubble, like a neon sign. */
function signTexture(icon, tint) {
  const key = icon + tint;
  if (!signCache.has(key)) signCache.set(key, canvasTex(128, 144, (g) => {
    const c = new THREE.Color(tint);
    const rgba = (a, k = 1) => `rgba(${Math.round(c.r * 255 * k)},${Math.round(c.g * 255 * k)},${Math.round(c.b * 255 * k)},${a})`;
    g.shadowColor = rgba(1); g.shadowBlur = 14;
    g.fillStyle = rgba(0.78, 0.8);
    g.beginPath(); g.roundRect(14, 14, 100, 96, 26); g.fill();
    g.beginPath(); g.moveTo(52, 108); g.lineTo(64, 130); g.lineTo(76, 108); g.closePath(); g.fill();
    g.shadowBlur = 0;
    g.strokeStyle = "rgba(255,255,255,0.92)"; g.lineWidth = 4;
    g.beginPath(); g.roundRect(14, 14, 100, 96, 26); g.stroke();
    drawIcon(g, icon, rgba(1, 0.8));
  }));
  return signCache.get(key);
}
function sign(icon, tint, y = 1.95, size = 0.82) {
  const s = sprite(signTexture(icon, tint), size, y);
  s.scale.set(size, size * 1.125, 1);
  return s;
}
/** A flat pad on the floor with an icon, marking a zone. */
function pad(icon, tint, x, z) {
  const tex = canvasTex(128, 128, (g) => {
    const c = new THREE.Color(tint).multiplyScalar(0.72);
    g.fillStyle = `#${c.getHexString()}`;
    g.beginPath(); g.roundRect(8, 16, 112, 96, 22); g.fill();
    g.strokeStyle = "rgba(255,255,255,0.85)"; g.lineWidth = 5; g.stroke();
    drawIcon(g, icon, `#${c.getHexString()}`);
  });
  const m = new THREE.Mesh(geo("plane", 0.92, 0.92), new THREE.MeshStandardMaterial({ map: tex, transparent: true, roughness: 0.6, polygonOffset: true, polygonOffsetFactor: -2 }));
  m.rotation.x = -Math.PI / 2;
  m.position.set(x, 0.068, z);
  m.receiveShadow = true;
  return m;
}
const heldCache = new Map();
/**
 * The speech bubble above an elf that shows what it is carrying.
 * Presents are drawn the same way as on the order tickets, so the two are easy to compare.
 */
function heldTexture(it, taps) {
  const key = JSON.stringify(it) + taps;
  if (!heldCache.has(key)) heldCache.set(key, canvasTex(160, 144, (g) => {
    g.shadowColor = "rgba(0,0,0,0.35)"; g.shadowBlur = 8; g.shadowOffsetY = 3;
    g.fillStyle = "#fffaf0";
    g.beginPath(); g.roundRect(10, 8, 140, 100, 24); g.fill();
    g.beginPath(); g.moveTo(66, 106); g.lineTo(80, 132); g.lineTo(94, 106); g.closePath(); g.fill();
    g.shadowColor = "transparent";
    g.strokeStyle = "#8a5a36"; g.lineWidth = 4;
    g.beginPath(); g.roundRect(10, 8, 140, 100, 24); g.stroke();
    const emoji = (text, x, y, size) => {
      g.font = `${size}px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif`;
      g.textAlign = "center"; g.textBaseline = "middle"; g.fillStyle = "#333";
      g.fillText(text, x, y);
    };
    const boxAt = (x, y, w, h, fill, dashed) => {
      g.fillStyle = fill; g.beginPath(); g.roundRect(x, y, w, h, 7); g.fill();
      g.strokeStyle = dashed ? "#8a5a36" : "rgba(0,0,0,0.25)"; g.lineWidth = 3;
      g.setLineDash(dashed ? [7, 5] : []); g.stroke(); g.setLineDash([]);
    };
    if (it.k === "toy") emoji(TOY_EMOJI[it.v], 80, 60, 64);
    else if (it.k === "box") { boxAt(48, 34, 64, 52, CARD, true); }
    else if (it.k === "paper") {
      g.fillStyle = PAPER_HEX[it.v]; g.beginPath(); g.roundRect(34, 40, 92, 38, 19); g.fill();
      g.fillStyle = "rgba(255,255,255,0.85)"; g.beginPath(); g.ellipse(112, 59, 9, 15, 0, 0, 7); g.fill();
      g.fillStyle = "#c9b089"; g.beginPath(); g.ellipse(112, 59, 4, 7, 0, 0, 7); g.fill();
    } else if (it.k === "ribbon" || it.k === "bow") {
      g.save(); g.translate(16, -4);
      g.fillStyle = it.k === "ribbon" ? "#e6ac1c" : "#d79a2b";
      ICONS[it.k](g, "#fffaf0");
      g.restore();
    } else {
      // a present: box on the left, its toy on the right
      const wrapped = !!it.paper && !needsWrap(it, taps);
      const x = 26, y = 40, w = 54, h = 50;
      boxAt(x, y, w, h, CARD, !it.paper);
      if (it.paper) {
        // paper covers the box as far as it has been wrapped
        const p = wrapped ? 1 : Math.max(0.25, (it.w || 0) / taps);
        g.save(); g.beginPath(); g.rect(x, y + h * (1 - p), w, h * p); g.clip();
        boxAt(x, y, w, h, PAPER_HEX[it.paper], false);
        g.restore();
      }
      if (it.rib) { g.fillStyle = GOLD; g.fillRect(x + w / 2 - 6, y, 12, h); g.fillRect(x, y + h / 2 - 6, w, 12); }
      if (it.bow) {
        g.fillStyle = CREAM; g.strokeStyle = "#b98d3e"; g.lineWidth = 3;
        for (const dx of [-13, 13]) { g.beginPath(); g.ellipse(x + w / 2 + dx, y - 5, 13, 9, dx > 0 ? -0.4 : 0.4, 0, 7); g.fill(); g.stroke(); }
        g.beginPath(); g.arc(x + w / 2, y - 3, 6, 0, 7); g.fill(); g.stroke();
      }
      emoji(TOY_EMOJI[it.toy], 114, 60, 40);
      if (it.paper && !wrapped) {
        g.font = "800 15px system-ui, sans-serif"; g.textAlign = "center"; g.fillStyle = "#c0392b";
        g.fillText("needs wrapping", 80, 98, 130);
      }
    }
  }));
  return heldCache.get(key);
}

function labelSprite(text, color) {
  const tex = canvasTex(256, 64, (g) => {
    g.font = "700 30px system-ui, sans-serif";
    const w = Math.min(240, g.measureText(text).width + 28);
    g.fillStyle = "rgba(30,16,10,0.72)";
    g.beginPath(); g.roundRect(128 - w / 2, 10, w, 44, 22); g.fill();
    g.fillStyle = color; g.textAlign = "center"; g.textBaseline = "middle";
    g.fillText(text, 128, 33, 220);
  });
  const s = sprite(tex, 1, 2.0);
  s.scale.set(1.5, 0.375, 1);
  return s;
}

// ---------- models ----------
function toyModel(kind) {
  const g = new THREE.Group();
  if (kind === "teddy") {
    const fur = "#b0703a";
    g.add(ball(0.17, fur, 0, 0.17, 0), ball(0.14, fur, 0, 0.41, 0));
    g.add(ball(0.055, fur, -0.11, 0.52, 0), ball(0.055, fur, 0.11, 0.52, 0));
    g.add(ball(0.065, "#e6c08e", 0, 0.38, 0.1), ball(0.024, "#2a1a10", 0, 0.4, 0.16));
    g.add(ball(0.02, "#2a1a10", -0.055, 0.45, 0.115), ball(0.02, "#2a1a10", 0.055, 0.45, 0.115));
    g.add(ball(0.08, "#e6c08e", 0, 0.16, 0.12));
    for (const sx of [-1, 1]) g.add(ball(0.07, fur, sx * 0.18, 0.25, 0.04), ball(0.075, fur, sx * 0.11, 0.06, 0.1));
  } else if (kind === "ball") {
    g.add(ball(0.2, "#fafafa", 0, 0.2, 0, { roughness: 0.35 }));
    const dots = [[0, 0.4, 0], [0.17, 0.27, 0.07], [-0.17, 0.27, 0.07], [0, 0.27, 0.18], [0.1, 0.27, -0.16], [-0.1, 0.27, -0.16], [0.12, 0.1, 0.14], [-0.12, 0.1, 0.14]];
    for (const [x, y, z] of dots) g.add(ball(0.06, "#22242a", x * 0.9, 0.2 + (y - 0.2) * 0.9, z * 0.9));
  } else {
    g.add(box(0.44, 0.13, 0.24, "#e0393e", 0, 0.14, 0, { roughness: 0.3 }));
    g.add(box(0.22, 0.12, 0.2, "#9fd8ff", -0.02, 0.26, 0, { roughness: 0.2 }));
    g.add(box(0.24, 0.03, 0.22, "#e0393e", -0.02, 0.33, 0, { roughness: 0.3 }));
    g.add(ball(0.03, "#ffe9a0", 0.22, 0.15, 0.07, { emissive: "#ffd24a", emissiveIntensity: 1 }), ball(0.03, "#ffe9a0", 0.22, 0.15, -0.07, { emissive: "#ffd24a", emissiveIntensity: 1 }));
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      const w = mesh(geo("cyl", 0.07, 0.07, 0.05, 14), mat("#26262b"), sx * 0.14, 0.07, sz * 0.13);
      w.rotation.x = Math.PI / 2;
      g.add(w);
    }
  }
  return g;
}

function bowModel(scale = 1, colour = CREAM) {
  const g = new THREE.Group();
  const m = { roughness: 0.35 };
  for (const sx of [-1, 1]) {
    const loop = mesh(geo("tor", 0.07, 0.03, 8, 16), mat(colour, m), sx * 0.085, 0.07, 0);
    loop.rotation.y = Math.PI / 2 + sx * 0.5;
    loop.rotation.z = sx * 0.3;
    const tail = box(0.045, 0.012, 0.15, colour, sx * 0.07, 0.012, 0.07, m);
    tail.rotation.y = sx * 0.6;
    g.add(loop, tail);
  }
  g.add(ball(0.045, colour, 0, 0.055, 0, m));
  g.scale.setScalar(scale);
  return g;
}

const tagSprite = (toy) => { const s = sign(TOY_EMOJI[toy], "#ffffff", 0.92, 0.42); s.material = s.material.clone(); return s; };

function spoolModel(colour, r = 0.15) {
  const g = new THREE.Group();
  g.add(mesh(geo("cyl", r, r, 0.16, 18), mat(colour, { roughness: 0.3, metalness: 0.3 }), 0, 0, 0));
  for (const y of [-0.095, 0.095]) g.add(mesh(geo("cyl", r + 0.045, r + 0.045, 0.03, 18), mat("#f1dcb8"), 0, y, 0));
  return g;
}

/** Build the model for any item. It stands on y = 0. */
function itemModel(it, taps) {
  const T = textures();
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
    const roll = mesh(geo("cyl", 0.09, 0.09, 0.62, 16), mat("#ffffff", { roughness: 0.5, map: T["paper" + it.v] }), 0, 0.1, 0);
    roll.rotation.z = Math.PI / 2;
    const core = mesh(geo("cyl", 0.04, 0.04, 0.64, 10), mat("#f3e6cf"), 0, 0.1, 0);
    core.rotation.z = Math.PI / 2;
    g.add(roll, core);
    return g;
  }
  if (it.k === "ribbon") { const s = spoolModel(GOLD); s.position.y = 0.12; g.add(s); return g; }
  if (it.k === "bow") { const b = bowModel(1.8); b.position.y = 0.02; g.add(b); return g; }

  // A gift at some stage.
  const W = 0.54, H = 0.4;
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
  const paper = { roughness: 0.42, map: T["paper" + it.paper] };
  const done = !needsWrap(it, taps);
  if (!done) {
    // Paper climbs up the box with every wrap tap.
    const p = Math.max(0.12, (it.w || 0) / taps);
    g.add(box(W, H, W, CARD, 0, H / 2, 0));
    g.add(box(0.86, 0.014, 0.86, "#ffffff", 0, 0.009, 0, paper));
    g.add(box(W + 0.02, H * p, W + 0.02, "#ffffff", 0, (H * p) / 2, 0, paper));
    for (let i = 0; i < taps; i++) {
      const on = i < (it.w || 0);
      g.add(ball(0.05, on ? "#ffe27a" : "#5b4636", (i - (taps - 1) / 2) * 0.14, 0.58, 0, on ? { emissive: "#ffb300", emissiveIntensity: 1 } : {}));
    }
  } else {
    g.add(box(W, H, W, "#ffffff", 0, H / 2, 0, paper));
    g.add(box(W + 0.04, 0.09, W + 0.04, "#ffffff", 0, H - 0.02, 0, paper));
    if (it.rib) {
      const m = { roughness: 0.28, metalness: 0.4 };
      g.add(box(0.1, H + 0.08, W + 0.06, GOLD, 0, H / 2 + 0.01, 0, m), box(W + 0.06, H + 0.08, 0.1, GOLD, 0, H / 2 + 0.01, 0, m));
    }
    if (it.bow) { const b = bowModel(1.7); b.position.y = H + 0.03; g.add(b); }
  }
  g.add(tagSprite(it.toy));
  return g;
}

function elfModel(slot) {
  const g = new THREE.Group();
  const body = new THREE.Group();
  const skin = ELF_COLOURS[slot % 4];
  const R = 0.37, CY = 0.4;
  // glossy, softly glowing shell
  const shell = new THREE.MeshPhysicalMaterial({ color: skin, roughness: 0.16, clearcoat: 1, clearcoatRoughness: 0.08, emissive: skin, emissiveIntensity: 0.16 });
  body.add(mesh(geo("sph", R, 28, 20), shell, 0, CY, 0));

  // glowing happy face
  const glow = new THREE.MeshStandardMaterial({ color: "#3fd8f5", emissive: "#2fd0f0", emissiveIntensity: 1.1, side: THREE.DoubleSide });
  const onFace = (o, yaw, pitch) => {
    const n = new THREE.Vector3(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch));
    o.position.set(n.x * R * 1.012, CY + n.y * R * 1.012, n.z * R * 1.012);
    o.lookAt(o.position.clone().add(n));
    o.castShadow = false;
    body.add(o);
  };
  for (const sx of [-1, 1]) onFace(new THREE.Mesh(geo("tor", 0.06, 0.02, 6, 14, Math.PI), glow), sx * 0.4, 0.42);
  onFace(new THREE.Mesh(geo("circ", 0.095, 18, Math.PI, Math.PI), glow), 0, 0.2);

  // ears
  for (const sx of [-1, 1]) {
    const ear = mesh(geo("cone", 0.075, 0.26, 10), mat("#f39a3c", { roughness: 0.45 }), sx * 0.42, CY + 0.08, -0.02);
    ear.rotation.z = -sx * 1.3;
    body.add(ear);
  }
  // little side port, like a robot
  body.add(mesh(geo("cyl", 0.05, 0.05, 0.03, 12), mat("#7a5bd0", { roughness: 0.3 }), 0, CY - 0.02, -R + 0.0).rotateX(Math.PI / 2));

  // floppy hat with a bell
  const hat = new THREE.Group();
  const felt = mat(HAT_COLOURS[slot % 4], { roughness: 0.85 });
  hat.add(mesh(geo("cyl", 0.11, 0.24, 0.2, 16), felt, 0, 0.1, 0));
  const tip = new THREE.Group();
  tip.add(mesh(geo("cyl", 0.035, 0.11, 0.24, 12), felt, 0, 0.1, 0));
  tip.add(ball(0.06, GOLD, 0, 0.25, 0, { metalness: 0.5, roughness: 0.25 }));
  tip.position.set(0, 0.18, 0);
  tip.rotation.z = -1.0;
  hat.add(tip);
  const brim = mesh(geo("tor", 0.23, 0.065, 10, 22), mat("#ffffff", { roughness: 0.95 }), 0, 0.01, 0);
  brim.rotation.x = Math.PI / 2;
  hat.add(brim);
  hat.position.set(0, CY + R * 0.78, -0.12);
  hat.rotation.set(-0.42, 0, 0.12);
  body.add(hat);

  // jointed robot arms
  const arms = [];
  for (const sx of [-1, 1]) {
    const arm = new THREE.Group();
    arm.add(ball(0.06, "#8b90a0", 0, 0, 0, { metalness: 0.5, roughness: 0.35 }));
    const fore = mesh(geo("cyl", 0.042, 0.042, 0.2, 10), mat("#f6f6f6", { roughness: 0.3 }), 0, 0, 0.12);
    fore.rotation.x = Math.PI / 2;
    const wrist = mesh(geo("cyl", 0.05, 0.05, 0.035, 10), mat("#8b90a0", { metalness: 0.5, roughness: 0.35 }), 0, 0, 0.22);
    wrist.rotation.x = Math.PI / 2;
    arm.add(fore, wrist, ball(0.072, "#f6f6f6", 0, 0, 0.28, { roughness: 0.3 }));
    arm.position.set(sx * 0.31, CY - 0.1, 0.12);
    arm.rotation.set(1.0, -sx * 0.25, 0);
    body.add(arm);
    arms.push(arm);
  }
  body.scale.setScalar(1.32);
  g.add(body);
  g.userData = { body, arms };
  return g;
}

function zoneOf(c, r) {
  if (r <= 2) return c <= 4 ? "toys" : c <= 7 ? "boxes" : c <= 11 ? "paper" : "trim";
  if (r <= 6 && c >= 5 && c <= 8) return "wrap";
  if (r >= 2 && r <= 6 && c >= 11) return "send";
  return "plain";
}

function present(colour, size, ribbon = GOLD) {
  const p = new THREE.Group();
  const T = textures();
  const key = Object.keys(PAPER_HEX).find((k) => PAPER_HEX[k] === colour);
  const m = key ? { map: T["paper" + key], roughness: 0.45 } : { roughness: 0.45 };
  p.add(box(size, size * 0.8, size, key ? "#ffffff" : colour, 0, size * 0.4, 0, m));
  const gm = { metalness: 0.4, roughness: 0.3 };
  p.add(box(size * 0.18, size * 0.82, size * 1.02, ribbon, 0, size * 0.4, 0, gm), box(size * 1.02, size * 0.82, size * 0.18, ribbon, 0, size * 0.4, 0, gm));
  const b = bowModel(size * 2.6, ribbon); b.position.y = size * 0.8; p.add(b);
  return p;
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
    this.renderer.toneMappingExposure = 1.22;
    this.renderer.domElement.className = "workshop3d";
    container.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color("#2b1710");
    this.camera = new THREE.OrthographicCamera(-10, 10, 10, -10, 0.1, 200);
    this.yaw = CAMERA_YAW;
    this.insets = { top: 0, bottom: 0 };

    this.tileItems = new Map();  // tile index -> { key, obj }
    this.elves = new Map();      // uid -> elf record
    this.anims = [];
    this.twinkles = [];
    this.time = 0;
    this.taps = 4;
    // Quality steps down by itself on devices that can't keep up (see render).
    this.quality = { level: 0, t: 0, n: 0, last: performance.now(), auto: !FLAGS.has("hq") };

    textures();
    this.buildRoom();
    this.buildBoard();
    this.buildLights();
    this.bake();

    this.highlight = new THREE.Group();
    const edge = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(1.03, TOP + 0.04, 1.03)), new THREE.LineBasicMaterial({ color: "#fff6b0" }));
    edge.position.y = (TOP + 0.04) / 2;
    const glow = new THREE.Mesh(new THREE.PlaneGeometry(0.98, 0.98), new THREE.MeshBasicMaterial({ color: "#fff3a0", transparent: true, opacity: 0.35, depthWrite: false }));
    glow.rotation.x = -Math.PI / 2;
    glow.position.y = TOP + 0.03;
    this.highlight.add(edge, glow);
    this.highlight.userData.glow = glow;
    this.highlight.visible = false;
    this.scene.add(this.highlight);

    // Adding ?lq to the address starts in the lightest mode (also used by the automated tests).
    if (FLAGS.has("lq")) {
      this.quality.level = 4;
      this.renderer.setPixelRatio(0.5);
      this.renderer.shadowMap.enabled = false;
      this.scene.traverse((o) => { if (o.isLight) o.castShadow = false; });
    }

    this.onResize = () => this.resize();
    window.addEventListener("resize", this.onResize);
    this.resize();
  }

  /**
   * The room and the worktops never move, so weld them into a few big meshes.
   * This cuts the drawing work from about 900 pieces to a few dozen, which matters on phones.
   */
  bake() {
    this.scene.updateMatrixWorld(true);
    const groups = new Map();
    const visit = (o) => {
      if (o.userData.dynamic) return;
      if (o.isMesh && !Array.isArray(o.material) && !o.material.transparent) {
        const key = o.material.uuid + (o.castShadow ? "s" : "");
        if (!groups.has(key)) groups.set(key, { material: o.material, shadow: o.castShadow, list: [] });
        groups.get(key).list.push(o);
      }
      for (const c of o.children) visit(c);
    };
    visit(this.scene);
    for (const { material, shadow, list } of groups.values()) {
      if (list.length < 2) continue;
      const pos = [], nor = [], uv = [];
      for (const o of list) {
        const g = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone();
        g.applyMatrix4(o.matrixWorld);
        pos.push(g.attributes.position.array); nor.push(g.attributes.normal.array); uv.push(g.attributes.uv.array);
        g.dispose();
        o.parent.remove(o);
      }
      const join = (parts) => { const out = new Float32Array(parts.reduce((n, a) => n + a.length, 0)); let at = 0; for (const a of parts) { out.set(a, at); at += a.length; } return out; };
      const merged = new THREE.BufferGeometry();
      merged.setAttribute("position", new THREE.BufferAttribute(join(pos), 3));
      merged.setAttribute("normal", new THREE.BufferAttribute(join(nor), 3));
      merged.setAttribute("uv", new THREE.BufferAttribute(join(uv), 2));
      const m = new THREE.Mesh(merged, material);
      m.castShadow = shadow;
      m.receiveShadow = true;
      this.scene.add(m);
    }
  }

  /** A small bulb with a halo that twinkles. */
  bulb(parent, colour, x, y, z, r = 0.07, haloSize = 0.6) {
    parent.add(mesh(geo("sph", r, 8, 6), glowMat(colour, 2.2), x, y, z, false));
    const h = halo(colour, haloSize, x, y, z);
    parent.add(h);
    this.twinkles.push({ h, base: haloSize, phase: Math.random() * 6 });
  }

  buildLights() {
    this.scene.add(new THREE.HemisphereLight("#ffdcb4", "#6a3c26", 0.95));
    const sun = new THREE.DirectionalLight("#ffe4bf", 1.75);
    sun.position.set(13, 15, 14);
    sun.target.position.set(7.5, 0, 4.5);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1536, 1536);
    Object.assign(sun.shadow.camera, { left: -13, right: 13, top: 10, bottom: -10, near: 1, far: 50 });
    sun.shadow.camera.updateProjectionMatrix();
    sun.shadow.bias = -0.0012;
    sun.shadow.normalBias = 0.02;
    sun.shadow.radius = 5;
    this.scene.add(sun, sun.target);
    this.fire = new THREE.PointLight("#ff8a3a", 40, 11, 1.5);
    this.fire.position.set(-2.0, 1.0, 3.5);
    this.scene.add(this.fire);
    const lamp = new THREE.PointLight("#ffc37a", 26, 16, 1.4);
    lamp.position.set(7.5, 4.5, 3);
    this.scene.add(lamp);
  }

  buildRoom() {
    const s = this.scene;
    const T = textures();
    const floor = mesh(new THREE.PlaneGeometry(90, 90), new THREE.MeshStandardMaterial({ map: T.floor, roughness: 0.85 }), 7.5, -0.02, 5, false);
    floor.rotation.x = -Math.PI / 2;
    s.add(floor);

    // back wall (north) and side wall (west), timber framed
    const NZ = -2.3, WX = -3.9, beam = "#7a4a2a";
    const plaster = { map: T.plaster, roughness: 0.95 };
    s.add(box(30, 3.6, 0.3, "#e6c198", 9, 1.8, NZ, plaster), box(0.3, 3.6, 20, "#dcb489", WX, 1.8, 6, plaster));
    s.add(woodBox(30, 0.34, 0.42, beam, 9, 0.17, NZ + 0.1), woodBox(30, 0.3, 0.42, beam, 9, 3.45, NZ + 0.1));
    s.add(woodBox(0.42, 0.34, 20, beam, WX + 0.1, 0.17, 6), woodBox(0.42, 0.3, 20, beam, WX + 0.1, 3.45, 6));
    for (const x of [WX + 0.15, 1.6, 7.4, 13.2, 19, 23.8]) s.add(woodBox(0.34, 3.6, 0.42, beam, x, 1.8, NZ + 0.1));
    for (const z of [0.4, 6.3, 11.5, 15.8]) s.add(woodBox(0.42, 3.6, 0.34, beam, WX + 0.1, 1.8, z));

    // snowy windows, glowing blue
    for (const x of [4.5, 10.3]) {
      s.add(box(2.4, 1.6, 0.1, "#7f9fe8", x, 2.05, NZ + 0.2, { emissive: "#5a78e0", emissiveIntensity: 0.9 }));
      s.add(halo("#7f9fe8", 4.2, x, 2.05, NZ + 0.5));
      s.add(woodBox(2.7, 0.14, 0.24, beam, x, 2.9, NZ + 0.24), woodBox(2.7, 0.14, 0.24, beam, x, 1.2, NZ + 0.24));
      s.add(woodBox(0.14, 1.7, 0.24, beam, x - 1.27, 2.05, NZ + 0.24), woodBox(0.14, 1.7, 0.24, beam, x + 1.27, 2.05, NZ + 0.24));
      s.add(woodBox(0.09, 1.6, 0.16, beam, x, 2.05, NZ + 0.24), woodBox(2.4, 0.09, 0.16, beam, x, 2.05, NZ + 0.24));
      s.add(box(2.5, 0.14, 0.32, "#f6f8fd", x, 1.31, NZ + 0.32));
      for (let i = 0; i < 7; i++) s.add(ball(0.035, "#ffffff", x - 1 + Math.random() * 2, 1.4 + Math.random() * 1.3, NZ + 0.27, { emissive: "#ffffff", emissiveIntensity: 0.6 }));
    }
    // shelf with spare presents
    s.add(woodBox(3.2, 0.12, 0.6, "#9a6238", 7.4, 1.0, NZ + 0.5));
    [[6.3, PAPER_HEX.red, 0.42], [6.95, PAPER_HEX.green, 0.34], [7.6, PAPER_HEX.purple, 0.4], [8.3, PAPER_HEX.blue, 0.33]].forEach(([x, c, sz]) => { const p = present(c, sz); p.position.set(x, 1.06, NZ + 0.5); s.add(p); });
    // string lights along both walls
    const bulbs = ["#ffd24a", "#ffb86b", "#ffe9a8", "#ffd24a"];
    for (let i = 0; i < 30; i++) this.bulb(s, bulbs[i % 4], WX + 0.6 + i * 0.93, 3.22 - Math.abs(Math.sin(i * 0.9)) * 0.22, NZ + 0.36, 0.06, 0.55);
    for (let i = 0; i < 12; i++) this.bulb(s, bulbs[i % 4], WX + 0.36, 3.22 - Math.abs(Math.sin(i * 0.9)) * 0.22, 6.2 + i * 0.9, 0.06, 0.55);
    // wreath with a red bow
    const wreath = new THREE.Group();
    wreath.add(mesh(geo("tor", 0.46, 0.15, 10, 26), mat("#2e7d3e", { roughness: 0.95 }), 0, 0, 0));
    for (let i = 0; i < 9; i++) { const a = i * 0.7; wreath.add(ball(0.06, i % 2 ? "#e23b3b" : GOLD, Math.cos(a) * 0.46, Math.sin(a) * 0.46, 0.13, { roughness: 0.3 })); }
    const wb = bowModel(2, "#d8343a"); wb.rotation.x = Math.PI / 2; wb.position.set(0, 0.5, 0.16); wreath.add(wb);
    wreath.position.set(14.2, 2.2, NZ + 0.3);
    s.add(wreath);

    // fireplace on the west wall
    const fp = new THREE.Group();
    const brick = { map: T.brick, roughness: 0.9 };
    fp.add(box(1.0, 2.5, 0.9, "#ffffff", 0, 1.25, -1.25, brick), box(1.0, 2.5, 0.9, "#ffffff", 0, 1.25, 1.25, brick), box(1.0, 1.0, 3.4, "#ffffff", 0, 2.0, 0, brick));
    fp.add(box(0.5, 1.5, 1.6, "#1d0f0a", -0.2, 0.75, 0));
    fp.add(woodBox(1.3, 0.16, 3.8, "#8a5632", 0.06, 2.58, 0));
    this.flames = [];
    for (let i = 0; i < 5; i++) {
      const f = mesh(geo("cone", 0.2, 0.7, 8), glowMat(i % 2 ? "#ffc23a" : "#ff6a1a", 2.6), 0.1, 0.4, -0.5 + i * 0.25, false);
      f.userData.dynamic = true;
      fp.add(f);
      this.flames.push(f);
    }
    for (const z of [-0.3, 0.3]) { const log = mesh(geo("cyl", 0.1, 0.1, 0.9, 8), mat("#4a2a18"), 0.15, 0.1, z); log.rotation.x = Math.PI / 2; log.rotation.z = z; fp.add(log); }
    fp.add(halo("#ff8a3a", 3.6, 0.6, 0.8, 0));
    // stockings, garland and candles on the mantel
    for (let i = 0; i < 4; i++) {
      const z = -1.3 + i * 0.86;
      fp.add(box(0.07, 0.42, 0.26, i % 2 ? "#d8343a" : "#f4f6fb", 0.56, 2.18, z), box(0.07, 0.16, 0.42, i % 2 ? "#d8343a" : "#f4f6fb", 0.56, 1.94, z + 0.08), box(0.08, 0.12, 0.3, "#ffffff", 0.57, 2.42, z));
    }
    for (let i = 0; i < 9; i++) fp.add(ball(0.13, "#2e7d3e", 0.3, 2.72, -1.6 + i * 0.4, { roughness: 0.95 }));
    for (const z of [-1.5, 1.5]) { fp.add(mesh(geo("cyl", 0.06, 0.06, 0.3, 10), mat("#fff4dc"), 0.2, 2.95, z)); this.bulb(fp, "#ffcf70", 0.2, 3.16, z, 0.05, 0.9); }
    fp.position.set(WX + 0.65, 0, 3.5);
    s.add(fp);

    // Christmas tree
    const tree = new THREE.Group();
    tree.add(mesh(geo("cyl", 0.16, 0.2, 0.5, 8), mat("#6b4226"), 0, 0.25, 0));
    [[1.05, 1.2, 1.0], [0.84, 1.1, 1.7], [0.6, 1.0, 2.35]].forEach(([r, h, y]) => tree.add(mesh(geo("cone", r, h, 14), mat("#2c8a45", { roughness: 0.95 }), 0, y, 0)));
    tree.add(ball(0.14, GOLD, 0, 2.95, 0, { emissive: "#ffcf40", emissiveIntensity: 1.8 }), halo("#ffd86b", 1.4, 0, 2.95, 0));
    for (let i = 0; i < 16; i++) {
      const a = i * 2.4, y = 0.8 + (i / 16) * 1.8, r = 1.0 - (i / 16) * 0.74;
      if (i % 2) this.bulb(tree, "#ffe08a", Math.cos(a) * r, y, Math.sin(a) * r, 0.05, 0.5);
      else tree.add(ball(0.09, ["#e23b3b", GOLD, "#e23b3b", "#f4f6fb"][(i / 2) % 4], Math.cos(a) * r, y, Math.sin(a) * r, { roughness: 0.25, metalness: 0.3 }));
    }
    tree.position.set(-2.3, 0, 9.2);
    s.add(tree);

    // piles of presents and lanterns around the room
    const put = (x, z, col, sz, rot = 0, y = 0) => { const p = present(col, sz); p.position.set(x, y, z); p.rotation.y = rot; s.add(p); };
    put(-0.9, 10.6, PAPER_HEX.red, 0.8, 0.3); put(-1.0, 10.6, PAPER_HEX.green, 0.55, -0.3, 0.64); put(0.3, 11.1, PAPER_HEX.green, 0.7, 0.7);
    put(-2.6, 6.6, PAPER_HEX.red, 0.7, 0.2); put(-2.5, 6.6, PAPER_HEX.blue, 0.45, 0.5, 0.56); put(-1.9, 7.4, PAPER_HEX.green, 0.5, -0.4);
    put(17.8, 8.2, PAPER_HEX.red, 0.7, 0.4); put(18.5, 7.2, PAPER_HEX.green, 0.55, -0.2); put(17.9, 9.6, PAPER_HEX.purple, 0.6, 0.9);
    put(12.9, -1.4, PAPER_HEX.red, 0.6, 0.2); put(13.6, -1.5, PAPER_HEX.green, 0.5, -0.3); put(1.2, -1.4, PAPER_HEX.blue, 0.55, 0.4);
    for (const [x, z] of [[-2.9, 0.4], [17.6, 6.2], [2.4, 11.3]]) {
      s.add(mesh(geo("cyl", 0.16, 0.2, 0.36, 8), mat("#5a4636", { metalness: 0.4, roughness: 0.5 }), x, 0.18, z), mesh(geo("cone", 0.2, 0.16, 8), mat("#5a4636", { metalness: 0.4 }), x, 0.44, z));
      this.bulb(s, "#ffc060", x, 0.2, z, 0.1, 1.3);
    }
  }

  buildBoard() {
    const s = this.scene;
    const T = textures();
    const solid = (c, r) => tileAt(c, r) !== "." && r >= 0 && r < ROWS && c >= 0 && c < COLS;
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const ch = MAP[r][c];
        const x = c + 0.5, z = r + 0.5;
        if (ch === ".") {
          const zone = zoneOf(c, r);
          const col = new THREE.Color(ZONE[zone]);
          if ((c + r) % 2) col.multiplyScalar(0.94);
          s.add(mesh(geo("box", 1, 0.1, 1), mat("#" + col.getHexString(), { map: zone === "wrap" ? T.mat : T.tile, roughness: 0.8 }), x, 0.01, z, false));
          continue;
        }
        const g = new THREE.Group();
        g.position.set(x, 0, z);
        g.add(woodBox(1, TOP - 0.1, 1, WOOD, 0, (TOP - 0.1) / 2, 0));
        // drawers on the faces that look towards the camera
        if (!solid(c, r + 1)) {
          g.add(box(0.8, 0.26, 0.03, "#d9ab78", 0, TOP * 0.5, 0.505), box(0.22, 0.04, 0.04, WOOD_DARK, 0, TOP * 0.5, 0.53));
        }
        if (!solid(c + 1, r)) g.add(box(0.03, 0.26, 0.8, "#d2a370", 0.505, TOP * 0.5, 0), box(0.04, 0.04, 0.22, WOOD_DARK, 0.53, TOP * 0.5, 0));
        const topCol = TOYS[ch] ? ZONE.toys : ch === "B" ? ZONE.boxes : PAPERS[ch] ? ZONE.paper : ch === "R" || ch === "O" ? ZONE.trim : ch === "W" ? "#5cc47e" : ch === "D" ? "#3d4150" : "#eccb9c";
        g.add(box(1.02, 0.1, 1.02, topCol, 0, TOP - 0.05, 0, { map: ch === "W" ? T.mat : T.tile, roughness: 0.7 }));
        this.decorate(g, ch, c, r);
        s.add(g);
      }
    }
    // floor pads that mark each zone
    s.add(pad("box", ZONE.toys, 2.5, 1.5), pad("gift", ZONE.paper, 9.5, 1.5), pad("bow", ZONE.trim, 12.5, 1.5), pad("gift", ZONE.send, 12.5, 4.5));

    // plinth with fairy lights along the edges that face the camera
    s.add(woodBox(COLS + 0.5, 0.12, ROWS + 0.5, WOOD_DARK, COLS / 2, -0.05, ROWS / 2));
    for (let i = 0; i <= 18; i++) this.bulb(s, "#ffd98a", 0.2 + i * 0.81, 0.06, ROWS + 0.3, 0.05, 0.5);
    for (let i = 0; i < 4; i++) this.bulb(s, "#ffd98a", COLS + 0.3, 0.06, ROWS - 0.6 - i * 0.8, 0.05, 0.5);

    // conveyor belt up to the sleigh
    const BX = 15.85;
    this.beltTex = T.belt;
    s.add(woodBox(1.5, 0.56, 6.2, "#cfa57a", BX, 0.28, 3.5));
    s.add(mesh(new THREE.BoxGeometry(1.1, 0.12, 6.2), new THREE.MeshStandardMaterial({ map: this.beltTex, roughness: 0.55 }), BX, 0.6, 3.5));
    const rail = { metalness: 0.6, roughness: 0.25 };
    for (const dx of [-0.62, 0.62]) s.add(box(0.09, 0.18, 6.3, GOLD, BX + dx, 0.68, 3.5, rail));
    const cap = mesh(geo("cyl", 0.75, 0.75, 0.56, 20, 1, false, 0, Math.PI), mat("#cfa57a", { map: T.wood }), BX, 0.28, 6.6);
    cap.rotation.y = -Math.PI / 2;
    s.add(cap);
    for (let i = 0; i < 6; i++) this.bulb(s, "#ffd98a", BX + 0.82, 0.3, 1 + i, 0.05, 0.5);

    // sleigh
    const sl = new THREE.Group();
    const red = { roughness: 0.3 };
    sl.add(box(1.5, 0.5, 1.7, "#c9282d", 0, 0.55, 0, red), box(1.5, 1.0, 0.18, "#c9282d", 0, 0.9, -0.8, red), box(1.5, 0.34, 0.18, "#c9282d", 0, 0.96, 0.82, red));
    sl.add(box(1.34, 0.22, 0.7, "#2f7d3f", 0, 0.9, -0.3), box(1.3, 0.3, 0.14, "#2f7d3f", 0, 1.1, -0.66));
    const gold = { metalness: 0.65, roughness: 0.22 };
    for (const sx of [-1, 1]) {
      sl.add(box(0.08, 0.08, 2.1, GOLD, sx * 0.62, 0.08, 0, gold));
      const curl = mesh(geo("tor", 0.26, 0.04, 8, 14, Math.PI), mat(GOLD, gold), sx * 0.62, 0.34, 1.05);
      curl.rotation.y = Math.PI / 2; curl.rotation.x = -Math.PI / 2;
      sl.add(curl);
      sl.add(box(0.07, 0.24, 0.07, GOLD, sx * 0.62, 0.2, 0.5, gold), box(0.07, 0.24, 0.07, GOLD, sx * 0.62, 0.2, -0.5, gold));
      sl.add(box(0.06, 0.07, 1.74, GOLD, sx * 0.76, 0.82, 0, gold));
    }
    sl.add(box(1.56, 0.08, 0.08, GOLD, 0, 1.42, -0.8, gold), box(1.56, 0.07, 0.08, GOLD, 0, 1.14, 0.82, gold));
    sl.position.set(BX, 0, -0.75);
    this.sleighAt = [BX, -0.75];
    sl.userData.dynamic = true;
    this.sleigh = sl;
    s.add(sl);
  }

  decorate(g, ch, c, r) {
    const T = textures();
    if (TOYS[ch]) {
      const toy = TOYS[ch];
      // slatted wooden crate with blue metal corners
      for (const [dx, dz] of [[-0.45, 0], [0.45, 0], [0, -0.45], [0, 0.45]]) {
        for (const y of [0.12, 0.32]) g.add(woodBox(dx ? 0.07 : 0.94, 0.15, dx ? 0.94 : 0.07, "#b98150", dx, TOP + y, dz));
      }
      for (const dx of [-0.45, 0.45]) for (const dz of [-0.45, 0.45]) g.add(box(0.12, 0.46, 0.12, "#6d8fc2", dx, TOP + 0.23, dz, { metalness: 0.4, roughness: 0.4 }));
      const a = toyModel(toy); a.position.set(-0.13, TOP + 0.08, 0.08); a.scale.setScalar(1.1); a.rotation.y = 0.3;
      const b = toyModel(toy); b.position.set(0.18, TOP + 0.04, -0.14); b.scale.setScalar(0.95); b.rotation.y = -0.6;
      g.add(a, b, sign(TOY_EMOJI[toy], ZONE.toys));
    } else if (ch === "B") {
      g.add(box(0.7, 0.2, 0.7, CARD, 0, TOP + 0.1, 0), box(0.64, 0.2, 0.64, "#d6ab74", 0.03, TOP + 0.3, 0.02), box(0.6, 0.2, 0.6, CARD, -0.02, TOP + 0.5, 0));
      g.add(box(0.12, 0.012, 0.6, "#e9d3ad", -0.02, TOP + 0.606, 0));
      if (c === 5) { const s = sign("box", "#f0a85c"); s.position.x = 0.5; g.add(s); }
    } else if (PAPERS[ch]) {
      const name = PAPERS[ch];
      // rolls standing in a wooden rack
      g.add(woodBox(0.98, 0.5, 0.08, "#a8703f", 0, TOP + 0.25, -0.44), woodBox(0.98, 0.16, 0.08, "#a8703f", 0, TOP + 0.08, 0.3));
      for (const dx of [-0.46, 0.46]) g.add(woodBox(0.07, 0.5, 0.8, "#a8703f", dx, TOP + 0.25, -0.06));
      for (const dx of [-0.26, 0, 0.26]) {
        const roll = mesh(geo("cyl", 0.115, 0.115, 0.84, 16), mat("#ffffff", { map: T["paper" + name], roughness: 0.45 }), dx, TOP + 0.44, -0.12);
        roll.rotation.x = 0.28;
        const core = mesh(geo("cyl", 0.05, 0.05, 0.86, 10), mat("#f3e6cf"), dx, TOP + 0.44, -0.12);
        core.rotation.x = 0.28;
        g.add(roll, core);
      }
      g.add(sign("gift", PAPER_HEX[name]));
    } else if (ch === "R") {
      for (const dx of [-0.46, 0.46]) g.add(woodBox(0.08, 0.5, 0.5, "#a8703f", dx, TOP + 0.25, 0));
      g.add(woodBox(0.98, 0.08, 0.5, "#a8703f", 0, TOP + 0.04, 0));
      const rod = mesh(geo("cyl", 0.03, 0.03, 0.96, 8), mat(WOOD_DARK), 0, TOP + 0.33, 0);
      rod.rotation.z = Math.PI / 2;
      g.add(rod);
      [GOLD, "#f08db0", GOLD].forEach((col, i) => { const sp = spoolModel(col, 0.16); sp.rotation.z = Math.PI / 2; sp.position.set(-0.27 + i * 0.27, TOP + 0.33, 0); g.add(sp); });
      g.add(sign("ribbon", "#f0b93a"));
    } else if (ch === "O") {
      g.add(mesh(geo("cyl", 0.42, 0.34, 0.26, 16), mat("#b98150", { map: T.wood }), 0, TOP + 0.13, 0));
      for (const [dx, dz, rr] of [[-0.15, 0.06, 0.2], [0.15, -0.06, -0.5], [0.02, 0.17, 1.1]]) {
        const b = bowModel(1.6); b.position.set(dx, TOP + 0.26, dz); b.rotation.y = rr; g.add(b);
      }
      g.add(sign("bow", "#f0b93a"));
    } else if (ch === "W") {
      // tape dispenser at the back of the mat
      const colour = (c + r) % 2 ? "#e0453c" : "#4f8fd8";
      g.add(box(0.26, 0.09, 0.14, colour, 0.3, TOP + 0.045, -0.37, { roughness: 0.4 }));
      const tape = mesh(geo("cyl", 0.08, 0.08, 0.07, 14), mat("#fbe7c8"), 0.27, TOP + 0.13, -0.37);
      tape.rotation.x = Math.PI / 2;
      g.add(tape);
      if (c === 6) { const s = sign("tape", "#4fc777"); s.position.x = 0.5; g.add(s); }
    } else if (ch === "D") {
      for (const dz of [-0.3, 0, 0.3]) {
        const roller = mesh(geo("cyl", 0.055, 0.055, 0.94, 10), mat("#9aa0b2", { metalness: 0.55, roughness: 0.35 }), 0, TOP + 0.02, dz);
        roller.rotation.z = Math.PI / 2;
        g.add(roller);
      }
      g.add(box(0.06, 0.1, 1.02, GOLD, -0.5, TOP + 0.03, 0, { metalness: 0.6, roughness: 0.25 }));
      if (r === 4) g.add(sign("🛷", "#ef6a5e"));
    } else if (ch === "X") {
      g.add(mesh(geo("cyl", 0.34, 0.26, 0.4, 14), mat("#727a8a", { metalness: 0.45, roughness: 0.45 }), 0, TOP + 0.2, 0), mesh(geo("cyl", 0.3, 0.3, 0.02, 14), mat("#22242a"), 0, TOP + 0.41, 0));
      g.add(sign("🗑️", "#8b93a6", 1.7, 0.66));
    }
  }

  // ---------- camera ----------
  setInsets(top, bottom) { this.insets = { top, bottom }; this.resize(); }

  resize() {
    const w = this.container.clientWidth || window.innerWidth;
    const h = this.container.clientHeight || window.innerHeight;
    this.renderer.setSize(w, h, false);
    const yaw = this.yaw, el = CAMERA_TILT;
    const centre = new THREE.Vector3(8, 0.4, 4.4);
    const cam = this.camera;
    cam.position.set(centre.x + 60 * Math.sin(yaw) * Math.cos(el), centre.y + 60 * Math.sin(el), centre.z + 60 * Math.cos(yaw) * Math.cos(el));
    cam.up.set(0, 1, 0);
    cam.lookAt(centre);
    cam.updateMatrixWorld(true);
    const inv = cam.matrixWorldInverse.copy(cam.matrixWorld).invert();
    // Everything that must stay on screen: the board, its signs, the belt and the sleigh.
    let minX = 1e9, maxX = -1e9, minY = 1e9, maxY = -1e9;
    const v = new THREE.Vector3();
    const pts = [];
    for (const x of [-0.3, COLS + 0.3]) for (const z of [-0.3, ROWS + 0.4]) pts.push([x, 0, z]);
    for (const x of [0.2, COLS]) pts.push([x, 2.45, 0.2]);
    pts.push([16.7, 0, 6.9], [16.7, 1.5, -1.6], [15, 1.5, -1.6]);
    for (const p of pts) {
      v.set(p[0], p[1], p[2]).applyMatrix4(inv);
      minX = Math.min(minX, v.x); maxX = Math.max(maxX, v.x);
      minY = Math.min(minY, v.y); maxY = Math.max(maxY, v.y);
    }
    const availH = Math.max(120, h - this.insets.top - this.insets.bottom);
    const unitsPerPx = Math.max((maxX - minX) / (w * 0.98), (maxY - minY) / availH);
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
        // soft pool of the elf's own colour on the floor
        const pool = new THREE.Mesh(geo("circ", 0.62, 24), new THREE.MeshBasicMaterial({ map: textures().glow, color: ELF_COLOURS[p.slot % 4], transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending }));
        pool.rotation.x = -Math.PI / 2;
        pool.position.y = 0.075;
        group.add(pool);
        if (p.me) {
          const ring = new THREE.Mesh(new THREE.RingGeometry(0.47, 0.56, 30), new THREE.MeshBasicMaterial({ color: "#fff6b0", transparent: true, opacity: 0.9, depthWrite: false }));
          ring.rotation.x = -Math.PI / 2;
          ring.position.y = 0.08;
          group.add(ring);
        }
        group.position.set(p.x, 0, p.z);
        this.scene.add(group);
        e = { group, x: p.x, z: p.z, r: 0, tx: p.x, tz: p.z, tr: 0, me: p.me, moving: false, label };
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
      const item = G?.h?.[uid] || null;
      this.swap(holder, e.group, item, 0.18, 0.76);
      // speech bubble showing what is in the elf's hands
      if (!e.bubble) {
        e.bubble = sprite(null, 1, 2.78);
        e.bubble.scale.set(1.15, 1.035, 1);
        e.bubble.renderOrder = 12;
        e.group.add(e.bubble);
      }
      e.bubble.visible = !!item;
      if (item) {
        const tex = heldTexture(item, taps);
        if (e.bubble.material.map !== tex) {
          e.bubble.material.map = tex;
          e.bubble.material.needsUpdate = true;
          const b = e.bubble;
          this.anims.push({ t: 0, d: 0.2, step: (k) => b.scale.set(1.15 * (0.6 + 0.4 * k), 1.035 * (0.6 + 0.4 * k), 1) });
        }
      }
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
    const [sx, sz] = this.sleighAt;
    const path = [[14.5, TOP + 0.06, z0], [sx, 0.68, z0], [sx, 0.68, 0.6], [sx, 1.0, sz + 0.2]];
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

  /** If the frame rate is poor, draw fewer pixels, and as a last resort drop the shadows. */
  watchSpeed() {
    const q = this.quality, now = performance.now();
    const real = (now - q.last) / 1000;
    q.last = now;
    if (!q.auto || real > 3) return; // tab was hidden
    q.t += real; q.n++;
    if (q.t < 2) return;
    const fps = q.n / q.t;
    q.t = 0; q.n = 0;
    if (fps >= 27 || q.level >= 4) return;
    q.level++;
    const ratio = [2, 1.5, 1, 0.75, 0.75][q.level];
    if (ratio < this.renderer.getPixelRatio()) { this.renderer.setPixelRatio(ratio); this.resize(); }
    if (q.level === 4) {
      this.renderer.shadowMap.enabled = false;
      this.scene.traverse((o) => { if (o.isLight) o.castShadow = false; if (o.material) o.material.needsUpdate = true; });
    }
  }

  render(dt) {
    this.watchSpeed();
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
      body.position.y = e.moving ? Math.abs(Math.sin(t * 13)) * 0.1 : Math.sin(t * 2.4) * 0.02;
      body.rotation.z = e.moving ? Math.sin(t * 13) * 0.07 : 0;
      const [a, b] = e.group.userData.arms;
      const want = e.holding ? -0.05 : e.moving ? 0.7 : 1.0;
      a.rotation.x += (want + (e.moving && !e.holding ? Math.sin(t * 13) * 0.5 : 0) - a.rotation.x) * 0.3;
      b.rotation.x += (want - (e.moving && !e.holding ? Math.sin(t * 13) * 0.5 : 0) - b.rotation.x) * 0.3;
      e.label.material.opacity = e.away ? 0.4 : 1;
      body.scale.setScalar(e.away ? 1.05 : 1.32);
    }
    for (let i = this.anims.length - 1; i >= 0; i--) {
      const a = this.anims[i];
      a.t += dt;
      const k = Math.min(1, a.t / a.d);
      a.step(k);
      if (k >= 1) { a.done?.(); this.anims.splice(i, 1); }
    }
    if (this.highlight.visible) this.highlight.userData.glow.material.opacity = 0.25 + 0.2 * Math.sin(t * 7);
    for (const tw of this.twinkles) tw.h.scale.setScalar(tw.base * (0.85 + 0.2 * Math.sin(t * 2.2 + tw.phase)));
    this.beltTex.offset.y = (t * 0.6) % 1;
    this.fire.intensity = 36 + Math.sin(t * 11) * 5 + Math.sin(t * 23) * 4;
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
