/**
 * Low-poly 3D blocks for the Driver view.
 *
 * From a near-level camera, flat top-down sprites look like stickers on
 * the road, so in Driver view vehicles and gates are drawn as boxes with
 * a few painted details (windows, lights, roof sprite).
 *
 * We only have MapLibre's ground projection (map.project), so heights are
 * approximated: a 1 m sideways step near the object gives its pixels per
 * metre at that depth, and a 1 m rise is that × sin(pitch). Each corner
 * is scaled by its own depth, which keeps long buses in perspective. This
 * is cheap (≈6 projections per box) and plenty for blocky arcade shapes.
 */
import { shade } from '../cars/sprites.js';
import { getCarSprite } from '../cars/sprites.js';

const _g = [{}, {}, {}, {}]; // ground corners (screen)
const _s = [0, 0, 0, 0]; // per-corner vertical px per metre

export class BoxRenderer {
  /** @param {import('./overlay.js').Overlay} overlay */
  constructor(overlay) {
    this.o = overlay;
  }

  /**
   * Set the camera for this frame.
   * @param {number} camX camera ground position (local metres)
   * @param {number} camY
   * @param {number} viewHeading camera bearing (rad)
   * @param {number} pitch camera pitch (rad)
   */
  begin(camX, camY, viewHeading, pitch) {
    this.cx = camX;
    this.cy = camY;
    this.fx = Math.sin(viewHeading);
    this.fy = Math.cos(viewHeading);
    this.sinP = Math.sin(pitch);
    this.o.ctx.setTransform(1, 0, 0, 1, 0, 0);
  }

  /** Depth of a ground point in front of the camera (metres). */
  depth(x, y) {
    return (x - this.cx) * this.fx + (y - this.cy) * this.fy;
  }

  /**
   * Draw a box. Centre (x, y), heading, length L, width W, from height
   * h0 to h1 (metres). `paint` has side/front/rear/top colours and an
   * optional decorate(faceName, quadFn) hook.
   * Returns false if it's behind the camera.
   */
  box(x, y, heading, L, W, h0, h1, paint) {
    const o = this.o;
    const dc = this.depth(x, y);
    if (dc < 1.5) return false;
    const fx = Math.sin(heading), fy = Math.cos(heading);
    const rx = fy, ry = -fx; // right
    const hl = L / 2, hw = W / 2;
    // Ground corners: 0 front-left, 1 front-right, 2 rear-right, 3 rear-left
    const cxs = [x + fx * hl - rx * hw, x + fx * hl + rx * hw, x - fx * hl + rx * hw, x - fx * hl - rx * hw];
    const cys = [y + fy * hl - ry * hw, y + fy * hl + ry * hw, y - fy * hl + ry * hw, y - fy * hl - ry * hw];
    // Pixels per metre at the centre's depth, then per corner by depth ratio
    const c0 = o._proj(x, y), c1 = o._proj(x + this.fy, y - this.fx); // 1 m across the view
    const pxm = Math.hypot(c1.x - c0.x, c1.y - c0.y) * this.sinP;
    for (let i = 0; i < 4; i++) {
      const p = o._proj(cxs[i], cys[i]);
      _g[i].x = p.x;
      _g[i].y = p.y;
      _s[i] = pxm * (dc / Math.max(0.8, this.depth(cxs[i], cys[i])));
    }
    // Point on the box at ground corner i, height h
    const P = (i, h) => ({ x: _g[i].x, y: _g[i].y - h * _s[i] });
    const ctx = o.ctx;
    const quad = (a, b, c, d, fill) => {
      ctx.fillStyle = fill;
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.lineTo(c.x, c.y);
      ctx.lineTo(d.x, d.y);
      ctx.closePath();
      ctx.fill();
    };
    // Faces: [name, cornerA, cornerB, outward normal]
    const faces = [
      ['front', 0, 1, fx, fy],
      ['right', 1, 2, rx, ry],
      ['rear', 2, 3, -fx, -fy],
      ['left', 3, 0, -rx, -ry],
    ];
    for (const [name, a, b, nx, ny] of faces) {
      const mx = (cxs[a] + cxs[b]) / 2, my = (cys[a] + cys[b]) / 2;
      if ((mx - this.cx) * nx + (my - this.cy) * ny >= 0) continue; // facing away
      const fill = name === 'front' ? paint.front : name === 'rear' ? paint.rear : paint.side;
      quad(P(a, h0), P(b, h0), P(b, h1), P(a, h1), fill);
      if (paint.decorate) {
        // sub(u0, u1, t0, t1, colour): rectangle on the face in 0..1 coords
        // (u along the face from a to b, t up from h0 to h1)
        const sub = (u0, u1, t0, t1, colour) => {
          const at = (u, t) => {
            const h = h0 + (h1 - h0) * t;
            const pa = P(a, h), pb = P(b, h);
            return { x: pa.x + (pb.x - pa.x) * u, y: pa.y + (pb.y - pa.y) * u };
          };
          quad(at(u0, t0), at(u1, t0), at(u1, t1), at(u0, t1), colour);
        };
        paint.decorate(name, sub);
      }
    }
    // Roof
    const t0 = P(0, h1), t1 = P(1, h1), t2 = P(2, h1), t3 = P(3, h1);
    quad(t0, t1, t2, t3, paint.top);
    if (paint.roofSprite) {
      // Affine map of the sprite onto the roof (front edge = sprite top)
      const sp = paint.roofSprite;
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(t0.x, t0.y);
      ctx.lineTo(t1.x, t1.y);
      ctx.lineTo(t2.x, t2.y);
      ctx.lineTo(t3.x, t3.y);
      ctx.closePath();
      ctx.clip();
      const w = sp.canvas.width, h = sp.canvas.height;
      ctx.setTransform((t1.x - t0.x) / w, (t1.y - t0.y) / w, (t3.x - t0.x) / h, (t3.y - t0.y) / h, t0.x, t0.y);
      ctx.drawImage(sp.canvas, 0, 0);
      ctx.restore();
    }
    return true;
  }

