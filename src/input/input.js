/**
 * Input manager: merges keyboard, touch and tilt into one control state
 * that the physics reads each step. Any device can drive at any time.
 */
import { KeyboardInput } from './keyboard.js';
import { TouchInput } from './touch.js';
import { TiltInput } from './tilt.js';

export const isTouchDevice = () =>
  window.matchMedia?.('(pointer: coarse)').matches || 'ontouchstart' in window;

export class InputManager {
  /** @param {HTMLElement} touchRoot */
  constructor(touchRoot) {
    this.keyboard = new KeyboardInput();
    this.touch = new TouchInput(touchRoot);
    this.tilt = new TiltInput();
    this.ctl = { throttle: 0, brake: 0, steer: 0, handbrake: false };
  }

  /**
   * @param {'buttons'|'joystick'|'tilt'} mode
   * @returns {Promise<boolean>} false if tilt was requested but unavailable
   */
  async setSteeringMode(mode) {
    if (mode === 'tilt') {
      const ok = this.tilt.enabled || (await this.tilt.enable());
      if (!ok) {
        this.touch.setMode('buttons');
        return false;
      }
    } else if (this.tilt.enabled) {
      this.tilt.disable();
    }
    this.touch.setMode(mode);
    return true;
  }

  /** Current merged controls (the same object is reused every frame). */
  read() {
    const c = this.ctl;
    c.throttle = 0;
    c.brake = 0;
    c.steer = 0;
    c.handbrake = false;
    this.tilt.read(c);
    this.touch.read(c);
    this.keyboard.read(c);
    return c;
  }
}
