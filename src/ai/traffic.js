/**
 * AI traffic: auto-rickshaws, buses, trucks and cows on the real road
 * graph around the player.
 *
 * Vehicles keep left (India), follow road segments and pick a route at
 * junctions (mostly straight on), respect one-way streets, slow for bends,
 * and brake and honk for anything in their lane, cows included. Cows stand
 * at the roadside and sometimes amble across.
 *
 * A fixed pool of agent objects is reused (no garbage per frame). Agents
 * spawn out of sight 110–280 m from the player and are recycled beyond
 * 360 m, so the world looks busy while only ~15–25 are ever simulated.
 */
import { clamp, approach } from '../core/geo.js';

export const TRAFFIC_TYPES = {
  rickshaw: { id: 'rickshaw', sprite: 'rickshaw', length: 2.75, width: 1.35, mass: 400, speed: [7, 10], colours: ['#f2c21b', '#2f8f46', '#111111'], weight: 4 },
  bus: { id: 'bus', sprite: 'bus', length: 11, width: 2.5, mass: 9500, speed: [9, 13], colours: ['#c62828', '#1565c0', '#ef6c00', '#2e7d32'], weight: 1.4 },
  truck: { id: 'truck', sprite: 'truck', length: 8.5, width: 2.45, mass: 12000, speed: [8, 12], colours: ['#e65100', '#2e7d32', '#6a1b9a', '#c62828', '#f9a825'], weight: 2 },
  cow: { id: 'cow', sprite: 'cow', length: 2.2, width: 0.85, mass: 450, speed: [0, 0.6], colours: ['#f3efe6', '#8d6e63', '#d7ccc8', '#3e2723'], weight: 1.4 },
};
const TYPE_LIST = Object.values(TRAFFIC_TYPES);
export const DENSITY = { off: 0, normal: 14, busy: 24 };
const POOL = 28;
const SPAWN_MIN = 110, SPAWN_MAX = 280, DESPAWN = 360;

function pickWeighted(items, weightOf) {
  let total = 0;
  for (const it of items) total += weightOf(it);
  let r = Math.random() * total;
  for (const it of items) if ((r -= weightOf(it)) <= 0) return it;
  return items[items.length - 1];
}

export class TrafficManager {
  constructor() {
    this.agents = Array.from({ length: POOL }, () => ({ active: false, spec: null, hit: 0 }));
    this.target = DENSITY.normal;
    this.roads = null;
    this._spawnTimer = 0;
    this.honks = 0; // incremented whenever someone honks (for Phase 4 audio)
  }

  /** New road network (city change): drop everyone. */
  reset(roads) {
    this.roads = roads;
    for (const a of this.agents) a.active = false;
  }

  setDensity(key) {
    this.target = DENSITY[key] ?? DENSITY.normal;
    if (!this.target) for (const a of this.agents) a.active = false;
  }

  get active() {
    return this.agents.filter((a) => a.active);
  }

  /**
   * @param {number} dt
   * @param {{x:number,y:number,heading:number}} player
   * @param {object[]} extraObstacles other moving things (player, racers)
   */
  update(dt, player, extraObstacles) {
    if (!this.roads) return;
    if ((this._spawnTimer -= dt) <= 0) {
      this._spawnTimer = 0.4;
      this._manage(player);
    }
    for (const a of this.agents) {
      if (!a.active) continue;
      if (a.spec.id === 'cow') this._stepCow(a, dt);
      else this._stepVehicle(a, dt, extraObstacles);
    }
  }

  /* ---------------- spawning ---------------- */

