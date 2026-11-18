// Unit tests for routing, race lines, traffic, collisions and race flow.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildGraph, astar, nearestNode, routeThrough, simplify, distM } from '../src/race/routing.js';
import { RoutePath } from '../src/race/routePath.js';
import { Race } from '../src/race/raceManager.js';
import { ROUTES } from '../src/race/routes.js';
import { formatTime } from '../src/race/leaderboard.js';
import { LocalFrame } from '../src/core/geo.js';
import { RoadNetwork } from '../src/roads/roadNetwork.js';
import { TrafficManager } from '../src/ai/traffic.js';
import { collidePlayer } from '../src/physics/collide.js';
import { Vehicle } from '../src/physics/vehicle.js';
import { CAR_TYPES } from '../src/cars/carTypes.js';

const LNG = 81.6339, LAT = 21.2376;
const dLat = 1 / 111319.49, dLng = dLat / Math.cos(LAT * Math.PI / 180);
const P = (east, north) => [Math.round((LNG + east * dLng) * 1e5) / 1e5, Math.round((LAT + north * dLat) * 1e5) / 1e5];
const way = (id, t, pts, extra = {}) => ({ id, t, c: pts.flatMap((p) => P(...p)), ...extra });

// A 1 km square of residential streets with a fast trunk road on the east side.
const ways = [
  way(1, 'residential', [[0, 0], [0, 500], [0, 1000]]),
  way(2, 'residential', [[0, 1000], [500, 1000], [1000, 1000]]),
  way(3, 'trunk', [[1000, 1000], [1000, 500], [1000, 0]]),
  way(4, 'residential', [[1000, 0], [500, 0], [0, 0]]),
  way(5, 'residential', [[0, 500], [500, 500], [1000, 500]]),
  way(6, 'primary', [[500, 0], [500, 500]], { o: 1 }), // one-way north
];

test('A* prefers fast roads and respects one-way streets', () => {
  const g = buildGraph(ways);
  const a = nearestNode(g, ...P(500, 500));
  const b = nearestNode(g, ...P(500, 0));
  const path = astar(a, b);
  assert.ok(path && path.length >= 3, 'found a path');
  assert.ok(path.length > 2, 'cannot go the wrong way down the one-way');
  const back = astar(b, a);
  assert.equal(back.length, 2, 'the one-way itself is the direct route north');
});

test('routeThrough builds point-to-point and circuit lines', () => {
  const g = buildGraph(ways);
  const p2p = routeThrough(g, [P(0, 0), P(1000, 1000)]);
  assert.ok(Math.abs(p2p.length - 2000) < 5, `p2p length ${p2p.length}`);
  const loop = routeThrough(g, [P(0, 0), P(0, 1000), P(1000, 1000), P(1000, 0)], true);
  assert.ok(Math.abs(loop.length - 4000) < 10, `loop length ${loop.length}`);
  assert.deepEqual(loop.coords[0], loop.coords[loop.coords.length - 1]);
  const s = simplify(loop.coords, 1);
  assert.ok(s.length <= loop.coords.length && s.length >= 5);
  assert.ok(Math.abs(distM(...P(0, 0), ...P(300, 400)) - 500) < 1);
});

test('RoutePath: lookups, projection window and corner radii', () => {
  const frame = new LocalFrame(LNG, LAT);
  const coords = [P(0, 0), P(0, 500), P(500, 500)];
  const path = new RoutePath(coords, frame);
  assert.ok(Math.abs(path.length - 1000) < 6);
  const mid = path.pointAt(250);
  assert.ok(Math.abs(mid.x) < 0.5 && Math.abs(mid.y - 250) < 0.5 && Math.abs(mid.heading) < 1e-6);
  const pr = path.project(3, 100, 0);
  assert.ok(Math.abs(pr.s - 100) < 1 && Math.abs(pr.dist - 3) < 0.5);
  // A narrow window can't jump to the far end of the route
  const far = path.project(400, 500, 0, 10, 20);
  assert.ok(far.s < 120, 'stays near the hint');
  assert.ok(path.radiusAt(500) < 50 && path.radiusAt(200) > 1000, 'corner is tight, straight is not');
  const sprint = new RoutePath(coords, frame, { cutAt: 300 });
  assert.ok(Math.abs(sprint.length - 300) < 6);
  const loop = new RoutePath([P(0, 0), P(0, 400), P(400, 400), P(400, 0), P(0, 0)], frame, { closed: true });
  assert.ok(Math.abs(loop.length - 1600) < 2 && Math.abs(loop.wrap(1700) - 100) < 2);
});

