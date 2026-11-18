/**
 * Optional tilt steering using DeviceOrientation.
 *
 * In landscape, tilting the phone like a steering wheel (one edge down)
 * changes `beta`. Its sign depends on which way the phone is rotated, so
 * we flip it using screen.orientation.angle. The position when tilt is
 * enabled (or recalibrated) counts as "straight ahead".
 *
 * iOS 13+ requires DeviceOrientationEvent.requestPermission() from a tap.
 */
import { clamp } from '../core/geo.js';

const MAX_TILT_DEG = 25; // tilt for full lock
const DEADZONE_DEG = 2;

export class TiltInput {
  constructor() {
    this.enabled = false;
    this.invert = false;
    this.raw = 0;
    this.zero = null;
    this.steer = 0;
    this._onOrient = (e) => this._handle(e);
  }

  static get supported() {
    return typeof window !== 'undefined' && 'DeviceOrientationEvent' in window;
  }

  /** Must be called from a user gesture (tap) for iOS permission. */
  async enable() {
    if (!TiltInput.supported) return false;
    const DOE = window.DeviceOrientationEvent;
    if (typeof DOE.requestPermission === 'function') {
      try {
        if ((await DOE.requestPermission()) !== 'granted') return false;
      } catch {
        return false;
      }
    }
    window.addEventListener('deviceorientation', this._onOrient);
    this.enabled = true;
    this.zero = null; // calibrate on first reading
    return true;
  }

  disable() {
    window.removeEventListener('deviceorientation', this._onOrient);
    this.enabled = false;
    this.steer = 0;
  }

  calibrate() {
    this.zero = this.raw;
  }

  _angle() {
    const a = screen.orientation?.angle ?? window.orientation ?? 0;
    return ((a % 360) + 360) % 360;
  }

  _handle(e) {
    if (e.beta == null) return;
    const angle = this._angle();
    // Landscape: steering is beta (sign by rotation). Portrait: gamma.
    let v;
    if (angle === 90) v = e.beta;
    else if (angle === 270) v = -e.beta;
    else v = e.gamma ?? 0;
    this.raw = v;
    if (this.zero === null) this.zero = v;
    let d = v - this.zero;
    if (Math.abs(d) < DEADZONE_DEG) d = 0;
    else d -= Math.sign(d) * DEADZONE_DEG;
    this.steer = clamp((d / MAX_TILT_DEG) * (this.invert ? -1 : 1), -1, 1);
  }

  read(ctl) {
    if (this.enabled && this.steer) ctl.steer = this.steer;
  }
}
