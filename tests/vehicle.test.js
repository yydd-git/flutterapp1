// Unit tests for the arcade physics model. Run with `npm test`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Vehicle } from '../src/physics/vehicle.js';
import { CAR_TYPES } from '../src/cars/carTypes.js';

const DT = 1 / 120;
const idle = { throttle: 0, brake: 0, steer: 0, handbrake: false };
const run = (car, ctl, seconds) => { for (let t = 0; t < seconds; t += DT) car.step(DT, ctl); };

test('accelerates north and settles below top speed', () => {
  const car = new Vehicle(CAR_TYPES.hatchback);
  run(car, { ...idle, throttle: 1 }, 5);
  const at5 = car.speed;
  run(car, { ...idle, throttle: 1 }, 60);
  assert.ok(at5 > 12 && at5 < 25, `0-5 s speed ${at5}`);
  assert.ok(car.speed > 27 && car.speed < CAR_TYPES.hatchback.topSpeed, `top ${car.speed}`);
  assert.ok(Math.abs(car.x) < 1e-6 && car.y > 100, 'moved straight north');
});

test('brakes to a stop without reversing on its own', () => {
  const car = new Vehicle(CAR_TYPES.hatchback);
  run(car, { ...idle, throttle: 1 }, 6);
  run(car, { ...idle, brake: 1 }, 1);
  run(car, idle, 20); // brake released before stopping: coasts down, no reverse
  assert.equal(car.speed, 0);
});

test('holding brake from standstill reverses, capped', () => {
  const car = new Vehicle(CAR_TYPES.hatchback);
  run(car, { ...idle, brake: 1 }, 10);
  assert.ok(car.forwardSpeed < -3 && car.forwardSpeed >= -CAR_TYPES.hatchback.reverseSpeed);
  assert.ok(car.reversing);
});

test('steering right turns clockwise; no turning at standstill', () => {
  const still = new Vehicle(CAR_TYPES.hatchback);
  run(still, { ...idle, steer: 1 }, 2);
  assert.equal(still.heading, 0);
  const car = new Vehicle(CAR_TYPES.hatchback);
  run(car, { ...idle, throttle: 1 }, 3);
  run(car, { ...idle, throttle: 0.5, steer: 1 }, 0.5);
  assert.ok(car.heading > 0.2, `heading ${car.heading}`);
});

test('handbrake while turning produces a drift', () => {
  const car = new Vehicle(CAR_TYPES.hatchback);
  run(car, { ...idle, throttle: 1 }, 6);
  let drifted = false;
  for (let t = 0; t < 1; t += DT) {
    car.step(DT, { throttle: 1, brake: 0, steer: 1, handbrake: true });
    drifted ||= car.drifting;
  }
  assert.ok(drifted);
});