test('race: checkpoints, finish and results with AI', () => {
  const frame = new LocalFrame(LNG, LAT);
  const route = { ...ROUTES[0], kind: 'p2p' };
  const race = new Race({ route, data: { coords: [P(0, 0), P(0, 3000)] }, frame, variant: 'full', opponents: 3, playerCar: 'hatchback' });
  assert.equal(race.racers.length, 3);
  assert.ok(race.checkpoints.length >= 3 && race.checkpoints.at(-1) === race.totalLen);
  const g = race.playerGrid();
  const car = new Vehicle(CAR_TYPES.roadster, g.x, g.y, g.heading);
  race.beginCountdown();
  const events = [];
  for (let t = 0; t < 200 && race.state !== 'finished'; t += 1 / 60) {
    if (!race.locked) car.step(1 / 60, { throttle: 1, brake: 0, steer: 0, handbrake: false });
    events.push(...race.update(1 / 60, car, [car, ...race.racers]));
  }
  assert.equal(race.state, 'finished');
  assert.ok(events.includes('go') && events.includes('finish') && events.includes('checkpoint'));
  assert.equal(race.results.length, 4);
  assert.ok(race.results.some((r) => r.player));
  assert.ok(race.finishTime > 50 && race.finishTime < 200, `time ${race.finishTime}`);
  assert.equal(formatTime(83.456), '1:23.46');
});

test('circuit race counts laps', () => {
  const frame = new LocalFrame(LNG, LAT);
  const route = ROUTES.find((r) => r.kind === 'circuit');
  const sq = [P(0, 0), P(0, 150), P(150, 150), P(150, 0), P(0, 0)];
  const race = new Race({ route, data: { coords: sq }, frame, laps: 2, opponents: 0, playerCar: 'hatchback' });
  race.beginCountdown();
  for (let t = 0; t < 4; t += 0.1) race.update(0.1, race.playerGrid(), []);
  // Teleport the "car" around the loop twice, step by step
  for (let s = race.playerS; s <= race.totalLen + 5; s += 4) {
    const pt = race.path.pointAt(s);
    race.update(0.05, pt, []);
  }
  assert.equal(race.state, 'finished');
  assert.equal(race.lapTimes.length, 2);
});

test('traffic spawns on roads, keeps left and drives on', () => {
  const frame = new LocalFrame(LNG, LAT);
  const net = new RoadNetwork(frame);
  net.addWays(ways);
  const tm = new TrafficManager();
  tm.reset(net);
  tm.setDensity('busy');
  const player = { x: 500, y: 500, heading: 0, spec: CAR_TYPES.hatchback, speed: 0 };
  for (let i = 0; i < 40; i++) tm.update(0.1, player, [player]);
  const act = tm.active;
  assert.ok(act.length > 3, `spawned ${act.length}`);
  for (const a of act) {
    const hit = net.query(a.x, a.y, 30);
    assert.ok(hit.found && hit.edge < 2, `agent ${a.spec.id} on road (edge ${hit.edge})`);
  }
  const movers = act.filter((a) => a.spec.id !== 'cow');
  const before = movers.map((a) => [a.x, a.y]);
  for (let i = 0; i < 30; i++) tm.update(0.1, player, [player]);
  assert.ok(movers.some((a, i) => Math.hypot(a.x - before[i][0], a.y - before[i][1]) > 5), 'vehicles move');
});

test('collisions push the player out and exchange momentum by mass', () => {
  const car = new Vehicle(CAR_TYPES.hatchback, 0, 0, 0);
  car.vy = 15;
  const truck = { x: 0, y: 2.6, heading: Math.PI / 2, speed: 0, spec: { length: 8.5, width: 2.45, mass: 12000 } };
  const impact = collidePlayer(car, truck);
  assert.ok(impact > 10, `impact ${impact}`);
  assert.ok(car.vy < 0, 'bounced back off the heavy truck');
  // A light rickshaw in the same crash loses far more speed than the truck
  const car2 = new Vehicle(CAR_TYPES.hatchback, 0, 0, 0);
  car2.vy = 15;
  const rick = { x: 0, y: 1.8, heading: Math.PI / 2, speed: 0, spec: { length: 2.75, width: 1.35, mass: 400 } };
  collidePlayer(car2, rick);
  assert.ok(rick.hit > truck.hit * 5, `rickshaw ${rick.hit} vs truck ${truck.hit}`);
  assert.ok(car2.vy > car.vy, 'car keeps more speed hitting the light rickshaw');
  const far = { x: 50, y: 50, heading: 0, speed: 0, spec: { length: 3, width: 1.4, mass: 400 } };
  assert.equal(collidePlayer(car, far), 0);
});

test('projection picks the right side of an out-and-back line', () => {
  const frame = new LocalFrame(LNG, LAT);
  // North 300 m and straight back down the same road
  const path = new RoutePath([P(0, 0), P(0, 300), P(0.5, 300), P(0, 0)], frame, { closed: true });
  const out = path.project(0, 50, 10, 30, 90, 0); // heading north near the start
  assert.ok(out.s < 100, `outbound s=${out.s}`);
  const back = path.project(0, 50, 100, 30, 90, Math.PI); // heading south late in the lap
  assert.ok(back.s > 400, `return s=${back.s}`);
  const still = path.project(0, 17, 3, 30, 90, null); // parked on the grid: stay near the hint
  assert.ok(still.s < 40, `grid s=${still.s}`);
});