  _manage(player) {
    let count = 0;
    for (const a of this.agents) {
      if (!a.active) continue;
      if (Math.hypot(a.x - player.x, a.y - player.y) > DESPAWN) a.active = false;
      else count++;
    }
    if (count >= this.target) return;
    const fx = Math.sin(player.heading), fy = Math.cos(player.heading);
    const cands = [];
    this.roads.forEachNear(player.x, player.y, SPAWN_MAX, (s) => {
      if (s.len < 8) return;
      const mx = (s.ax + s.bx) / 2 - player.x, my = (s.ay + s.by) / 2 - player.y;
      const d = Math.hypot(mx, my);
      if (d < SPAWN_MIN || d > SPAWN_MAX) return;
      const ahead = mx * fx + my * fy > 0 ? 2 : 1;
      cands.push({ s, w: ahead * (s.way.rank + 2) });
    });
    for (let tries = 0; tries < 3 && count < this.target && cands.length; tries++) {
      const { s } = pickWeighted(cands, (c) => c.w);
      if (this._spawnOn(s)) count++;
    }
  }

  _spawnOn(seg) {
    const a = this.agents.find((x) => !x.active);
    if (!a) return false;
    const rank = seg.way.rank;
    const types = TYPE_LIST.filter((t) => (t.id === 'cow' ? rank <= 3 : t.id === 'rickshaw' || rank >= 1));
    const spec = pickWeighted(types, (t) => t.weight);
    const dir = seg.way.oneway ? 1 : Math.random() < 0.5 ? 1 : -1;
    const t = Math.random() * seg.len;
    // Don't spawn on top of someone
    const px = seg.ax + (seg.dx * t) / seg.len, py = seg.ay + (seg.dy * t) / seg.len;
    for (const o of this.agents) if (o.active && Math.abs(o.x - px) < 14 && Math.abs(o.y - py) < 14) return false;
    a.active = true;
    a.spec = spec;
    a.colour = spec.colours[(Math.random() * spec.colours.length) | 0];
    a.seg = seg;
    a.dir = dir;
    a.t = t;
    a.hit = 0;
    a.wait = 0;
    a.braking = false;
    a.reversing = false;
    if (spec.id === 'cow') {
      const side = Math.random() < 0.5 ? 1 : -1;
      a.lane = side * Math.max(1, seg.way.half - 0.5);
      a.cross = Math.random() < 0.35 ? -side : 0; // walking across the road?
      a.speed = 0;
      a.turn = (Math.random() - 0.5) * 1.2;
    } else {
      a.lane = Math.min(seg.way.half * 0.5, 2.6);
      a.cruise = spec.speed[0] + Math.random() * (spec.speed[1] - spec.speed[0]);
      a.speed = a.cruise * 0.8;
      a.next = this._chooseNext(a);
    }
    a.heading = 0;
    this._place(a, true);
    return true;
  }

  /* ---------------- movement ---------------- */

  /** End node of the agent's current segment in its travel direction. */
  _endNode(a) {
    return a.dir > 0 ? a.seg.nb : a.seg.na;
  }

  /** Pick the next segment at the upcoming node: mostly straight on. */
  _chooseNext(a) {
    const node = this._endNode(a);
    const ux = (a.seg.dx / a.seg.len) * a.dir, uy = (a.seg.dy / a.seg.len) * a.dir;
    const opts = [];
    for (const s of node.segs) {
      if (s === a.seg) continue;
      const dir = s.na === node ? 1 : -1;
      if (dir < 0 && s.way.oneway) continue;
      const vx = (s.dx / s.len) * dir, vy = (s.dy / s.len) * dir;
      const straight = ux * vx + uy * vy; // 1 = straight, -1 = back
      if (straight < -0.3) continue; // no hairpin turns
      opts.push({ seg: s, dir, w: Math.pow(1.6 + straight, 3) });
    }
    if (!opts.length) return null; // dead end (or unloaded): U-turn
    return pickWeighted(opts, (o) => o.w);
  }

  _advance(a) {
    const nx = a.next;
    if (nx) {
      a.seg = nx.seg;
      a.dir = nx.dir;
    } else if (!a.seg.way.oneway) {
      a.dir = -a.dir; // U-turn at a dead end
    } else {
      a.active = false;
      return;
    }
    a.lane = Math.min(a.seg.way.half * 0.5, 2.6);
    a.next = this._chooseNext(a);
  }

