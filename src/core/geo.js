/**
 * Geographic helpers.
 *
 * Physics runs in a flat local frame measured in metres (x = east,
 * y = north) centred on an origin near the start city. An equirectangular
 * projection is accurate to well under 1% across a 150 km race route at
 * Chhattisgarh's latitudes (18°–24° N), which is plenty for an arcade game,
 * and keeps the maths cheap.
 */

const EARTH_RADIUS = 6378137; // WGS84 equatorial radius, metres
const DEG = Math.PI / 180;

export class LocalFrame {
  /** @param {number} lng @param {number} lat origin of the frame */
  constructor(lng, lat) {
    this.lng0 = lng;
    this.lat0 = lat;
    this.mPerDegLat = EARTH_RADIUS * DEG;
    this.mPerDegLng = EARTH_RADIUS * DEG * Math.cos(lat * DEG);
  }

  /** lng/lat (degrees) → local metres. Writes into `out` to avoid garbage. */
  toLocal(lng, lat, out = { x: 0, y: 0 }) {
    out.x = (lng - this.lng0) * this.mPerDegLng;
    out.y = (lat - this.lat0) * this.mPerDegLat;
    return out;
  }

  /** Local metres → [lng, lat]. Writes into `out` (an array) if given. */
  toLngLat(x, y, out = [0, 0]) {
    out[0] = this.lng0 + x / this.mPerDegLng;
    out[1] = this.lat0 + y / this.mPerDegLat;
    return out;
  }
}

/* ---------- small math utilities shared by all modules ---------- */

export const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
export const lerp = (a, b, t) => a + (b - a) * t;

/** Move `v` towards `target` by at most `step`. */
export function approach(v, target, step) {
  if (v < target) return Math.min(v + step, target);
  return Math.max(v - step, target);
}

/** Wrap an angle in radians to (-π, π]. */
export function wrapAngle(a) {
  a = (a + Math.PI) % (2 * Math.PI);
  if (a < 0) a += 2 * Math.PI;
  return a - Math.PI;
}

/** Frame-rate independent exponential smoothing factor. */
export const smoothing = (rate, dt) => 1 - Math.exp(-rate * dt);
