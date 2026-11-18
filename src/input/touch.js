/**
 * On-screen touch controls.
 *
 * Left thumb: steering, in one of two styles:
 *   - "buttons": big ◀ ▶ pads
 *   - "joystick": drag horizontally anywhere in the left zone (analogue)
 * Right thumb: GAS and BRAKE pedals plus a DRIFT (handbrake) button.
 *
 * Pointer Events with pointer capture give reliable multi-touch: each
 * control tracks its own pointer ids, so you can steer, accelerate and
 * drift with three fingers at once.
 */
import { clamp } from '../core/geo.js';

/**
 * Make `el` a hold-to-activate control.
 * @param {HTMLElement} el
 * @param {{down?:(e:PointerEvent)=>void, move?:(e:PointerEvent)=>void, up?:()=>void}} h
 */
function holdable(el, h) {
  const active = new Set();
  el.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    el.setPointerCapture?.(e.pointerId);
    active.add(e.pointerId);
    el.classList.add('pressed');
    h.down?.(e);
  });
  el.addEventListener('pointermove', (e) => {
    if (active.has(e.pointerId)) h.move?.(e);
  });
  const end = (e) => {
    if (!active.delete(e.pointerId)) return;
    if (active.size === 0) {
      el.classList.remove('pressed');
      h.up?.();
    }
  };
  el.addEventListener('pointerup', end);
  el.addEventListener('pointercancel', end);
  el.addEventListener('lostpointercapture', end);
  el.addEventListener('contextmenu', (e) => e.preventDefault());
}

export class TouchInput {
  /** @param {HTMLElement} root container for the controls */
  constructor(root) {
    this.root = root;
    this.state = { throttle: 0, brake: 0, steer: 0, handbrake: false };
    this.btnSteer = { left: false, right: false };
    this.stickSteer = 0;
    this.mode = 'buttons';
    this._build();
  }

  _build() {
    this.root.innerHTML = `
      <div class="steer-zone" data-mode="buttons">
        <button class="pad pad-left" aria-label="Steer left">◀</button>
        <button class="pad pad-right" aria-label="Steer right">▶</button>
        <div class="stick" aria-label="Steering joystick">
          <div class="stick-track"></div>
          <div class="stick-knob"></div>
        </div>
      </div>
      <div class="pedal-zone">
        <button class="pedal drift" aria-label="Handbrake / drift">DRIFT</button>
        <button class="pedal brake" aria-label="Brake / reverse">BRAKE</button>
        <button class="pedal gas" aria-label="Accelerate">GAS</button>
      </div>`;

    const $ = (s) => this.root.querySelector(s);
    this.steerZone = $('.steer-zone');
    const st = this.state;

    holdable($('.pad-left'), { down: () => (this.btnSteer.left = true), up: () => (this.btnSteer.left = false) });
    holdable($('.pad-right'), { down: () => (this.btnSteer.right = true), up: () => (this.btnSteer.right = false) });
    holdable($('.gas'), { down: () => (st.throttle = 1), up: () => (st.throttle = 0) });
    holdable($('.brake'), { down: () => (st.brake = 1), up: () => (st.brake = 0) });
    holdable($('.drift'), { down: () => (st.handbrake = true), up: () => (st.handbrake = false) });

    // Joystick: the touch-down point is the centre; ±RANGE px = full lock.
    const stick = $('.stick');
    const knob = $('.stick-knob');
    const RANGE = 70;
    let originX = 0;
    holdable(stick, {
      down: (e) => {
        originX = e.clientX;
        const r = stick.getBoundingClientRect();
        stick.style.setProperty('--ox', `${e.clientX - r.left}px`);
        stick.style.setProperty('--oy', `${e.clientY - r.top}px`);
        stick.classList.add('active');
      },
      move: (e) => {
        this.stickSteer = clamp((e.clientX - originX) / RANGE, -1, 1);
        knob.style.transform = `translate(${this.stickSteer * RANGE}px, 0)`;
      },
      up: () => {
        this.stickSteer = 0;
        knob.style.transform = '';
        stick.classList.remove('active');
      },
    });
  }

  /** 'buttons' | 'joystick' | 'tilt' (tilt hides the left-hand controls). */
  setMode(mode) {
    this.mode = mode;
    this.steerZone.dataset.mode = mode;
  }

  setVisible(v) {
    this.root.hidden = !v;
  }

  read(ctl) {
    const st = this.state;
    if (st.throttle) ctl.throttle = Math.max(ctl.throttle, st.throttle);
    if (st.brake) ctl.brake = Math.max(ctl.brake, st.brake);
    if (st.handbrake) ctl.handbrake = true;
    let steer = 0;
    if (this.mode === 'buttons') steer = (this.btnSteer.right ? 1 : 0) - (this.btnSteer.left ? 1 : 0);
    else if (this.mode === 'joystick') steer = this.stickSteer;
    if (steer) ctl.steer = steer;
  }
}
