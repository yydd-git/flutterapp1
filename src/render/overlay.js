/**
 * 2D canvas overlay that draws vehicles on top of the MapLibre map.
 *
 * Each sprite gets an affine transform from three projected points (centre,
 * 1 m forward, 1 m right). The car then rotates, scales and foreshortens
 * correctly under any map zoom, bearing or pitch without us copying
 * MapLibre's camera maths. Cost: 3 projections per vehicle per frame.
 */
import { getCarSprite } from '../cars/sprites.js';
import { PERF } from '../config.js';

export class Overlay {
  /** @param {HTMLCanvasElement} canvas @param {import('../map/mapView.js').MapView} mapView */
  constructor(canvas, mapView, frame) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: true });
    this.mapView = mapView;
    this.frame = frame;
    this.dpr = 1;
    this._ll = [0, 0];
    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  resize() {
    this.dpr = Math.min(window.devicePixelRatio || 1, PERF.maxPixelRatio);
    const { clientWidth: w, clientHeight: h } = this.canvas;
    this.canvas.width = Math.round(w * this.dpr);
    this.canvas.height = Math.round(h * this.dpr);
  }

  /** Project a local-metre point to device pixels. */
  _proj(x, y) {
    const p = this.mapView.project(this.frame.toLngLat(x, y, this._ll));
    return { x: p.x * this.dpr, y: p.y * this.dpr };
  }

  /**
   * Set ctx transform so that drawing in metres (x right, y toward the rear)
   * lands on the map at (x, y) with the given heading.
   */
  _setWorldTransform(x, y, heading) {
    const fx = Math.sin(heading), fy = Math.cos(heading); // forward unit
    const c = this._proj(x, y);
    const f = this._proj(x + fx, y + fy);
    const r = this._proj(x + fy, y - fx); // right = (cos h, -sin h)
    // local +x → right, local +y → backward (−forward)
    this.ctx.setTransform(r.x - c.x, r.y - c.y, c.x - f.x, c.y - f.y, c.x, c.y);
  }

  /**
   * Clip segment a→b to the slab NEAR..FAR metres along the view direction
   * (fx, fy) from (cx, cy). Points behind the camera plane project wildly
   * under a pitched camera, so everything drawn in world space goes
   * through this. Returns the shared `_clip` array [ax, ay, bx, by] or null.
   */
  _clipView(ax, ay, bx, by, cx, cy, fx, fy, near = -35, far = 400) {
    const fa = (ax - cx) * fx + (ay - cy) * fy;
    const fb = (bx - cx) * fx + (by - cy) * fy;
    if ((fa < near && fb < near) || (fa > far && fb > far)) return null;
    let t0 = 0, t1 = 1;
    const d = fb - fa;
    if (d !== 0) {
      const tn = (near - fa) / d, tf = (far - fa) / d;
      if (d > 0) { t0 = Math.max(t0, tn); t1 = Math.min(t1, tf); }
      else { t0 = Math.max(t0, tf); t1 = Math.min(t1, tn); }
      if (t0 >= t1) return null;
    }
    const c = (this._clip ??= [0, 0, 0, 0]);
    c[0] = ax + (bx - ax) * t0; c[1] = ay + (by - ay) * t0;
    c[2] = ax + (bx - ax) * t1; c[3] = ay + (by - ay) * t1;
    return c;
  }

  clear() {
    const { ctx, canvas } = this;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
  }

  /**
   * Faint 10 m ground grid around the car. Shown only when map tiles could
   * not load (offline), so movement is still visible.
   */
  drawGrid(cx, cy, viewHeading = 0) {
    const fx = Math.sin(viewHeading), fy = Math.cos(viewHeading);
    const { ctx } = this;
    const step = 10, span = 160;
    const x0 = Math.floor((cx - span) / step) * step;
    const y0 = Math.floor((cy - span) / step) * step;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.strokeStyle = 'rgba(60,70,50,0.25)';
    ctx.lineWidth = 1 * this.dpr;
    ctx.beginPath();
    const line = (ax, ay, bx, by) => {
      const c = this._clipView(ax, ay, bx, by, cx, cy, fx, fy);
      if (!c) return;
      const a = this._proj(c[0], c[1]), b = this._proj(c[2], c[3]);
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
    };
    for (let gx = x0; gx <= cx + span; gx += step) line(gx, cy - span, gx, cy + span);
    for (let gy = y0; gy <= cy + span; gy += step) line(cx - span, gy, cx + span, gy);
    ctx.stroke();
  }

  /**
   * Draw the OSM road network ourselves, used when map tiles are
   * unavailable (offline) or in debug mode (?debug) to check how well the
   * physics roads line up with the map.
   *
   * Each segment is a world-space quad (extended by its half-width at both
   * ends to close joints), projected corner by corner, so widths shrink
   * correctly with distance under a pitched camera. Segments well behind
   * the camera are skipped: points behind the camera plane project wildly.
   * @param {import('../roads/roadNetwork.js').RoadNetwork} roads
   * @param {number} viewHeading camera bearing in radians
   */
  drawRoads(roads, cx, cy, viewHeading, debug = false) {
    const { ctx } = this;
    const fx = Math.sin(viewHeading), fy = Math.cos(viewHeading);
    // Clip each segment once; keep [ax, ay, bx, by, way] for the passes.
    const segs = [];
    roads.forEachNear(cx, cy, 240, (s) => {
      const c = this._clipView(s.ax, s.ay, s.bx, s.by, cx, cy, fx, fy, -25, 300);
      if (c) segs.push({ ax: c[0], ay: c[1], bx: c[2], by: c[3], len: Math.sqrt(s.len2), dx: s.dx, dy: s.dy, way: s.way });
    });
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    const quad = (s, half) => {
      const ux = s.dx / s.len, uy = s.dy / s.len; // along
      const nx = -uy * half, ny = ux * half; // across
      const ex = ux * half, ey = uy * half; // end extension closes joints
      const p1 = this._proj(s.ax - ex + nx, s.ay - ey + ny);
      const p2 = this._proj(s.bx + ex + nx, s.by + ey + ny);
      const p3 = this._proj(s.bx + ex - nx, s.by + ey - ny);
      const p4 = this._proj(s.ax - ex - nx, s.ay - ey - ny);
      ctx.moveTo(p1.x, p1.y);
      ctx.lineTo(p2.x, p2.y);
      ctx.lineTo(p3.x, p3.y);
      ctx.lineTo(p4.x, p4.y);
      ctx.closePath();
    };
    if (debug) {
      ctx.fillStyle = 'rgba(255,60,60,0.16)';
      ctx.beginPath();
      for (const s of segs) quad(s, s.way.half);
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,60,60,0.9)';
      ctx.lineWidth = 1.5 * this.dpr;
      ctx.beginPath();
      for (const s of segs) {
        const a = this._proj(s.ax, s.ay), b = this._proj(s.bx, s.by);
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
      }
      ctx.stroke();
      return;
    }
    // Kerb outline, then paved and unpaved surfaces, batched into one
    // path each to keep draw calls low.
    ctx.fillStyle = '#efe9d8';
    ctx.beginPath();
    for (const s of segs) quad(s, s.way.half + 0.8);
    ctx.fill();
    for (const unpaved of [false, true]) {
      ctx.fillStyle = unpaved ? '#b59a72' : '#6b6e73';
      ctx.beginPath();
      for (const s of segs) if (s.way.unpaved === unpaved) quad(s, s.way.half);
      ctx.fill('nonzero');
    }
  }

  /** Draw a vehicle (physics object + render info). */
  drawCar(car, colour) {
    const { ctx } = this;
    const spec = car.spec;
    const sprite = getCarSprite(spec, colour);

    // Soft drop shadow, offset slightly "south-east" in screen space.
    this._setWorldTransform(car.x, car.y, car.heading);
    ctx.fillStyle = 'rgba(0,0,0,0.28)';
    ctx.fillRect(-spec.width / 2 + 0.12, -spec.length / 2 + 0.18, spec.width, spec.length);

    ctx.drawImage(sprite.canvas, -sprite.w / 2, -sprite.h / 2, sprite.w, sprite.h);

    // Brake / reverse lamps are dynamic, so they're drawn live.
    if (car.braking || car.reversing) {
      const hw = spec.width / 2, hl = spec.length / 2;
      ctx.fillStyle = car.reversing ? '#fffbe6' : '#ff2a2a';
      ctx.globalAlpha = 0.9;
      ctx.fillRect(-hw + 0.08, hl - 0.14, 0.36, 0.14);
      ctx.fillRect(hw - 0.44, hl - 0.14, 0.36, 0.14);
      ctx.globalAlpha = 1;
    }
  }
}
