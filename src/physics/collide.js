/**
 * Vehicle-vs-vehicle collisions.
 *
 * Each vehicle is approximated by a row of circles along its length (a
 * bus is ~4 circles, a car 2, a cow 3), which is cheap and handles long
 * vehicles well. Only the deepest overlap is resolved per pair per step.
 *
 * The player car is a full physics body. Traffic and AI racers are
 * kinematic: the player is pushed out of them, momentum is exchanged by
 * mass (a truck barely notices you, a rickshaw gets shoved), and the
 * other vehicle reports how hard it was hit so it can react.
 */

const _a = [], _b = [];

function circles(v, out) {
  const s = v.spec;
  const r = (s.width / 2) * 1.02;
  const n = Math.max(1, Math.round(s.length / s.width));
  const fx = Math.sin(v.heading), fy = Math.cos(v.heading);
  out.length = n;
  const span = Math.max(0, s.length / 2 - r);
  for (let i = 0; i < n; i++) {
    const t = n === 1 ? 0 : -span + (2 * span * i) / (n - 1);
    out[i] = out[i] || { x: 0, y: 0, r: 0 };
    out[i].x = v.x + fx * t;
    out[i].y = v.y + fy * t;
    out[i].r = r;
  }
  return out;
}

/**
 * Resolve a collision between the player `car` (Vehicle) and a kinematic
 * `other` with { x, y, heading, spec, speed }. Returns the closing speed
 * in m/s (0 if not touching).
 */
export function collidePlayer(car, other) {
  const dx0 = other.x - car.x, dy0 = other.y - car.y;
  const reach = (car.spec.length + other.spec.length) / 2 + 1;
  if (dx0 * dx0 + dy0 * dy0 > reach * reach) return 0;
  const A = circles(car, _a), B = circles(other, _b);
  let depth = 0, nx = 0, ny = 0;
  for (const a of A)
    for (const b of B) {
      const dx = a.x - b.x, dy = a.y - b.y;
      const d = Math.hypot(dx, dy);
      const o = a.r + b.r - d;
      if (o > depth) {
        depth = o;
        nx = d > 1e-6 ? dx / d : 1;
        ny = d > 1e-6 ? dy / d : 0;
      }
    }
  if (depth <= 0) return 0;
  // Push the player out (others are kinematic)
  car.x += nx * depth;
  car.y += ny * depth;
  const ovx = Math.sin(other.heading) * other.speed, ovy = Math.cos(other.heading) * other.speed;
  const vrel = (car.vx - ovx) * nx + (car.vy - ovy) * ny;
  if (vrel >= 0) return 0;
  const mc = car.spec.mass, mo = other.spec.mass;
  const e = 0.3;
  const j = (-(1 + e) * vrel) / (1 / mc + 1 / mo);
  car.vx += (j / mc) * nx;
  car.vy += (j / mc) * ny;
  car.yawRate += (Math.random() - 0.5) * Math.min(2, (j / mc) * 0.3);
  // Tell the other vehicle how much speed it lost
  other.hit = Math.max(other.hit || 0, j / mo);
  return -vrel;
}
