/**
 * Road routing on OSM ways (pure; used in Node at build time and in the
 * browser as a fallback).
 *
 * Ways meet at identical coordinates, so graph nodes are keyed by
 * "lng,lat". Edge cost is travel time using a typical speed per road
 * class, so routes prefer highways. One-way roads are respected (dual
 * carriageways are mapped as two one-ways, so routes keep to the left side).
 */

const SPEED = {
  motorway: 30, trunk: 26, primary: 21, secondary: 17, tertiary: 14,
  motorway_link: 14, trunk_link: 14, primary_link: 12, secondary_link: 12, tertiary_link: 10,
  unclassified: 11, road: 10, residential: 8, living_street: 5, track: 6,
};
const MAX_SPEED = 30;
const DEG = Math.PI / 180;
const R = 6378137;

/** Approximate metres between two lng/lat points (fine at these scales). */
export function distM(lng1, lat1, lng2, lat2) {
  const x = (lng2 - lng1) * DEG * Math.cos(((lat1 + lat2) / 2) * DEG);
  const y = (lat2 - lat1) * DEG;
  return Math.hypot(x, y) * R;
}

/** Build a routing graph from compact ways. */
export function buildGraph(ways) {
  const nodes = new Map(); // key -> { lng, lat, out: [{ to, cost, len }] }
  const node = (lng, lat) => {
    const key = lng + ',' + lat;
    let n = nodes.get(key);
    if (!n) nodes.set(key, (n = { key, lng, lat, out: [] }));
    return n;
  };
  for (const w of ways) {
    const v = SPEED[w.t] || 10;
    const c = w.c;
    for (let k = 0; k + 3 < c.length; k += 2) {
      const a = node(c[k], c[k + 1]), b = node(c[k + 2], c[k + 3]);
      const len = distM(a.lng, a.lat, b.lng, b.lat);
      if (len < 0.05) continue;
      a.out.push({ to: b, cost: len / v, len });
      if (!w.o) b.out.push({ to: a, cost: len / v, len });
    }
  }
  return nodes;
}

/** Nearest graph node (with outgoing edges) to a lng/lat. */
export function nearestNode(nodes, lng, lat) {
  let best = null, bestD = Infinity;
  for (const n of nodes.values()) {
    if (!n.out.length) continue;
    const d = distM(lng, lat, n.lng, n.lat);
    if (d < bestD) {
      bestD = d;
      best = n;
    }
  }
  return best;
}

/** Minimal binary heap keyed by f. */
class Heap {
  constructor() { this.a = []; }
  get size() { return this.a.length; }
  push(item) {
    const a = this.a;
    a.push(item);
    let i = a.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (a[p].f <= a[i].f) break;
      [a[p], a[i]] = [a[i], a[p]];
      i = p;
    }
  }
  pop() {
    const a = this.a, top = a[0], last = a.pop();
    if (a.length) {
      a[0] = last;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1, r = l + 1;
        let m = i;
        if (l < a.length && a[l].f < a[m].f) m = l;
        if (r < a.length && a[r].f < a[m].f) m = r;
        if (m === i) break;
        [a[m], a[i]] = [a[i], a[m]];
        i = m;
      }
    }
    return top;
  }
}

/** A* fastest path between two nodes. Returns an array of nodes or null. */
export function astar(start, goal) {
  if (start === goal) return [start];
  const g = new Map([[start, 0]]);
  const prev = new Map();
  const h = (n) => distM(n.lng, n.lat, goal.lng, goal.lat) / MAX_SPEED;
  const open = new Heap();
  open.push({ n: start, f: h(start) });
  const closed = new Set();
  while (open.size) {
    const { n } = open.pop();
    if (n === goal) {
      const path = [n];
      for (let p = prev.get(n); p; p = prev.get(p)) path.push(p);
      return path.reverse();
    }
    if (closed.has(n)) continue;
    closed.add(n);
    const gn = g.get(n);
    for (const e of n.out) {
      const ng = gn + e.cost;
      if (ng < (g.get(e.to) ?? Infinity)) {
        g.set(e.to, ng);
        prev.set(e.to, n);
        open.push({ n: e.to, f: ng + h(e.to) });
      }
    }
  }
  return null;
}

/**
 * Route through waypoints ([lng, lat] list). For circuits, closes the loop.
 * @returns {{coords: number[][], length: number}}
 */
export function routeThrough(nodes, waypoints, closed = false) {
  const snapped = waypoints.map(([lng, lat]) => nearestNode(nodes, lng, lat));
  if (snapped.some((n) => !n)) throw new Error('No roads near a waypoint');
  const stops = closed ? [...snapped, snapped[0]] : snapped;
  const coords = [];
  for (let i = 0; i + 1 < stops.length; i++) {
    const path = astar(stops[i], stops[i + 1]);
    if (!path) throw new Error(`No road route between waypoints ${i + 1} and ${i + 2}`);
    for (const n of path) {
      const last = coords[coords.length - 1];
      if (!last || last[0] !== n.lng || last[1] !== n.lat) coords.push([n.lng, n.lat]);
    }
  }
  let length = 0;
  for (let i = 1; i < coords.length; i++) length += distM(...coords[i - 1], ...coords[i]);
  return { coords, length };
}

/** Douglas–Peucker simplification (tolerance in metres). */
export function simplify(coords, tol = 1.5) {
  if (coords.length < 3) return coords.slice();
  const lat0 = coords[0][1];
  const kx = DEG * R * Math.cos(lat0 * DEG), ky = DEG * R;
  const pts = coords.map(([lng, lat]) => [lng * kx, lat * ky]);
  const keep = new Uint8Array(coords.length);
  keep[0] = keep[coords.length - 1] = 1;
  const stack = [[0, coords.length - 1]];
  while (stack.length) {
    const [i0, i1] = stack.pop();
    const [ax, ay] = pts[i0], [bx, by] = pts[i1];
    const dx = bx - ax, dy = by - ay, L = Math.hypot(dx, dy);
    let maxD = 0, idx = -1;
    for (let i = i0 + 1; i < i1; i++) {
      // Closed loops start and end at the same point: fall back to point distance
      const d = L < 1e-6
        ? Math.hypot(pts[i][0] - ax, pts[i][1] - ay)
        : Math.abs((pts[i][0] - ax) * dy - (pts[i][1] - ay) * dx) / L;
      if (d > maxD) {
        maxD = d;
        idx = i;
      }
    }
    if (maxD > tol) {
      keep[idx] = 1;
      stack.push([i0, idx], [idx, i1]);
    }
  }
  return coords.filter((_, i) => keep[i]);
}
