// Keyboard, mouse (pointer lock or drag) and gamepad.
export class Input {
  constructor(canvas) {
    this.keys = new Set();
    this.pressed = new Set();
    this.dx = 0; this.dy = 0; this.wheel = 0;
    this.canvas = canvas;
    this.dragging = false;
    addEventListener('keydown', (e) => {
      if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT')) return;
      if (!this.keys.has(e.code)) this.pressed.add(e.code);
      this.keys.add(e.code);
      if (['Tab', 'Space', 'ArrowUp', 'ArrowDown'].includes(e.code)) e.preventDefault();
    });
    addEventListener('keyup', (e) => this.keys.delete(e.code));
    addEventListener('blur', () => this.keys.clear());
    canvas.addEventListener('mousedown', (e) => { this.dragging = true; if (e.button === 0 && this.wantLock && document.pointerLockElement !== canvas) canvas.requestPointerLock?.(); });
    addEventListener('mouseup', () => (this.dragging = false));
    addEventListener('mousemove', (e) => {
      if (document.pointerLockElement === canvas || this.dragging) { this.dx += e.movementX; this.dy += e.movementY; }
    });
    canvas.addEventListener('wheel', (e) => { this.wheel += Math.sign(e.deltaY); e.preventDefault(); }, { passive: false });
    this.wantLock = true;
  }
  down(...codes) { return codes.some((c) => this.keys.has(c)); }
  hit(...codes) { return codes.some((c) => this.pressed.has(c)); }
  axes() {
    let x = 0, y = 0;
    if (this.down('KeyW', 'ArrowUp')) y += 1;
    if (this.down('KeyS', 'ArrowDown')) y -= 1;
    if (this.down('KeyA', 'ArrowLeft')) x -= 1;
    if (this.down('KeyD', 'ArrowRight')) x += 1;
    const gp = navigator.getGamepads ? [...navigator.getGamepads()].find(Boolean) : null;
    if (gp) {
      const dz = (v) => (Math.abs(v) < 0.15 ? 0 : v);
      x += dz(gp.axes[0]); y -= dz(gp.axes[1]);
      this.dx += dz(gp.axes[2]) * 14; this.dy += dz(gp.axes[3]) * 10;
      const b = (i) => gp.buttons[i]?.pressed;
      const edge = (i, code) => { const k = '__gp' + i; if (b(i) && !this[k]) this.pressed.add(code); this[k] = b(i); };
      edge(0, 'Space'); edge(2, 'KeyE'); edge(3, 'Tab'); edge(1, 'KeyE');
      if (b(7)) y = Math.max(y, gp.buttons[7].value); if (b(6)) y = Math.min(y, -gp.buttons[6].value);
      if (b(10) || b(4)) this.keys.add('ShiftLeft'); else if (this.__gpShift) this.keys.delete('ShiftLeft');
      this.__gpShift = b(10) || b(4);
    }
    const l = Math.hypot(x, y);
    return l > 1 ? { x: x / l, y: y / l } : { x, y };
  }
  endFrame() { this.pressed.clear(); this.dx = 0; this.dy = 0; this.wheel = 0; }
}
