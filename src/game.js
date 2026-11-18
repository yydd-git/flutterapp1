/**
 * Game orchestrator: owns the main loop and wires the map, roads, physics,
 * traffic, races, rendering, input and UI modules together.
 *
 * Frame order:
 *   1. requestAnimationFrame → fixed-step physics (road constraint and
 *      collisions) → traffic and race AI → camera jumpTo
 *   2. MapLibre renders its frame with that camera
 *   3. on map 'render' → overlay draws vehicles with the same camera
 * So sprites never drift against the map.
 *
 * Modes: null (menu only), 'free' (Free Drive in a city), 'race'.
 */
import { CITIES, CAMERA, PERF } from './config.js';
import { LocalFrame, clamp, lerp, smoothing, wrapAngle } from './core/geo.js';
import { loadSettings, saveSettings } from './core/settings.js';
import { CAR_TYPES } from './cars/carTypes.js';
import { Vehicle } from './physics/vehicle.js';
import { applyRoadConstraint, surfacesFor } from './physics/roadConstraint.js';
import { collidePlayer } from './physics/collide.js';
import { RoadNetwork, roadLabel } from './roads/roadNetwork.js';
import { RoadLoader } from './roads/roadLoader.js';
import { cellsInBox, wayHalfWidth, ROAD_CLASSES } from './roads/overpass.js';
import { waysToFeatures } from './map/gameStyle.js';
import { MapView } from './map/mapView.js';
import { Overlay } from './render/overlay.js';
import { InputManager, isTouchDevice } from './input/input.js';
import { TrafficManager } from './ai/traffic.js';
import { Race } from './race/raceManager.js';
import { routeById, SPRINT_METRES } from './race/routes.js';
import { loadRoute } from './race/routeLoader.js';
import { distM } from './race/routing.js';
import { addTime } from './race/leaderboard.js';
import { Hud } from './ui/hud.js';
import { Menu } from './ui/menu.js';
import { Minimap } from './ui/minimap.js';
import { RaceHud } from './ui/raceHud.js';

const DEG = Math.PI / 180;
const rankOf = (w) => (ROAD_CLASSES[w.t] || ROAD_CLASSES.road).rank;
const labelOf = (w) => (w.r || w.n ? roadLabel({ ref: w.r || '', name: w.n || '' }) : '');
const cityById = (id) => CITIES.find((c) => c.id === id) || CITIES[0];
const DEBUG = /[?&]debug\b/.test(location.search);

/** Road data is requested this far around the car (metres). */
const ROAD_MARGIN = 450;

/** First `metres` of a [lng, lat] polyline (for sprint race lines). */
function cutCoords(coords, metres) {
  const out = [coords[0]];
  let d = 0;
  for (let i = 1; i < coords.length && d < metres; i++) {
    d += distM(...coords[i - 1], ...coords[i]);
    out.push(coords[i]);
  }
  return out;
}

export class Game {
  constructor(el) {
    this.el = el;
    this.settings = loadSettings();
    if (!CAR_TYPES[this.settings.car]) this.settings.car = 'hatchback';
    this.state = 'menu'; // 'menu' | 'loading' | 'driving'
    this.mode = null; // null | 'free' | 'race'
    this.race = null;
    this.damage = 0;
    this.road = { inBounds: false, surface: 'road', way: null, impact: 0 };
    this.loader = new RoadLoader('./roads/');
    this.traffic = new TrafficManager();
    this.roadsGen = 0;
    this.obstacles = [];

    const city = cityById(this.settings.city);
    this.mapView = new MapView(el.map, {
      center: [city.lng, city.lat],
      zoom: CAMERA.zoomStill,
      buildings3d: this.settings.buildings === '3d',
      onFallback: () => this.hud.toast('World tiles unavailable: showing roads only', 5000),
    });
    this.roadFeatures = [];
    this._roadsDirty = false;

    this.input = new InputManager(el.touch);
    this.hud = new Hud(el.hud);
    this.minimap = new Minimap(el.hud);
    this.raceHud = new RaceHud(el.hud);
    this.menu = new Menu(el.menu, el.topbar, this.settings, {
      onStart: () => this.startFree(),
      onResume: () => this.resume(),
      onStartRace: (opts) => this.startRace(opts),
      onSettings: (key) => this.applySettings(key),
      onPause: () => this.pause(),
      onCamera: () => this.cycleCamera(),
      onRespawn: () => this.respawn(),
      isRunning: () => this.mode,
    });

    this.cam = { bearing: city.heading, zoom: CAMERA.zoomStill, pitch: 0, look: 0, screenY: 0.5 };
    this._spawnAt(city);
    this.overlay = new Overlay(el.overlay, this.mapView, this.frame);

    this.applySettings();
    this._bindKeys();
    document.addEventListener('visibilitychange', () => {
      if (document.hidden && this.state === 'driving') this.pause();
    });

    this.mapView.onRender(() => this._draw());
    this.mapView.ready.then(() => el.loading?.remove());
    setTimeout(() => el.loading?.remove(), 6000); // never block on a slow map

    this._acc = 0;
    this._roadTimer = 0;
    this._labelTimer = 0;
    this._last = performance.now();
    requestAnimationFrame((t) => this._tick(t));
  }

