/**
 * Road network in local metres with a uniform-grid spatial index.
 *
 * Main query: "how far am I from the edge of the nearest road, and which
 * way is the road?" The physics calls it every step, so it does no
 * allocation in the hot path and only scans segments in nearby grid cells.
 *
 * Signed edge distance = distance to centre line − road half-width
 * (negative = on the tarmac). Picking the minimum of that, rather than of
 * centre-line distance, handles a wide highway next to a narrow lane.
 */
import { wayHalfWidth, ROAD_CLASSES, cellKey } from './overpass.js';

const GRID = 40; // metres per index cell
const gkey = (gx, gy) => (gx + 1e5) * 2e5 + (gy + 1e5);

export class RoadNetwork {
  /** @param {import('../core/geo.js').LocalFrame} frame */
  constructor(frame) {
    this.frame = frame;
    this.segs = [];
    this.grid = new Map();
    this.wayIds = new Set();
    this.loadedCells = new Set();
    this._stamp = 0;
    this._p = { x: 0, y: 0 };
    this._ll = [0, 0];
    // Reused result object for query()
    this.hit = { found: false, edge: 0, dist: 0, px: 0, py: 0, nx: 0, ny: 0, tx: 0, ty: 0, way: null };
  }

  get segmentCount() {
    return this.segs.length;
  }

  /**
   * Add compact ways (see overpass.js); duplicates by id are skipped.
   * @returns {object[]} the ways that were new
   */
  addWays(ways) {
    const p = this._p;
    const added = [];
    for (const w of ways) {
      if (this.wayIds.has(w.id)) continue;
      this.wayIds.add(w.id);
      added.push(w);
      const info = {
        id: w.id,
        type: w.t,
        name: w.n || '',
        ref: w.r || '',
        half: wayHalfWidth(w),
        unpaved: !!w.u,
        rank: (ROAD_CLASSES[w.t] || ROAD_CLASSES.road).rank,
      };
      const c = w.c;
      this.frame.toLocal(c[0], c[1], p);
      let ax = p.x, ay = p.y;
      for (let k = 2; k < c.length; k += 2) {
        this.frame.toLocal(c[k], c[k + 1], p);
        const bx = p.x, by = p.y;
        const dx = bx - ax, dy = by - ay;
        const len2 = dx * dx + dy * dy;
        if (len2 > 0.01) {
          const seg = { ax, ay, bx, by, dx, dy, len2, way: info, q: 0 };
          this.segs.push(seg);
          this._index(seg);
        }
        ax = bx;
        ay = by;
      }
    }
    return added;
  }

  _index(seg) {
    const x0 = Math.floor(Math.min(seg.ax, seg.bx) / GRID), x1 = Math.floor(Math.max(seg.ax, seg.bx) / GRID);
    const y0 = Math.floor(Math.min(seg.ay, seg.by) / GRID), y1 = Math.floor(Math.max(seg.ay, seg.by) / GRID);
    for (let gx = x0; gx <= x1; gx++)
      for (let gy = y0; gy <= y1; gy++) {
        const k = gkey(gx, gy);
        let list = this.grid.get(k);
        if (!list) this.grid.set(k, (list = []));
        list.push(seg);
      }
  }

  markLoaded(key) {
    this.loadedCells.add(key);
  }

  /** True if road data for the area at local (x, y) has been loaded. */
  isLoadedAt(x, y) {
    const ll = this.frame.toLngLat(x, y, this._ll);
    return this.loadedCells.has(cellKey(ll[0], ll[1]));
  }

