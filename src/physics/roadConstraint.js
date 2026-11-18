/**
 * Keeps vehicles on the real road network.
 *
 * Zones by signed distance from the nearest road edge:
 *   edge ≤ 0            on the road: tarmac (or dirt if OSM says unpaved)
 *   0 < edge ≤ verge    verge/off-road: car-specific grip & speed penalty
 *   edge > verge        "wall": buildings, fields, ditches. The car is
 *                       pushed back and its outward speed bounces off.
 *
 * Each car has its own verge width: the jeep can roam ~45 m off the
 * tarmac, the low roadster only ~4 m. Walls only engage once the car has
 * been in bounds, so a car that starts in an unloaded area isn't
 * teleported when road data arrives later. It just can't leave once it
 * rejoins the road.
 */
import { SURFACE_ROAD } from './vehicle.js';

/** Build the three surface presets for a car spec. */
export function surfacesFor(spec) {
  const o = spec.offroad;
  const mix = (k) => (1 + o[k]) / 2;
  return {
    road: SURFACE_ROAD,
    dirt: Object.freeze({ grip: mix('grip'), accel: mix('accel'), topSpeed: mix('topSpeed'), rolling: 2, brake: mix('grip') }),
    offroad: Object.freeze({ grip: o.grip, accel: o.accel, topSpeed: o.topSpeed, rolling: 4, brake: o.grip }),
  };
}

/**
 * Resolve the surface under `car` and apply wall collisions.
 * Mutates `car` (position/velocity) and `state`.
 * @param {import('./vehicle.js').Vehicle} car
 * @param {import('../roads/roadNetwork.js').RoadNetwork} roads
 * @param {{inBounds:boolean, surface:string, way:object|null, impact:number}} state
 * @param {{walls:boolean, loaded:boolean}} opts
 */
export function applyRoadConstraint(car, roads, state, opts) {
  state.impact = 0;
  if (!opts.loaded) {
    // No data for this area (yet): drive freely on a neutral surface.
    state.surface = 'road';
    state.way = null;
    return;
  }
  const verge = car.spec.verge;
  const hit = roads.query(car.x, car.y, verge + 16);
  if (!hit.found) {
    state.surface = 'offroad';
    state.way = null;
    if (opts.walls) state.inBounds = false;
    return;
  }
  state.way = hit.way;
  if (hit.edge <= 0) {
    state.surface = hit.way.unpaved ? 'dirt' : 'road';
    state.inBounds = true;
  } else if (hit.edge <= verge) {
    state.surface = 'offroad';
    state.inBounds = true;
  } else {
    state.surface = 'offroad';
    if (opts.walls && state.inBounds) {
      state.impact = collideWall(car, hit.nx, hit.ny, hit.edge - verge);
    }
  }
}

/**
 * Push the car back inside the boundary and bounce its outward velocity.
 * (nx, ny) points outwards. Returns the impact speed in m/s.
 */
export function collideWall(car, nx, ny, penetration) {
  car.x -= nx * penetration;
  car.y -= ny * penetration;
  const vn = car.vx * nx + car.vy * ny;
  if (vn <= 0) return 0;
  const restitution = 0.25;
  car.vx -= (1 + restitution) * vn * nx;
  car.vy -= (1 + restitution) * vn * ny;
  // Scraping along a wall bleeds speed; harder hits bleed more.
  const scrub = Math.max(0.55, 1 - vn * 0.035);
  car.vx *= scrub;
  car.vy *= scrub;
  car.yawRate *= 0.4;
  return vn;
}