  /** A vehicle (player car spec, racer or traffic agent) as a decorated box. */
  vehicle(v, colour) {
    const s = v.spec;
    if (s.id === 'cow') return this.cow(v, colour);
    const H = s.height || 1.5;
    const side = s.sideColour || shade(colour, -0.12);
    const glass = '#24313b';
    const lit = v.braking ? '#ff3b30' : '#8c1010';
    const open = s.id === 'roadster' || s.id === 'jeep';
    const glassTop = open ? 0.98 : 0.9;
    this.box(v.x, v.y, v.heading, s.length, s.width, 0.28, H, {
      side,
      front: shade(colour, -0.2),
      rear: shade(colour, -0.28),
      top: shade(colour, 0.08),
      roofSprite: getCarSprite(s, colour),
      decorate: (face, sub) => {
        if (face === 'rear') {
          sub(0.1, 0.9, 0.58, glassTop, glass);
          sub(0.06, 0.24, 0.3, 0.45, lit);
          sub(0.76, 0.94, 0.3, 0.45, lit);
          if (s.id === 'truck' || s.id === 'bus') sub(0.05, 0.95, 0.05, 0.14, '#f2c230');
        } else if (face === 'front') {
          sub(0.12, 0.88, 0.58, glassTop, glass);
          sub(0.08, 0.24, 0.3, 0.42, '#fff6c8');
          sub(0.76, 0.92, 0.3, 0.42, '#fff6c8');
        } else if (s.id === 'bus') {
          for (let u = 0.12; u < 0.9; u += 0.11) sub(u, u + 0.08, 0.55, 0.85, glass);
        } else if (s.id !== 'truck') {
          sub(0.22, 0.78, 0.55, glassTop, glass);
        }
      },
    });
    // Black tyres peeking under the body (two dark slabs)
    return true;
  }

  /** Cow: raised body, legs, head. */
  cow(v, colour) {
    const fx = Math.sin(v.heading), fy = Math.cos(v.heading);
    const dark = shade(colour, -0.4);
    const legs = { side: dark, front: dark, rear: dark, top: dark };
    this.box(v.x + fx * 0.55, v.y + fy * 0.55, v.heading, 0.18, 0.6, 0, 0.6, legs);
    this.box(v.x - fx * 0.5, v.y - fy * 0.5, v.heading, 0.18, 0.6, 0, 0.6, legs);
    this.box(v.x, v.y, v.heading, 1.5, 0.75, 0.55, 1.3, { side: colour, front: shade(colour, -0.1), rear: shade(colour, -0.15), top: shade(colour, 0.1) });
    // Hump and head with horns
    this.box(v.x + fx * 0.45, v.y + fy * 0.45, v.heading, 0.35, 0.5, 1.3, 1.45, { side: colour, front: colour, rear: colour, top: shade(colour, 0.15) });
    this.box(v.x + fx * 0.95, v.y + fy * 0.95, v.heading, 0.45, 0.38, 0.85, 1.3, {
      side: colour, front: shade(colour, -0.1), rear: colour, top: colour,
      decorate: (face, sub) => {
        if (face === 'front') sub(0.2, 0.8, 0.05, 0.3, '#d8b8a0');
      },
    });
    const horn = { side: '#e8dcc0', front: '#e8dcc0', rear: '#e8dcc0', top: '#f5ecd6' };
    const rx = fy, ry = -fx;
    this.box(v.x + fx * 0.95 - rx * 0.22, v.y + fy * 0.95 - ry * 0.22, v.heading, 0.08, 0.08, 1.3, 1.5, horn);
    this.box(v.x + fx * 0.95 + rx * 0.22, v.y + fy * 0.95 + ry * 0.22, v.heading, 0.08, 0.08, 1.3, 1.5, horn);
    return true;
  }

  /** Checkpoint arch over the road: two posts and a banner. */
  gate(x, y, heading, halfWidth, finish) {
    const lx = -Math.cos(heading), ly = Math.sin(heading);
    const w = halfWidth + 1.2;
    const post = { side: '#2b2b2b', front: '#333', rear: '#333', top: '#444' };
    this.box(x + lx * w, y + ly * w, heading, 0.5, 0.5, 0, 4.8, post);
    this.box(x - lx * w, y - ly * w, heading, 0.5, 0.5, 0, 4.8, post);
    const base = finish ? '#fafafa' : '#ff9933';
    this.box(x, y, heading + Math.PI / 2, 2 * w + 0.5, 0.4, 3.9, 4.8, {
      side: base, front: shade(base, -0.15), rear: shade(base, -0.15), top: shade(base, -0.1),
      decorate: (face, sub) => {
        if (face !== 'left' && face !== 'right') return;
        if (finish) {
          for (let i = 0; i < 12; i++) for (let r = 0; r < 2; r++) if ((i + r) % 2) sub(i / 12, (i + 1) / 12, r / 2, (r + 1) / 2, '#111');
        } else {
          sub(0.42, 0.58, 0.15, 0.85, '#ffffff');
        }
      },
    });
  }
}
