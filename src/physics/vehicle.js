/**
 * Arcade vehicle physics.
 *
 * A simplified "bicycle" model: the car has a heading and a world-space
 * velocity. Each step the velocity is split into forward and lateral parts
 * relative to the heading:
 *  - forward speed changes with throttle, brakes and drag;
 *  - lateral speed decays at a rate set by tyre grip. Low grip (handbrake)
 *    lets the car slide sideways, which is the drift.
 * Steering sets a yaw rate from forward speed and wheel angle. Because the
 * heading rotates before the velocity catches up, slip and drift happen
 * on their own.
 *
 * The model has no DOM or map dependencies, so the same class also drives
 * AI cars and can be unit-tested in Node.
 */
import { approach, clamp } from '../core/geo.js';

/** Surface multipliers. Phase 2 swaps these for off-road / dirt / water. */
export const SURFACE_ROAD = Object.freeze({
  grip: 1,
  accel: 1,
  topSpeed: 1,
  rolling: 1,
  brake: 1,
});

export class Vehicle {
  /**
   * @param {object} spec  entry from CAR_TYPES
   * @param {number} x     local metres east
   * @param {number} y     local metres north
   * @param {number} heading radians clockwise from north
   */
  constructor(spec, x = 0, y = 0, heading = 0) {
    this.spec = spec;
    this.x = x;
    this.y = y;
    this.heading = heading;
    this.vx = 0;
    this.vy = 0;
    this.steer = 0; // smoothed steering wheel position, -1..1
    this.yawRate = 0;
    this.forwardSpeed = 0;
    this.lateralSpeed = 0;
    this.speed = 0;
    this.braking = false;
    this.reversing = false;
    this.drifting = false;
  }

  /** Teleport and stop the car (respawn). */
  reset(x, y, heading) {
    this.x = x;
    this.y = y;
    this.heading = heading;
    this.vx = this.vy = this.steer = this.yawRate = 0;
    this.forwardSpeed = this.lateralSpeed = this.speed = 0;
  }

  /**
   * Advance the simulation.
   * @param {number} dt seconds
   * @param {{throttle:number, brake:number, steer:number, handbrake:boolean}} ctl
   * @param {typeof SURFACE_ROAD} surf
   */
  step(dt, ctl, surf = SURFACE_ROAD) {
    const s = this.spec;

    // --- Steering wheel: turn in at steerSpeed, self-centre faster.
    const target = clamp(ctl.steer, -1, 1);
    const centring =
      Math.abs(target) < 0.01 || (this.steer !== 0 && Math.sign(target) !== Math.sign(this.steer));
    this.steer = approach(this.steer, target, (centring ? s.steerReturn : s.steerSpeed) * dt);

    // --- Decompose velocity into the car's frame.
    // forward = (sin h, cos h), right = (cos h, -sin h)
    const sinH = Math.sin(this.heading);
    const cosH = Math.cos(this.heading);
    let vF = this.vx * sinH + this.vy * cosH;
    let vR = this.vx * cosH - this.vy * sinH;

    // --- Longitudinal forces.
    let aF = 0;
    let braking = false;
    if (ctl.throttle > 0) {
      if (vF < -0.5) {
        aF += s.brake * ctl.throttle; // throttle while rolling backwards = brake
        braking = true;
      } else {
        const r = clamp(vF / (s.topSpeed * surf.topSpeed), 0, 1);
        aF += s.accel * surf.accel * ctl.throttle * (1 - r * r);
      }
    }
    if (ctl.brake > 0) {
      if (vF > 0.5) {
        aF -= s.brake * surf.brake * ctl.brake;
        braking = true;
      } else {
        // Holding brake when (almost) stopped engages reverse.
        const r = clamp(-vF / s.reverseSpeed, 0, 1);
        aF -= s.accel * 0.6 * ctl.brake * (1 - r);
      }
    }
    if (ctl.handbrake) {
      aF -= Math.sign(vF) * s.brake * 0.3;
      braking = true;
    }
    aF -= Math.sign(vF) * (s.rolling * surf.rolling + s.aero * vF * vF);
    if (ctl.throttle === 0 && ctl.brake === 0) aF -= Math.sign(vF) * s.engineBrake;

    // Drag and brakes may stop the car but never push it backwards.
    const drivingThroughZero =
      (ctl.throttle > 0 && vF >= -0.5) || (ctl.brake > 0 && vF <= 0.5);
    const newVF = vF + aF * dt;
    vF = vF !== 0 && Math.sign(newVF) !== Math.sign(vF) && !drivingThroughZero ? 0 : newVF;

    // --- Steering → yaw. Lock reduces with speed for stability.
    const absVF = Math.abs(vF);
    const wheelAngle = (this.steer * s.maxSteer) / (1 + absVF / s.steerFalloff);
    let yawTarget = (vF * Math.tan(wheelAngle)) / s.wheelbase;
    // Tyres can only provide so much sideways force: cap yaw at a_lat / v.
    let maxYaw = s.maxLatAccel / Math.max(absVF, 1);
    if (ctl.handbrake && absVF > 5) {
      yawTarget *= 1 + s.driftYaw;
      maxYaw *= 1 + s.driftYaw;
    }
    yawTarget = clamp(yawTarget, -maxYaw, maxYaw);
    this.yawRate = approach(this.yawRate, yawTarget, s.yawResponse * dt);
    this.heading += this.yawRate * dt;

    // --- Lateral grip: bleed off sideways sliding.
    const grip = s.grip * surf.grip * (ctl.handbrake ? s.handbrakeGrip : 1);
    vR *= Math.exp(-grip * dt);

    // Rebuild world velocity in the pre-rotation frame; the heading change
    // above becomes lateral slip next step (natural understeer/drift).
    this.vx = sinH * vF + cosH * vR;
    this.vy = cosH * vF - sinH * vR;
    this.x += this.vx * dt;
    this.y += this.vy * dt;

    this.forwardSpeed = vF;
    this.lateralSpeed = vR;
    this.speed = Math.hypot(this.vx, this.vy);
    this.braking = braking;
    this.reversing = vF < -0.3;
    this.drifting = Math.abs(vR) > 2.5 && this.speed > 6;
  }
}
