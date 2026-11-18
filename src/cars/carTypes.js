/**
 * Car catalogue. Original, stylised designs inspired by classic Indian
 * cars — no real brand names or logos.
 *
 * Phase 1 ships the hatchback; Phase 2 adds the sedan, jeep and roadster
 * using the same spec shape.
 *
 * Units: metres, kilograms, seconds (speeds in m/s, accelerations in m/s²).
 */
export const CAR_TYPES = {
  hatchback: {
    id: 'hatchback',
    name: "Pocket Hatch '84",
    blurb: 'Light, nimble city runabout. Low top speed, turns on a coin.',
    // Body
    length: 3.35,
    width: 1.42,
    wheelbase: 2.18,
    mass: 650,
    // Longitudinal
    topSpeed: 34, // engine runs out of puff around 110 km/h
    accel: 4.4,
    brake: 9,
    reverseSpeed: 6,
    rolling: 0.15, // rolling resistance (m/s²)
    aero: 0.0008, // aero drag coefficient (× v²)
    engineBrake: 0.9, // extra deceleration off-throttle (m/s²)
    // Steering & grip
    maxSteer: 0.62, // rad, front-wheel lock at standstill
    steerFalloff: 13, // speed (m/s) at which lock has halved
    steerSpeed: 4.5, // how fast the wheel turns in (1/s)
    steerReturn: 7, // how fast it self-centres (1/s)
    yawResponse: 14, // how quickly the body follows the wheels (rad/s²)
    maxLatAccel: 10, // caps turn rate at speed (m/s²): yaw ≤ a / v
    grip: 9, // lateral slip decay rate (1/s); higher = grippier
    handbrakeGrip: 0.18, // grip multiplier while drifting
    driftYaw: 0.45, // extra rotation while the handbrake is held
    colours: ['#f4f1e8', '#c8102e', '#1f4e9c', '#f2b705', '#2e7d32'],
    sprite: 'hatchback',
  },
};

export const DEFAULT_CAR = 'hatchback';
