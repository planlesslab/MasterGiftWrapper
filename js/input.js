// Keyboard, touch joystick and the action button.

const KEYS = {
  ArrowUp: [0, 1], KeyW: [0, 1], ArrowDown: [0, -1], KeyS: [0, -1],
  ArrowLeft: [-1, 0], KeyA: [-1, 0], ArrowRight: [1, 0], KeyD: [1, 0],
};
const ACTION_KEYS = new Set(["Space", "KeyE", "Enter", "KeyJ"]);

export class Input {
  /** stick: the joystick zone element. button: the action button. onAction: called on each press. */
  constructor({ stick, knob, button, onAction }) {
    this.down = new Set();
    this.touch = { id: null, ox: 0, oy: 0, x: 0, y: 0 };
    this.stick = stick; this.knob = knob;
    this.onAction = onAction;
    this.off = [];
    const on = (el, ev, fn, opts) => { el.addEventListener(ev, fn, opts); this.off.push(() => el.removeEventListener(ev, fn, opts)); };

    on(window, "keydown", (e) => {
      if (e.target?.tagName === "INPUT") return;
      if (KEYS[e.code]) { this.down.add(e.code); e.preventDefault(); }
      if (ACTION_KEYS.has(e.code)) { e.preventDefault(); if (!e.repeat) this.onAction(); }
    });
    on(window, "keyup", (e) => this.down.delete(e.code));
    on(window, "blur", () => this.down.clear());

    on(stick, "pointerdown", (e) => {
      if (this.touch.id !== null) return;
      stick.setPointerCapture?.(e.pointerId);
      const r = stick.getBoundingClientRect();
      Object.assign(this.touch, { id: e.pointerId, ox: r.left + r.width / 2, oy: r.top + r.height / 2 });
      this.moveStick(e);
    });
    on(stick, "pointermove", (e) => { if (e.pointerId === this.touch.id) this.moveStick(e); });
    const end = (e) => {
      if (e.pointerId !== this.touch.id) return;
      Object.assign(this.touch, { id: null, x: 0, y: 0 });
      knob.style.transform = "";
    };
    on(stick, "pointerup", end);
    on(stick, "pointercancel", end);

    on(button, "pointerdown", (e) => { e.preventDefault(); this.onAction(); });
    on(button, "contextmenu", (e) => e.preventDefault());
  }

  moveStick(e) {
    const max = this.stick.clientWidth * 0.36;
    let dx = e.clientX - this.touch.ox, dy = e.clientY - this.touch.oy;
    // When the game is drawn on its side (phone held upright), turn the drag to match.
    if (this.rotated) [dx, dy] = [dy, -dx];
    const len = Math.hypot(dx, dy);
    if (len > max) { dx *= max / len; dy *= max / len; }
    this.knob.style.transform = `translate(${dx}px, ${dy}px)`;
    this.touch.x = dx / max;
    this.touch.y = -dy / max;
  }

  /** Movement wanted right now: x is screen-right, y is screen-up, length at most 1. */
  axis() {
    let x = this.touch.x, y = this.touch.y;
    if (Math.hypot(x, y) < 0.18) { x = 0; y = 0; }
    for (const code of this.down) { x += KEYS[code][0]; y += KEYS[code][1]; }
    const len = Math.hypot(x, y);
    return len > 1 ? { x: x / len, y: y / len } : { x, y };
  }

  destroy() { this.off.forEach((fn) => fn()); }
}