  /* ---------------- session control ---------------- */

  /**
   * (Re)create the local frame, road network and player car at a place.
   * @param {{id:string, name:string, lng:number, lat:number, heading:number}} place
   */
  _spawnAt(place) {
    this.city = place;
    this.frame = new LocalFrame(place.lng, place.lat);
    if (this.overlay) this.overlay.frame = this.frame;
    this.roads = new RoadNetwork(this.frame);
    this.traffic.reset(this.roads);
    this.roadsGen++;
    this.roadFeatures = [];
    this._roadsDirty = true;
    this.needsSnap = true;
    this.spawn = { x: 0, y: 0, heading: place.heading * DEG };
    this.player = new Vehicle(CAR_TYPES[this.settings.car], 0, 0, this.spawn.heading);
    this._carChanged();
    this.road.inBounds = false;
    this.road.way = null;
    this._placeText = '';
    this.menu.setPlace(place.name);
    this._requestRoads(0, 0);
  }

  /** Swap the player's car type in place (keeps position and heading). */
  _setCar(id) {
    const p = this.player;
    this.player = new Vehicle(CAR_TYPES[id], p.x, p.y, p.heading);
    this._carChanged();
  }

  _carChanged() {
    const spec = this.player.spec;
    this.surfaces = surfacesFor(spec);
    this.playerColour = spec.colours[this.settings.colour] || spec.colours[0];
    this.damage = 0;
    this.hud.setDamage(0);
  }

  /** Free Drive in the selected city (resumes if already there). */
  startFree() {
    if (this.mode === 'race') this._endRace();
    if (this.mode !== 'free' || this.city.id !== this.settings.city) {
      this._spawnAt(cityById(this.settings.city));
      this.mode = 'free';
    } else if (this.player.spec.id !== this.settings.car) {
      this._setCar(this.settings.car);
    }
    if (this.needsSnap) this.hud.toast('Loading real roads from OpenStreetMap…', 2500);
    this.state = 'driving';
    this.menu.hide();
  }

  resume() {
    if (!this.mode) return this.startFree();
    this.state = 'driving';
    this.menu.hide();
  }

  pause() {
    if (this.state === 'loading') return;
    this.state = 'menu';
    this.menu.show();
  }

  /**
   * Start a race: load the race line, move the world to the start, line
   * up on the grid, wait for local roads, then count down.
   */
  async startRace(opts) {
    const route = routeById(opts.routeId);
    if (!route) return;
    this._endRace();
    this.lastRaceOpts = opts;
    this.state = 'loading';
    this.menu.hide();
    this.raceHud.loading('Loading race route…');
    let data;
    try {
      data = await loadRoute(route, (msg) => this.raceHud.loading(msg));
    } catch (err) {
      console.warn('[race] route failed:', err);
      this.raceHud.loading(null);
      this.state = 'menu';
      this.menu.show();
      this.hud.toast(`Couldn't load this route (${err.message}). Check your connection and try again.`, 6000);
      return;
    }
    const [lng, lat] = data.coords[0];
    const [lng2, lat2] = data.coords[Math.min(3, data.coords.length - 1)];
    const heading = Math.atan2((lng2 - lng) * Math.cos(lat * DEG), lat2 - lat) / DEG;
    this._spawnAt({ id: `race:${route.id}`, name: route.name, lng, lat, heading });
    this.needsSnap = false;
    this.race = new Race({
      route,
      data,
      frame: this.frame,
      variant: opts.variant,
      laps: opts.laps,
      opponents: opts.opponents,
      playerCar: this.settings.car,
    });
    const g = this.race.playerGrid();
    this.player.reset(g.x, g.y, g.heading);
    this.cam.bearing = g.heading / DEG;
    this._gridWait = 0;
    this.mapView.setRoute(route.kind === 'p2p' && opts.variant === 'sprint' ? cutCoords(data.coords, SPRINT_METRES + 50) : data.coords);
    this.mode = 'race';
    this.raceHud.loading(null);
    this.state = 'driving';
  }