  /**
   * Nearest road edge within `radius` metres of (x, y).
   * Returns the shared `hit` object (copy it if you need to keep it).
   * hit.n points from the road towards the car (outwards).
   */
  query(x, y, radius = 60) {
    const hit = this.hit;
    hit.found = false;
    hit.edge = Infinity;
    const stamp = ++this._stamp;
    const r = Math.ceil(radius / GRID);
    const cx = Math.floor(x / GRID), cy = Math.floor(y / GRID);
    let bestSeg = null, bestT = 0, bestD = 0;
    for (let gx = cx - r; gx <= cx + r; gx++)
      for (let gy = cy - r; gy <= cy + r; gy++) {
        const list = this.grid.get(gkey(gx, gy));
        if (!list) continue;
        for (let i = 0; i < list.length; i++) {
          const s = list[i];
          if (s.q === stamp) continue;
          s.q = stamp;
          let t = ((x - s.ax) * s.dx + (y - s.ay) * s.dy) / s.len2;
          t = t < 0 ? 0 : t > 1 ? 1 : t;
          const px = s.ax + s.dx * t, py = s.ay + s.dy * t;
          const d = Math.hypot(x - px, y - py);
          const edge = d - s.way.half;
          if (edge < hit.edge && d <= radius) {
            hit.edge = edge;
            bestSeg = s;
            bestT = t;
            bestD = d;
          }
        }
      }
    if (!bestSeg) return hit;
    const s = bestSeg;
    const len = Math.sqrt(s.len2);
    hit.found = true;
    hit.dist = bestD;
    hit.px = s.ax + s.dx * bestT;
    hit.py = s.ay + s.dy * bestT;
    hit.tx = s.dx / len;
    hit.ty = s.dy / len;
    if (bestD > 1e-6) {
      hit.nx = (x - hit.px) / bestD;
      hit.ny = (y - hit.py) / bestD;
    } else {
      hit.nx = -hit.ty; // on the centre line: pick the left normal
      hit.ny = hit.tx;
    }
    hit.way = s.way;
    return hit;
  }

  /** Call fn(seg) once for each segment with a grid cell within r metres. */
  forEachNear(x, y, r, fn) {
    const stamp = ++this._stamp;
    const g = Math.ceil(r / GRID);
    const cx = Math.floor(x / GRID), cy = Math.floor(y / GRID);
    for (let gx = cx - g; gx <= cx + g; gx++)
      for (let gy = cy - g; gy <= cy + g; gy++) {
        const list = this.grid.get(gkey(gx, gy));
        if (!list) continue;
        for (const s of list) {
          if (s.q === stamp) continue;
          s.q = stamp;
          fn(s);
        }
      }
  }

  /** Nearest road searching outwards up to maxRadius metres (for respawn). */
  nearest(x, y, maxRadius = 2000) {
    for (let r = 60; r <= maxRadius; r *= 2.5) {
      const h = this.query(x, y, r);
      if (h.found) return h;
    }
    return this.query(x, y, maxRadius);
  }

  /**
   * Pick a spawn point near (x, y): prefer major roads, then closeness.
   * Places the car in the left lane (India drives on the left), facing
   * whichever road direction is closer to `preferHeading`.
   * @returns {{x:number, y:number, heading:number, way:object}|null}
   */
  findSpawn(x, y, preferHeading = 0, radius = 600) {
    const stamp = ++this._stamp;
    const r = Math.ceil(radius / GRID);
    const cx = Math.floor(x / GRID), cy = Math.floor(y / GRID);
    let best = null, bestScore = Infinity;
    for (let gx = cx - r; gx <= cx + r; gx++)
      for (let gy = cy - r; gy <= cy + r; gy++) {
        const list = this.grid.get(gkey(gx, gy));
        if (!list) continue;
        for (const s of list) {
          if (s.q === stamp || s.len2 < 400) continue; // skip stubs < 20 m
          s.q = stamp;
          let t = ((x - s.ax) * s.dx + (y - s.ay) * s.dy) / s.len2;
          const margin = Math.min(0.5, 15 / Math.sqrt(s.len2)); // ≥15 m from junctions
          t = Math.min(1 - margin, Math.max(margin, t));
          const px = s.ax + s.dx * t, py = s.ay + s.dy * t;
          const d = Math.hypot(x - px, y - py);
          if (d > radius) continue;
          const score = d - s.way.rank * 120;
          if (score < bestScore) {
            bestScore = score;
            best = { s, px, py };
          }
        }
      }
    if (!best) return null;
    const { s, px, py } = best;
    let heading = Math.atan2(s.dx, s.dy); // clockwise from north
    const diff = Math.abs(((heading - preferHeading + 3 * Math.PI) % (2 * Math.PI)) - Math.PI);
    if (diff > Math.PI / 2) heading += Math.PI;
    // Left lane: offset towards the left of the direction of travel.
    const lane = Math.min(s.way.half * 0.4, 3);
    const lx = -Math.cos(heading), ly = Math.sin(heading);
    return { x: px + lx * lane, y: py + ly * lane, heading, way: s.way };
  }
}

/** Human label for a road, e.g. "NH53 · GE Road". */
export function roadLabel(way) {
  if (!way) return '';
  const parts = [];
  if (way.ref) parts.push(way.ref.replace(/\s+/g, ''));
  if (way.name && way.name !== way.ref) parts.push(way.name);
  return parts.join(' · ') || way.type.replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase());
}
