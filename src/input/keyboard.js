/**
 * Keyboard input (desktop fallback): WASD / arrow keys, Space = handbrake.
 * Keys are digital; the vehicle's steering slew makes them feel analogue.
 */
const BINDINGS = {
  throttle: ['KeyW', 'ArrowUp'],
  brake: ['KeyS', 'ArrowDown'],
  left: ['KeyA', 'ArrowLeft'],
  right: ['KeyD', 'ArrowRight'],
  handbrake: ['Space', 'ShiftLeft', 'ShiftRight'],
};
const GAME_KEYS = new Set(Object.values(BINDINGS).flat());

export class KeyboardInput {
  constructor() {
    this.down = new Set();
    this.used = false; // becomes true after the first game key press
    window.addEventListener('keydown', (e) => {
      if (!GAME_KEYS.has(e.code)) return;
      e.preventDefault(); // stop arrows/space scrolling the page
      this.down.add(e.code);
      this.used = true;
    });
    window.addEventListener('keyup', (e) => this.down.delete(e.code));
    window.addEventListener('blur', () => this.down.clear());
  }

  _any(action) {
    return BINDINGS[action].some((k) => this.down.has(k));
  }

  /** Merge this device's state into the shared control object. */
  read(ctl) {
    if (this._any('throttle')) ctl.throttle = 1;
    if (this._any('brake')) ctl.brake = 1;
    const steer = (this._any('right') ? 1 : 0) - (this._any('left') ? 1 : 0);
    if (steer) ctl.steer = steer;
    if (this._any('handbrake')) ctl.handbrake = true;
  }
}