  _endRace() {
    if (!this.race) return;
    this.race = null;
    this.mapView.setRoute(null);
    this.raceHud.hide();
    if (this.mode === 'race') this.mode = null;
  }

  _onRaceFinish() {
    const race = this.race;
    const spec = this.player.spec;
    const rank = addTime(race.board, { time: race.finishTime, car: spec.id, carName: spec.name, opponents: race.racers.length });
    setTimeout(() => {
      if (this.race !== race) return;
      this.raceHud.showResults(race, rank, {
        onRetry: () => this.startRace(this.lastRaceOpts),
        onExit: () => {
          this._endRace();
          this.state = 'menu';
          this.menu.show();
        },
      });
    }, 1800);
  }

  /** Put the car back on the road: the race line in races, else the nearest road. */
  respawn() {
    const p = this.player;
    let target;
    if (this.race) {
      target = this.race.respawnPoint();
    } else {
      target = this.roads.findSpawn(p.x, p.y, p.heading, 300) || this.roads.findSpawn(p.x, p.y, p.heading, 2000) || this.spawn;
    }
    p.reset(target.x, target.y, target.heading);
    this.road.inBounds = false; // re-arm walls once back on the tarmac
    this.cam.bearing = target.heading / DEG;
  }

  cycleCamera() {
    const keys = Object.keys(CAMERA.modes);
    this.settings.camera = keys[(keys.indexOf(this.settings.camera) + 1) % keys.length];
    saveSettings(this.settings);
    this.menu.refreshSetting('camera');
    this.hud.toast(`Camera: ${CAMERA.modes[this.settings.camera].label}`, 1200);
  }

  /** Apply settings after a change in the menu (key = what changed). */
  async applySettings(key) {
    const s = this.settings;
    if (key === 'steering' || key === undefined) {
      const ok = await this.input.setSteeringMode(s.steering);
      if (!ok) {
        s.steering = 'buttons';
        this.menu.refreshSetting('steering');
        if (key) this.hud.toast('Tilt not available on this device');
      }
    }
    this.input.tilt.invert = s.invertTilt;
    if (key === 'buildings') this.mapView.setBuildings3d(s.buildings === '3d');
    if (key === 'traffic' || key === undefined) this.traffic.setDensity(s.traffic);
    const touch = s.showTouch === 'on' || (s.showTouch === 'auto' && isTouchDevice());
    this.input.touch.setVisible(touch);
    this.el.root.classList.toggle('has-touch', touch);

    // Preview the chosen city / car / colour behind the menu before driving.
    if (key === 'city' && !this.mode && this.city.id !== s.city) {
      this._spawnAt(cityById(s.city));
      this.cam.bearing = this.city.heading;
    }
    if (key === 'car' && !this.mode) this._setCar(s.car);
    if (key === 'colour' && this.player.spec.id === s.car) {
      const spec = this.player.spec;
      this.playerColour = spec.colours[s.colour] || spec.colours[0];
    }
    saveSettings(s);
  }

  _bindKeys() {
    window.addEventListener('keydown', (e) => {
      if (e.repeat) return;
      if (e.code === 'Escape' || e.code === 'KeyP') {
        if (this.state === 'driving') this.pause();
        else if (this.state === 'menu') this.resume();
      } else if (this.state === 'driving') {
        if (e.code === 'KeyC') this.cycleCamera();
        else if (e.code === 'KeyR') this.respawn();
      } else if (e.code === 'Enter' && !this.el.menu.hidden && this.state === 'menu') {
        this.resume();
      }
    });
  }

  /* ---------------- roads ---------------- */

  /** Ask the loader for every cell within ROAD_MARGIN of (x, y). */
  _requestRoads(x, y) {
    const sw = this.frame.toLngLat(x - ROAD_MARGIN, y - ROAD_MARGIN, [0, 0]);
    const ne = this.frame.toLngLat(x + ROAD_MARGIN, y + ROAD_MARGIN, [0, 0]);
    const gen = this.roadsGen;
    for (const key of cellsInBox(sw[0], sw[1], ne[0], ne[1])) {
      if (this.roads.loadedCells.has(key) || this.loader.isPending(key) || this.loader.isBackingOff(key)) continue;
      this.loader.load(key).then((ways) => {
        if (gen !== this.roadsGen || !ways) return; // place changed meanwhile
        const added = this.roads.addWays(ways);
        this.roadFeatures.push(...waysToFeatures(added, wayHalfWidth, rankOf, labelOf));
        this._roadsDirty = true;
        this.roads.markLoaded(key);
        this._onRoadsLoaded();
      });
    }
  }

