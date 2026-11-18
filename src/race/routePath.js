/**
 * A race line resampled every STEP metres in local coordinates.
 *
 * Gives O(1) point/heading lookups by distance and a windowed projection
 * (which point on the line is the car at?). The window means a car can't
 * jump ahead by being near a later part of the route, so shortcuts and
 * hairpins don't skip checkpoints. It also pre-computes corner radii so
 * the AI knows how fast each part of the line can be taken.
 */
export const STEP = 5;

export class RoutePath {
  /**
   * @param {number[][]} coords [lng, lat] polyline
   * @param {import('../core/geo.js').LocalFrame} frame
   * @param {{closed?: boolean, cutAt?: number}} opts cutAt: stop after N metres
   */
  constructor(coords, frame, { closed = false, cutAt = Infinity } = {}) {
    this.closed = closed;
    const pts = coords.map(([lng, lat]) => frame.toLocal(lng, lat, { x: 0, y: 0 }));
    // Cumulative length of the source polyline
    const cum = [0];
    for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y));
    const total = Math.min(cum[cum.length - 1], closed ? Infinity : cutAt);
    const n = Math.max(2, Math.floor(total / STEP) + 1);
    this.n = n;
    this.length = closed ? n * STEP : (n - 1) * STEP;
    this.xs = new Float64Array(n);
    this.ys = new Float64Array(n);
    let j = 0;
    for (let i = 0; i < n; i++) {
      const s = Math.min(i * STEP, cum[cum.length - 1]);
      while (j < cum.length - 2 && cum[j + 1] < s) j++;
      const seg = cum[j + 1] - cum[j] || 1;
      const t = Math.min(1, Math.max(0, (s - cum[j]) / seg));
      this.xs[i] = pts[j].x + (pts[j + 1].x - pts[j].x) * t;
      this.ys[i] = pts[j].y + (pts[j + 1].y - pts[j].y) * t;
    }
    if (closed) this.length = total; // exact loop length; last sample wraps to the first
    // Heading per sample and corner radius from a ±2-sample chord
    this.heading = new Float64Array(n);
    this.radius = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      const a = this._idx(i), b = this._idx(i + 1);
      this.heading[i] = Math.atan2(this.xs[b] - this.xs[a], this.ys[b] - this.ys[a]);
      this.radius[i] = this._radius(this._idx(i - 2), a, this._idx(i + 2));
    }
    if (!closed) this.heading[n - 1] = this.heading[n - 2];
  }

  _idx(i) {
    if (this.closed) return ((i % this.n) + this.n) % this.n;
    return Math.max(0, Math.min(this.n - 1, i));
  }

  _radius(a, b, c) {
    const ax = this.xs[a], ay = this.ys[a], bx = this.xs[b], by = this.ys[b], cx = this.xs[c], cy = this.ys[c];
    const ab = Math.hypot(bx - ax, by - ay), bc = Math.hypot(cx - bx, cy - by), ca = Math.hypot(ax - cx, ay - cy);
    const area2 = Math.abs((bx - ax) * (cy - ay) - (by - ay) * (cx - ax));
    if (area2 < 1e-6) return 5000;
    return Math.min(5000, (ab * bc * ca) / (2 * area2));
  }

  /** Wrap (circuit) or clamp (point-to-point) a distance. */
  wrap(s) {
    if (this.closed) return ((s % this.length) + this.length) % this.length;
    return Math.max(0, Math.min(this.length, s));
  }

  /** Position and heading at distance s. Writes into `out`. */
  pointAt(s, out = { x: 0, y: 0, heading: 0 }) {
    s = this.wrap(s);
    const f = s / STEP;
    const i = Math.floor(f), t = f - i;
    const a = this._idx(i), b = this._idx(i + 1);
    out.x = this.xs[a] + (this.xs[b] - this.xs[a]) * t;
    out.y = this.ys[a] + (this.ys[b] - this.ys[a]) * t;
    out.heading = this.heading[a];
    return out;
  }

  /** Corner radius near distance s (metres). */
  radiusAt(s) {
    return this.radius[this._idx(Math.floor(this.wrap(s) / STEP))];
  }

  /**
   * Nearest point on the line to (x, y), searching samples
   * [hint - back, hint + fwd]. Returns { s, idx, dist } (shared object).
   *
   * Where the line doubles back on itself (out-and-back on one road, or a
   * circuit's start and end sharing a street), two parts are equally close.
   * Passing the car's `heading` breaks the tie towards the part going the
   * same way, and a small cost per sample keeps the match near the hint.
   */
  project(x, y, hint = 0, back = 20, fwd = 120, heading = null) {
    const hx = heading === null ? 0 : Math.sin(heading), hy = heading === null ? 0 : Math.cos(heading);
    const r = (this._proj ??= { s: 0, idx: 0, dist: 0 });
    let best = Infinity;
    const lo = this.closed ? hint - back : Math.max(0, hint - back);
    const hi = this.closed ? hint + fwd : Math.min(this.n - 2, hint + fwd);
    for (let k = lo; k <= hi; k++) {
      const i = this._idx(k), j = this._idx(k + 1);
      const ax = this.xs[i], ay = this.ys[i], dx = this.xs[j] - ax, dy = this.ys[j] - ay;
      const l2 = dx * dx + dy * dy || 1e-9;
      let t = ((x - ax) * dx + (y - ay) * dy) / l2;
      t = t < 0 ? 0 : t > 1 ? 1 : t;
      const px = ax + dx * t, py = ay + dy * t;
      let d2 = (x - px) ** 2 + (y - py) ** 2;
      if (heading !== null && dx * hx + dy * hy < 0) d2 += 900; // facing the other way: +30 m
      d2 += Math.abs(k - hint) * 0.5;
      if (d2 < best) {
        best = d2;
        r.idx = i;
        r.s = this.wrap((i + t) * STEP);
      }
    }
    const i = r.idx, j = this._idx(i + 1);
    const t = Math.min(1, Math.max(0, (r.s - i * STEP) / STEP));
    r.dist = Math.hypot(x - (this.xs[i] + (this.xs[j] - this.xs[i]) * t), y - (this.ys[i] + (this.ys[j] - this.ys[i]) * t));
    return r;
  }
}