  /** Compute world position/heading from (seg, dir, t, lane). */
  _place(a, snap = false) {
    const s = a.seg;
    const ux = (s.dx / s.len) * a.dir, uy = (s.dy / s.len) * a.dir;
    const sx = a.dir > 0 ? s.ax : s.bx, sy = a.dir > 0 ? s.ay : s.by;
    // Left of travel direction = (-uy, ux)
    a.x = sx + ux * a.t - uy * a.lane;
    a.y = sy + uy * a.t + ux * a.lane;
    let h = Math.atan2(ux, uy);
    // Cows face where they walk: positive lane offset is to the left (−90°).
    if (a.spec.id === 'cow') h += a.cross ? (-Math.PI / 2) * a.cross : a.turn;
    if (snap) a.heading = h;
    else {
      let d = h - a.heading;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      a.heading += d * Math.min(1, 0.25); // smooth corners
    }
  }

  _stepVehicle(a, dt, extra) {
    const fx = Math.sin(a.heading), fy = Math.cos(a.heading);
    // Gap to the nearest thing in our lane ahead
    let gap = Infinity;
    const look = 8 + a.speed * 2.2 + a.spec.length;
    const check = (o) => {
      if (o === a || !o.spec) return;
      const dx = o.x - a.x, dy = o.y - a.y;
      if (dx > look + 12 || dx < -look - 12 || dy > look + 12 || dy < -look - 12) return;
      const along = dx * fx + dy * fy;
      if (along <= 0) return;
      const lat = dx * fy - dy * fx;
      if (Math.abs(lat) > (a.spec.width + o.spec.width) / 2 + 0.5) return;
      gap = Math.min(gap, along - (a.spec.length + o.spec.length) / 2);
    };
    for (const o of this.agents) if (o.active) check(o);
    for (const o of extra) check(o);

    let desired = a.cruise;
    if (gap < look) {
      desired = Math.min(desired, Math.max(0, (gap - 2.5) * 0.7));
      if (gap < 6 && a.speed < 1 && Math.random() < dt * 0.6) this.honks++;
    }
    // Slow for the bend at the end of this segment
    if (a.next) {
      const ux = (a.seg.dx / a.seg.len) * a.dir, uy = (a.seg.dy / a.seg.len) * a.dir;
      const vx = (a.next.seg.dx / a.next.seg.len) * a.next.dir, vy = (a.next.seg.dy / a.next.seg.len) * a.next.dir;
      const turn = 1 - (ux * vx + uy * vy); // 0 straight .. 2 reverse
      if (turn > 0.15) desired = Math.min(desired, 3 + (a.seg.len - a.t) * 0.35 + (1.2 - turn) * 6);
    }
    // Recovering after being hit
    if (a.hit > 0) {
      a.speed = Math.max(0, a.speed - a.hit);
      a.wait = Math.max(a.wait, 1 + a.hit * 0.3);
      a.hit = 0;
      this.honks++;
    }
    if (a.wait > 0) {
      a.wait -= dt;
      desired = 0;
    }
    a.braking = desired < a.speed - 0.3;
    a.speed = approach(a.speed, Math.max(0, desired), (a.braking ? 6 : 1.8) * dt);
    a.t += a.speed * dt;
    let guard = 4;
    while (a.active && a.t > a.seg.len && guard--) {
      a.t -= a.seg.len;
      this._advance(a);
    }
    if (a.active) this._place(a);
  }

  _stepCow(a, dt) {
    if (a.hit > 0) {
      // Startled: trot off the road on the side it was pushed
      a.cross = a.lane >= 0 ? 1 : -1;
      a.hit = 0;
    }
    if (a.cross) {
      a.lane += a.cross * 0.6 * dt;
      const limit = a.seg.way.half + 2.5;
      if (Math.abs(a.lane) > limit) {
        a.lane = clamp(a.lane, -limit, limit);
        a.cross = 0;
        a.turn = (Math.random() - 0.5) * 1.5;
      }
    }
    a.speed = 0;
    this._place(a);
  }
}