  /** Snap the Free Drive spawn to a real road once the start area loads. */
  _onRoadsLoaded() {
    if (!this.needsSnap) return;
    const p = this.player;
    if (Math.hypot(p.x - this.spawn.x, p.y - this.spawn.y) > 25 || p.speed > 3) {
      this.needsSnap = false; // player already drove off; don't teleport
      return;
    }
    const sp = this.roads.findSpawn(0, 0, this.city.heading * DEG, 800);
    if (!sp) return; // wait for more cells
    this.needsSnap = false;
    this.spawn = sp;
    p.reset(sp.x, sp.y, sp.heading);
    this.road.inBounds = true;
    this.cam.bearing = sp.heading / DEG;
  }

  /* ---------------- main loop ---------------- */

  _tick(now) {
    const dt = Math.min((now - this._last) / 1000, 0.1);
    this._last = now;
    const p = this.player;
    const race = this.race;

    if (this.state === 'driving') {
      // Everything that can be hit or must be avoided this frame
      const obs = this.obstacles;
      obs.length = 0;
      obs.push(p);
      for (const a of this.traffic.agents) if (a.active) obs.push(a);
      if (race) for (const r of race.racers) obs.push(r);

      const ctl = this.input.read();
      if (race?.locked) {
        ctl.throttle = 0;
        ctl.brake = 0;
      } else if (race?.state === 'finished') {
        ctl.throttle = 0;
        ctl.brake = 0.4;
      }

      const step = 1 / PERF.physicsHz;
      const opts = { walls: this.settings.boundaries !== 'free', loaded: this.roads.isLoadedAt(p.x, p.y) };
      this._acc += dt;
      let n = 0;
      let impact = 0;
      while (this._acc >= step && n++ < PERF.maxStepsPerFrame) {
        p.step(step, ctl, this.surfaces[this.road.surface]);
        applyRoadConstraint(p, this.roads, this.road, opts);
        impact = Math.max(impact, this.road.impact);
        for (let i = 1; i < obs.length; i++) impact = Math.max(impact, collidePlayer(p, obs[i]));
        this._acc -= step;
      }
      if (n >= PERF.maxStepsPerFrame) this._acc = 0; // tab was frozen
      if (impact > 3) this._hurt(impact);
      this.hud.update(p);

      this.traffic.update(dt, p, race ? [p, ...race.racers] : [p]);

      if (race) {
        if (race.state === 'grid') {
          // Wait for the local roads so walls work from the start
          this._gridWait += dt;
          if (this.roads.isLoadedAt(p.x, p.y) || this._gridWait > 8) race.beginCountdown();
        }
        for (const ev of race.update(dt, p, obs)) {
          if (ev === 'checkpoint') this.hud.toast(`Checkpoint ${race.nextCp}/${race.checkpoints.length}`, 1100);
          else if (ev === 'lap') this.hud.toast(`Lap ${race.displayLap}/${race.laps}`, 1500);
          else if (ev === 'finish') this._onRaceFinish();
        }
        this.raceHud.update(race);
      }
    }

    // Keep road data flowing around the car (cheap: mostly cache hits).
    if ((this._roadTimer -= dt) <= 0) {
      this._roadTimer = 0.5;
      this._requestRoads(p.x, p.y);
      if (this._roadsDirty) {
        this._roadsDirty = false;
        this.mapView.setRoads(this.roadFeatures);
      }
      // Generic tile roads only where real road data hasn't arrived yet.
      this.mapView.setTileRoadsVisible(!this.roads.isLoadedAt(p.x, p.y));
    }
    if ((this._labelTimer -= dt) <= 0) {
      this._labelTimer = 0.3;
      this._updatePlace();
    }
    this.minimap.setVisible(this.state === 'driving');
    this.minimap.update(dt, { player: p, roads: this.roads, race, traffic: this.traffic.agents });

    this._updateCamera(dt);
    this.mapView.repaint();
    requestAnimationFrame((t) => this._tick(t));
  }

