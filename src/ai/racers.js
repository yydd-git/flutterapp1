/**
 * AI race opponents.
 *
 * Racers follow the pre-computed race line (on real roads) at a distance
 * `s`, with a lateral lane offset: left lane normally, moving right to
 * overtake (India drives on the left). Their speed comes from:
 *   - their car's top speed × a per-driver skill factor,
 *   - corner limits: v ≤ √(a_lat · r), planned ahead with a braking
 *     curve so they slow *before* bends,
 *   - traffic and the player ahead (overtake if the other lane is clear,
 *     else follow),
 *   - gentle rubber-banding so races stay close.
 * They're kinematic, so the player can bump them (see physics/collide.js).
 */
import { STEP } from '../race/routePath.js';
import { approach, clamp } from '../core/geo.js';

const DECEL = 6.5;
const LANE_LEFT = 2.0;
const LANE_PASS = -1.2;

export class Racer {
  constructor({ spec, colour, name, s, lane, skill }) {
    this.spec = spec;
    this.colour = colour;
    this.name = name;
    this.s = s; // total distance along the race (laps included)
    this.lane = lane;
    this.laneTarget = LANE_LEFT;
    this.skill = skill;
    this.speed = 0;
    this.x = 0;
    this.y = 0;
    this.heading = 0;
    this.braking = false;
    this.reversing = false;
    this.finished = false;
    this.finishTime = Infinity;
    this.hit = 0;
    this._clearFor = 0;
    this._pt = { x: 0, y: 0, heading: 0 };
  }

  /** Place on the line without moving (grid, after loading). */
  place(path) {
    const p = path.pointAt(this.s, this._pt);
    this.heading = p.heading;
    this.x = p.x - Math.cos(p.heading) * this.lane;
    this.y = p.y + Math.sin(p.heading) * this.lane;
  }

  /**
   * @param {number} dt
   * @param {import('../race/routePath.js').RoutePath} path
   * @param {object[]} obstacles things with { x, y, spec, speed }
   * @param {number} playerS player's total distance (for rubber-banding)
   * @param {number} totalLen race length
   */
  update(dt, path, obstacles, playerS, totalLen) {
    if (this.finished) {
      // Cruise to a stop past the line
      this.speed = approach(this.speed, 0, 3 * dt);
    } else {
      const sp = this.spec;
      let vmax = sp.topSpeed * 0.9 * this.skill;
      const gapToPlayer = this.s - playerS;
      if (gapToPlayer > 250) vmax *= 0.92;
      else if (gapToPlayer < -250) vmax *= 1.08;

      // Corner planning: the slowest allowed speed over the braking distance
      const aLat = sp.maxLatAccel * 0.82 * this.skill;
      const look = (this.speed * this.speed) / (2 * DECEL) + 25;
      let target = vmax;
      for (let d = 0; d <= look; d += STEP) {
        const vCorner = Math.sqrt(aLat * path.radiusAt(this.s + d));
        target = Math.min(target, Math.sqrt(vCorner * vCorner + 2 * DECEL * d));
      }

      // Anything ahead in our lane? Overtake on the right if clear.
      const ahead = this._blocked(obstacles, this.lane, 22 + this.speed);
      if (ahead) {
        const other = this.laneTarget === LANE_LEFT ? LANE_PASS : LANE_LEFT;
        if (!this._blocked(obstacles, other, 18 + this.speed)) {
          this.laneTarget = other;
          this._clearFor = 0;
        } else {
          target = Math.min(target, Math.max(0, ahead.speed - 0.5), Math.max(0, (ahead.gap - 4) * 0.8));
        }
      } else if (this.laneTarget === LANE_PASS) {
        this._clearFor += dt;
        if (this._clearFor > 2 && !this._blocked(obstacles, LANE_LEFT, 14)) this.laneTarget = LANE_LEFT;
      }

      if (this.hit > 0) {
        this.speed = Math.max(0, this.speed - this.hit);
        this.hit = 0;
      }
      this.braking = target < this.speed - 0.5;
      const accel = sp.accel * 0.95 * (1 - Math.min(0.85, (this.speed / Math.max(1, vmax)) ** 2));
      this.speed = approach(this.speed, target, (this.braking ? DECEL : accel) * dt);
      if (this.s + this.speed * dt >= totalLen) this.finished = true;
    }
    this.s = Math.min(this.s + this.speed * dt, totalLen + 200);
    this.lane = approach(this.lane, this.laneTarget, 1.6 * dt);

    const p = path.pointAt(this.s, this._pt);
    let d = p.heading - this.heading;
    d = Math.atan2(Math.sin(d), Math.cos(d));
    this.heading += d * clamp(dt * 8, 0, 1);
    this.x = p.x - Math.cos(p.heading) * this.lane;
    this.y = p.y + Math.sin(p.heading) * this.lane;
  }

  /** Nearest obstacle within `range` ahead in the lane at offset `lane`, or null. */
  _blocked(obstacles, lane, range) {
    const fx = Math.sin(this.heading), fy = Math.cos(this.heading);
    // Point in the queried lane level with us
    const ox = this.x - Math.cos(this.heading) * (lane - this.lane);
    const oy = this.y + Math.sin(this.heading) * (lane - this.lane);
    let best = null;
    for (const o of obstacles) {
      if (o === this || !o.spec) continue;
      const dx = o.x - ox, dy = o.y - oy;
      if (Math.abs(dx) > range + 15 || Math.abs(dy) > range + 15) continue;
      const along = dx * fx + dy * fy;
      if (along < -this.spec.length || along > range) continue;
      const lat = dx * fy - dy * fx;
      if (Math.abs(lat) > (this.spec.width + o.spec.width) / 2 + 0.4) continue;
      const gap = along - (this.spec.length + o.spec.length) / 2;
      if (!best || gap < best.gap) best = { gap, speed: o.speed ?? Math.hypot(o.vx || 0, o.vy || 0) };
    }
    return best;
  }
}
