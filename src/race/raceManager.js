/**
 * One race: grid → countdown → racing → finished.
 *
 * Progress is measured as distance along the race line (laps included).
 * The player's position on the line is found with a windowed projection
 * (RoutePath.project), so you can't skip checkpoints by cutting across.
 * Checkpoints are evenly spaced gates, and the last is the finish line.
 */
import { RoutePath, STEP } from './routePath.js';
import { SPRINT_METRES } from './routes.js';
import { Racer } from '../ai/racers.js';
import { CAR_TYPES, CAR_ORDER } from '../cars/carTypes.js';
import { clamp } from '../core/geo.js';

const NAMES = ['Arjun', 'Priya', 'Kabir', 'Meera', 'Rohan', 'Sana', 'Vikram', 'Anjali'];
const GRID_S = [26, 26, 17, 17];
const LANES = [2.0, -1.2, -1.2, 2.0];
export const COUNTDOWN = 3;

export class Race {
  /**
   * @param {object} o
   * @param {object} o.route     route definition (routes.js)
   * @param {{coords:number[][], length:number}} o.data race line
   * @param {import('../core/geo.js').LocalFrame} o.frame
   * @param {'sprint'|'full'} o.variant  point-to-point length
   * @param {number} o.laps      circuit laps
   * @param {number} o.opponents 0 = time trial
   * @param {string} o.playerCar car id
   */
  constructor({ route, data, frame, variant = 'full', laps = 3, opponents = 3, playerCar }) {
    this.route = route;
    this.closed = route.kind === 'circuit';
    this.path = new RoutePath(data.coords, frame, {
      closed: this.closed,
      cutAt: !this.closed && variant === 'sprint' ? SPRINT_METRES : Infinity,
    });
    this.laps = this.closed ? laps : 1;
    this.lapLen = this.path.length;
    this.totalLen = this.lapLen * this.laps;
    this.board = this.closed ? `${route.id}:laps${laps}` : `${route.id}:${variant}`;
    this.variant = variant;
    this.opponents = opponents;
    this.playerCar = playerCar;

    // Evenly spaced checkpoints; the last one is the finish.
    const spacing = this.closed ? Math.max(250, this.lapLen / 4) : clamp(this.totalLen / 10, 400, 2500);
    this.checkpoints = [];
    for (let d = spacing; d < this.totalLen - spacing * 0.4; d += spacing) this.checkpoints.push(d);
    this.checkpoints.push(this.totalLen);

    this.state = 'grid'; // 'grid' | 'countdown' | 'racing' | 'finished'
    this.countdown = COUNTDOWN;
    this.elapsed = 0;
    this.nextCp = 0;
    this.lap = 0;
    this.lapStart = 0;
    this.lapTimes = [];
    this.splits = [];
    this.offRoute = false;
    this.finishTime = Infinity;
    this.results = null;

    // Player starts at the back of the grid, left lane.
    const slot = Math.min(opponents, 3);
    this.playerS = GRID_S[slot];
    this._hint = Math.floor(this.playerS / STEP);
    this._rawS = this.playerS;
    this.playerLane = LANES[slot];

    const others = CAR_ORDER.filter((id) => id !== playerCar);
    this.racers = [];
    for (let i = 0; i < opponents; i++) {
      const spec = CAR_TYPES[others[i % others.length]];
      this.racers.push(new Racer({
        spec,
        colour: spec.colours[(1 + i * 2) % spec.colours.length],
        name: NAMES[(i + Math.floor(Math.random() * NAMES.length)) % NAMES.length],
        s: GRID_S[i],
        lane: LANES[i],
        skill: 0.9 + Math.random() * 0.08,
      }));
    }
    for (const r of this.racers) r.place(this.path);
  }

  /** Where the player lines up: { x, y, heading }. */
  playerGrid() {
    const p = this.path.pointAt(this.playerS);
    return { x: p.x - Math.cos(p.heading) * this.playerLane, y: p.y + Math.sin(p.heading) * this.playerLane, heading: p.heading };
  }

  /** Respawn point on the line at the player's current progress. */
  respawnPoint() {
    const p = this.path.pointAt(this._rawS);
    return { x: p.x - Math.cos(p.heading) * 2, y: p.y + Math.sin(p.heading) * 2, heading: p.heading };
  }