  /** Impact damage. Fragile cars break down sooner. */
  _hurt(impact) {
    this.damage = Math.min(100, this.damage + (impact - 3) * 5 * this.player.spec.fragility);
    this.hud.setDamage(this.damage);
    if (navigator.vibrate && impact > 6) navigator.vibrate(Math.min(120, impact * 8));
    if (this.damage >= 100) {
      this.hud.toast('Your car broke down! Towed back to the road.', 3000);
      this.damage = 0;
      this.hud.setDamage(0);
      this.respawn();
    }
  }

  _updatePlace() {
    if (this.state !== 'driving') return;
    const p = this.player;
    let text;
    if (!this.roads.isLoadedAt(p.x, p.y)) text = 'Loading roads…';
    else if (this.road.surface === 'offroad') text = 'Off-road';
    else text = roadLabel(this.road.way) || this.city.name;
    if (text !== this._placeText) {
      this._placeText = text;
      this.menu.setPlace(text);
    }
  }

  _updateCamera(dt) {
    const car = this.player;
    const mode = CAMERA.modes[this.settings.camera] || CAMERA.modes.chase;
    const cam = this.cam;
    const menu = this.state !== 'driving';

    // Bearing: follow heading (heading-up) or stay north. In the menu,
    // slowly orbit the parked car as an attract screen.
    let targetBearing = mode.headingUp ? car.heading / DEG : 0;
    if (menu) targetBearing = cam.bearing + 6 * dt;
    const diff = wrapAngle((targetBearing - cam.bearing) * DEG) / DEG;
    cam.bearing += menu ? diff : diff * smoothing(CAMERA.bearingFollow, dt);

    const speed = Math.abs(car.forwardSpeed);
    const t = clamp(speed / CAMERA.zoomSpeedRef, 0, 1);
    const screenAdj = clamp(Math.log2(window.innerHeight / CAMERA.refViewportHeight), -0.5, 1.2);
    const targetZoom = screenAdj + (menu ? CAMERA.zoomStill - 0.6 : lerp(CAMERA.zoomStill, CAMERA.zoomFast, t));
    cam.zoom += (targetZoom - cam.zoom) * smoothing(2, dt);
    cam.pitch += ((menu ? 45 : mode.pitch) - cam.pitch) * smoothing(4, dt);

    // Look ahead in the direction of travel so you see what's coming.
    const targetLook = menu ? 0 : CAMERA.lookAheadBase + CAMERA.lookAheadPerMps * speed;
    cam.look += (targetLook - cam.look) * smoothing(3, dt);
    const dir = car.forwardSpeed < -0.5 ? -1 : 1;
    const cx = car.x + Math.sin(car.heading) * cam.look * dir;
    const cy = car.y + Math.cos(car.heading) * cam.look * dir;
    const screenY = mode.headingUp && !menu ? CAMERA.carScreenY : 0.5;
    cam.screenY += (screenY - cam.screenY) * smoothing(3, dt);
    this.mapView.setCamera(this.frame.toLngLat(cx, cy), cam.bearing, cam.zoom, cam.pitch, cam.screenY);
  }

  _draw() {
    const o = this.overlay;
    const p = this.player;
    const view = { viewX: p.x, viewY: p.y, viewHeading: this.cam.bearing * DEG };
    o.clear();
    if (DEBUG) o.drawRoads(this.roads, p.x, p.y, view.viewHeading, true);

    const race = this.race;
    if (race && race.nextCp < race.checkpoints.length && race.state !== 'finished') {
      const cp = race.checkpointPoint(race.nextCp);
      if (Math.hypot(cp.x - p.x, cp.y - p.y) < 300) {
        const hit = this.roads.query(cp.x, cp.y, 30);
        const half = hit.found ? Math.max(hit.way.half, 4) : 6;
        o.drawGate(cp.x, cp.y, cp.heading, half, { ...view, finish: race.nextCp === race.checkpoints.length - 1 });
      }
    }
    // Cull anything far away or behind the camera (it would project wildly).
    const fx = Math.sin(view.viewHeading), fy = Math.cos(view.viewHeading);
    const visible = (v) => {
      const dx = v.x - p.x, dy = v.y - p.y;
      return dx * dx + dy * dy < 220 * 220 && dx * fx + dy * fy > -45;
    };
    for (const a of this.traffic.agents) if (a.active && visible(a)) o.drawCar(a, a.colour);
    if (race) for (const r of race.racers) if (visible(r)) o.drawCar(r, r.colour);
    o.drawCar(p, this.playerColour);
  }
}
