/**
 * Car catalogue. Original, stylised designs inspired by classic Indian
 * cars (no real brand names or logos).
 *
 * Units: metres, kilograms, seconds (speeds in m/s, accelerations in m/s²).
 *
 * Handling fields
 *   maxSteer     wheel lock at standstill (rad)
 *   steerFalloff speed (m/s) at which lock has halved
 *   steerSpeed / steerReturn  how fast the wheel turns in / self-centres (1/s)
 *   yawResponse  how quickly the body follows the wheels (rad/s²)
 *   maxLatAccel  tyre limit; caps turn rate at speed (m/s²)
 *   grip         lateral slip decay (1/s); higher = grippier
 *   handbrakeGrip / driftYaw  drift behaviour
 * Terrain & damage
 *   offroad      multipliers off the tarmac (grip, accel, topSpeed)
 *   verge        metres beyond the road edge the car can go before "walls"
 *   fragility    damage multiplier for impacts (1 = normal)
 */
const BASE = {
  reverseSpeed: 6,
  rolling: 0.15,
  engineBrake: 0.9,
  steerReturn: 7,
  handbrakeGrip: 0.18,
  driftYaw: 0.45,
};

export const CAR_TYPES = {
  hatchback: {
    ...BASE,
    id: 'hatchback',
    name: "Pocket Hatch '84",
    blurb: 'Light, nimble city runabout. Low top speed, turns on a coin.',
    length: 3.35, width: 1.42, wheelbase: 2.18, mass: 650,
    topSpeed: 34, accel: 4.4, brake: 9, aero: 0.0008,
    maxSteer: 0.62, steerFalloff: 13, steerSpeed: 4.5, yawResponse: 14, maxLatAccel: 10,
    grip: 9,
    offroad: { grip: 0.65, accel: 0.7, topSpeed: 0.5 },
    verge: 6,
    fragility: 1,
    colours: ['#f4f1e8', '#c8102e', '#1f4e9c', '#f2b705', '#2e7d32'],
    sprite: 'hatchback',
  },

  sedan: {
    ...BASE,
    id: 'sedan',
    name: "Raj Sedan '68",
    blurb: 'Heavy, rounded and built like a tank. Slow to get going, shrugs off knocks.',
    length: 4.33, width: 1.66, wheelbase: 2.47, mass: 1150,
    topSpeed: 36, accel: 2.7, brake: 7.2, aero: 0.0009,
    maxSteer: 0.55, steerFalloff: 12, steerSpeed: 3.2, yawResponse: 8, maxLatAccel: 8.5,
    grip: 7.5, engineBrake: 0.6, handbrakeGrip: 0.22, driftYaw: 0.3, steerReturn: 5,
    offroad: { grip: 0.7, accel: 0.7, topSpeed: 0.55 },
    verge: 7,
    fragility: 0.35,
    colours: ['#f5f3ea', '#e8dcc0', '#151515', '#6d1a1a', '#2f4f6f'],
    sprite: 'sedan',
  },

  jeep: {
    ...BASE,
    id: 'jeep',
    name: 'Ghat Jeep',
    blurb: 'Boxy 4x4 for broken roads. Keeps its grip in dirt and can leave the tarmac.',
    length: 3.75, width: 1.55, wheelbase: 2.2, mass: 1000,
    topSpeed: 29, accel: 3.6, brake: 8, aero: 0.0012,
    maxSteer: 0.6, steerFalloff: 12, steerSpeed: 4, yawResponse: 11, maxLatAccel: 8.5,
    grip: 8.5, handbrakeGrip: 0.24,
    offroad: { grip: 0.95, accel: 0.92, topSpeed: 0.85 },
    verge: 45,
    fragility: 0.6,
    colours: ['#556b2f', '#f2efe6', '#b22222', '#c2a878', '#1d1d1d'],
    sprite: 'jeep',
  },

  roadster: {
    ...BASE,
    id: 'roadster',
    name: "Rani Roadster '58",
    blurb: 'Vintage open two-seater. Very fast and sharp, but fragile and hates dirt.',
    length: 4.05, width: 1.58, wheelbase: 2.35, mass: 880,
    topSpeed: 52, accel: 6, brake: 9.5, aero: 0.0006,
    maxSteer: 0.58, steerFalloff: 15, steerSpeed: 5, yawResponse: 15, maxLatAccel: 11.5,
    grip: 9.5, handbrakeGrip: 0.16, driftYaw: 0.5,
    offroad: { grip: 0.5, accel: 0.55, topSpeed: 0.4 },
    verge: 4,
    fragility: 2.2,
    colours: ['#0f4d2e', '#b3121b', '#efe6cf', '#7fb3d5', '#b8bcc2'],
    sprite: 'roadster',
  },
};

export const CAR_ORDER = ['hatchback', 'sedan', 'jeep', 'roadster'];
export const DEFAULT_CAR = 'hatchback';

/**
 * 0..1 ratings for the menu stat bars, derived from the specs so they
 * always match how the cars actually drive.
 */
export function carRatings(spec) {
  const n = (v, lo, hi) => Math.max(0.08, Math.min(1, (v - lo) / (hi - lo)));
  return {
    Speed: n(spec.topSpeed, 25, 52),
    Accel: n(spec.accel, 2, 6),
    Handling: n(spec.maxLatAccel * 0.6 + spec.yawResponse * 0.25, 6, 11),
    Toughness: n(1 / spec.fragility, 0.3, 3),
    'Off-road': n(spec.offroad.grip * 0.5 + spec.offroad.topSpeed * 0.5, 0.4, 0.9),
  };
}