  get locked() {
    return this.state === 'grid' || this.state === 'countdown';
  }

  beginCountdown() {
    if (this.state === 'grid') this.state = 'countdown';
  }

  /**
   * @param {number} dt
   * @param {import('../physics/vehicle.js').Vehicle} player
   * @param {object[]} obstacles traffic + player, for the AI
   * @returns {string[]} events this frame: 'go', 'checkpoint', 'lap', 'finish'
   */
  update(dt, player, obstacles) {
    const events = [];
    if (this.state === 'countdown') {
      this.countdown -= dt;
      if (this.countdown <= 0) {
        this.state = 'racing';
        events.push('go');
      }
    }
    const racing = this.state === 'racing' || this.state === 'finished';
    if (this.state === 'racing') this.elapsed += dt;

    // --- Player progress
    // Heading breaks ties where the line doubles back; ignore it when
    // reversing or spinning slowly (the car may face any way).
    const fwd = player.forwardSpeed ?? 1;
    const heading = player.heading !== undefined && fwd > 1 ? player.heading : null;
    const proj = this.path.project(player.x, player.y, this._hint, 30, 90, heading);
    this.offRoute = proj.dist > 45;
    if (!this.offRoute) {
      let s = proj.s;
      if (this.closed) {
        const prev = this._rawS - this.lap * this.lapLen;
        if (s - prev < -this.lapLen / 2) this.lap++;
        else if (s - prev > this.lapLen / 2) this.lap--;
        s += this.lap * this.lapLen;
      }
      this._rawS = s;
      this._hint = proj.idx;
    }
    this.playerS = this._rawS;

    if (this.state === 'racing') {
      while (this.nextCp < this.checkpoints.length && this.playerS >= this.checkpoints[this.nextCp]) {
        this.splits.push(this.elapsed);
        this.nextCp++;
        if (this.nextCp === this.checkpoints.length) {
          this._finish();
          events.push('finish');
          break;
        }
        events.push('checkpoint');
      }
      // Lap timing on circuits
      const lapsDone = Math.floor(this.playerS / this.lapLen);
      if (this.closed && lapsDone > this.lapTimes.length && lapsDone <= this.laps) {
        this.lapTimes.push(this.elapsed - this.lapStart);
        this.lapStart = this.elapsed;
        if (lapsDone < this.laps) events.push('lap');
      }
    }

    // --- AI
    if (racing) {
      for (const r of this.racers) {
        const wasFinished = r.finished;
        r.update(dt, this.path, obstacles, this.playerS, this.totalLen);
        if (r.finished && !wasFinished) r.finishTime = this.elapsed;
      }
    }
    return events;
  }

  /** 1-based race position of the player. */
  get position() {
    if (this.state === 'finished') return this.results.find((r) => r.player).pos;
    let pos = 1;
    for (const r of this.racers) if (r.finished || r.s > this.playerS) pos++;
    return pos;
  }

  /** Current lap (1-based) for display. */
  get displayLap() {
    return clamp(Math.floor(this.playerS / this.lapLen) + 1, 1, this.laps);
  }

  /** Next checkpoint's position on the line (for gates and the mini-map). */
  checkpointPoint(i) {
    const d = this.checkpoints[i];
    return this.path.pointAt(this.closed ? d % this.lapLen : d);
  }

  _finish() {
    this.state = 'finished';
    this.finishTime = this.elapsed;
    const avg = (r) => Math.max(5, r.s / Math.max(1, this.elapsed));
    const rows = [
      { name: 'You', car: CAR_TYPES[this.playerCar].name, time: this.finishTime, player: true },
      ...this.racers.map((r) => ({
        name: r.name,
        car: r.spec.name,
        // Unfinished opponents: estimate from their average speed so far
        time: r.finished ? r.finishTime : this.elapsed + (this.totalLen - r.s) / avg(r),
        estimated: !r.finished,
      })),
    ];
    rows.sort((a, b) => a.time - b.time);
    rows.forEach((r, i) => (r.pos = i + 1));
    this.results = rows;
  }
}
