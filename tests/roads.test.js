// Unit tests for road parsing, the spatial index, snapping and walls.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseOverpass, splitIntoCells, cellKey, cellBounds, buildQuery, wayHalfWidth } from '../src/roads/overpass.js';
import { RoadNetwork, roadLabel } from '../src/roads/roadNetwork.js';
import { LocalFrame } from '../src/core/geo.js';
import { Vehicle } from '../src/physics/vehicle.js';
import { CAR_TYPES, CAR_ORDER, carRatings } from '../src/cars/carTypes.js';
import { applyRoadConstraint, collideWall, surfacesFor } from '../src/physics/roadConstraint.js';

const LNG = 81.6339, LAT = 21.2376; // Raipur
const M_LAT = 1 / 111319.49; // degrees per metre north
const M_LNG = M_LAT / Math.cos(LAT * Math.PI / 180);

// Sample Overpass response: a N–S primary road through the origin and an
// E–W residential lane 200 m north. Plus things the parser must drop.
const sample = {
  elements: [
    { type: 'way', id: 1, tags: { highway: 'primary', name: 'GE Road', ref: 'NH 53' },
      geometry: [{ lat: LAT - 500 * M_LAT, lon: LNG }, { lat: LAT + 500 * M_LAT, lon: LNG }] },
    { type: 'way', id: 2, tags: { highway: 'residential', surface: 'dirt' },
      geometry: [{ lat: LAT + 200 * M_LAT, lon: LNG - 300 * M_LNG }, { lat: LAT + 200 * M_LAT, lon: LNG + 300 * M_LNG }] },
    { type: 'way', id: 3, tags: { highway: 'footway' }, geometry: [{ lat: LAT, lon: LNG }, { lat: LAT + 0.001, lon: LNG }] },
    { type: 'node', id: 4, lat: LAT, lon: LNG },
  ],
};

function network() {
  const net = new RoadNetwork(new LocalFrame(LNG, LAT));
  net.addWays(parseOverpass(sample));
  return net;
}

test('parseOverpass keeps drivable roads and compacts them', () => {
  const ways = parseOverpass(sample);
  assert.equal(ways.length, 2);
  assert.deepEqual(Object.keys(ways[0]).sort(), ['c', 'id', 'n', 'r', 't']);
  assert.equal(ways[1].u, 1, 'dirt surface flagged unpaved');
  assert.equal(roadLabel({ ref: 'NH 53', name: 'GE Road' }), 'NH53 · GE Road');
  assert.equal(roadLabel({ ref: '', name: '', type: 'living_street' }), 'Living street');
});

test('cells: keys, bounds, splitting and query text', () => {
  const key = cellKey(LNG, LAT);
  const b = cellBounds(key);
  assert.ok(b.s <= LAT && LAT < b.n && b.w <= LNG && LNG < b.e);
  const cells = splitIntoCells(parseOverpass(sample));
  assert.ok(cells.get(key).length >= 1);
  assert.match(buildQuery(b), /way\["highway"~"\^\(motorway\|.*\)\$"\]/);
  assert.ok(wayHalfWidth({ t: 'residential', l: 4 }) > wayHalfWidth({ t: 'residential' }));
});

test('network query finds nearest edge and outward normal', () => {
  const net = network();
  const on = net.query(2, 0);
  assert.ok(on.found && on.edge < 0 && on.way.name === 'GE Road');
  const off = net.query(20, 0);
  assert.ok(Math.abs(off.edge - (20 - 8)) < 0.5, `edge ${off.edge}`);
  assert.ok(off.nx > 0.99, 'normal points east, away from road');
  assert.equal(net.query(500, 0).found, false);
  assert.ok(net.nearest(500, 0).found, 'expanding search finds it');
  // Duplicate ways are ignored
  const n = net.segmentCount;
  net.addWays(parseOverpass(sample));
  assert.equal(net.segmentCount, n);
});

test('findSpawn picks the major road, left lane, aligned with heading', () => {
  const net = network();
  const sp = net.findSpawn(30, 190, 0);
  assert.equal(sp.way.type, 'primary');
  assert.ok(Math.abs(sp.heading) < 1e-6, 'faces north');
  assert.ok(sp.x < 0 && sp.x > -4, `left lane x=${sp.x}`);
  const south = net.findSpawn(0, 0, Math.PI);
  assert.ok(Math.abs(Math.abs(south.heading) - Math.PI) < 1e-6);
  assert.ok(south.x > 0, 'left of a southbound car is east');
});

test('walls stop a car leaving the road; off-road is slower', () => {
  const net = network();
  const spec = CAR_TYPES.hatchback;
  const car = new Vehicle(spec, 0, 0, Math.PI / 2); // facing east, off the road
  car.vx = 15;
  const state = { inBounds: true, surface: 'road', way: null, impact: 0 };
  let maxImpact = 0;
  for (let i = 0; i < 240; i++) {
    car.step(1 / 120, { throttle: 1, brake: 0, steer: 0, handbrake: false }, surfacesFor(spec)[state.surface]);
    applyRoadConstraint(car, net, state, { walls: true, loaded: true });
    maxImpact = Math.max(maxImpact, state.impact);
  }
  assert.ok(car.x <= 8 + spec.verge + 0.01, `stopped at boundary, x=${car.x}`);
  assert.ok(maxImpact > 5, 'registered an impact');
  // Free mode lets the car through
  const free = new Vehicle(spec, 0, 0, Math.PI / 2);
  free.vx = 15;
  const st2 = { inBounds: true, surface: 'road', way: null, impact: 0 };
  for (let i = 0; i < 240; i++) {
    free.step(1 / 120, { throttle: 1, brake: 0, steer: 0, handbrake: false }, surfacesFor(spec)[st2.surface]);
    applyRoadConstraint(free, net, st2, { walls: false, loaded: true });
  }
  assert.ok(free.x > 20);
  assert.equal(st2.surface, 'offroad');
});

test('collideWall reflects only outward motion', () => {
  const car = new Vehicle(CAR_TYPES.sedan);
  car.vx = 10; car.vy = 5;
  const impact = collideWall(car, 1, 0, 0.5);
  assert.equal(impact, 10);
  assert.ok(car.vx < 0 && car.vy > 0 && car.x === -0.5);
  car.vx = -3;
  assert.equal(collideWall(car, 1, 0, 0), 0);
});

test('all cars are distinct and drivable', () => {
  const tops = new Set();
  for (const id of CAR_ORDER) {
    const spec = CAR_TYPES[id];
    const car = new Vehicle(spec);
    for (let t = 0; t < 40; t += 1 / 120) car.step(1 / 120, { throttle: 1, brake: 0, steer: 0, handbrake: false });
    tops.add(Math.round(car.speed));
    const r = carRatings(spec);
    for (const v of Object.values(r)) assert.ok(v > 0 && v <= 1);
  }
  assert.equal(tops.size, 4, `top speeds ${[...tops]}`);
  assert.ok(carRatings(CAR_TYPES.jeep)['Off-road'] > carRatings(CAR_TYPES.roadster)['Off-road']);
  assert.ok(carRatings(CAR_TYPES.roadster).Speed > carRatings(CAR_TYPES.sedan).Speed);
});
