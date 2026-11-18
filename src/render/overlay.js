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

  clear() {
    const { ctx, canvas } = this;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
  }

  /**
   * Faint 10 m ground grid around the car. Shown only when map tiles could
   * not load (offline), so movement is still visible.
   */
  drawGrid(cx, cy) {
    const { ctx } = this;
    const step = 10, span = 160;
    const x0 = Math.floor((cx - span) / step) * step;
    const y0 = Math.floor((cy - span) / step) * step;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.strokeStyle = 'rgba(60,70,50,0.25)';
    ctx.lineWidth = 1 * this.dpr;
    ctx.beginPath();
    for (let gx = x0; gx <= cx + span; gx += step) {
      const a = this._proj(gx, cy - span), b = this._proj(gx, cy + span);
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
    }
    for (let gy = y0; gy <= cy + span; gy += step) {
      const a = this._proj(cx - span, gy), b = this._proj(cx + span, gy);
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
    }
    ctx.stroke();
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
