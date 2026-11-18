/**
 * Game orchestrator: owns the main loop and wires the map, physics,
 * rendering, input and UI modules together.
 *
 * Frame order:
 *   1. requestAnimationFrame → fixed-step physics → camera jumpTo
 *   2. MapLibre renders its frame with that camera
 *   3. on map 'render' → overlay draws vehicles with the same camera
 * So sprites never drift against the map tiles.
 */
import { CITIES, CAMERA, PERF } from './config.js';
import { LocalFrame, clamp, lerp, smoothing, wrapAngle } from './core/geo.js';
import { loadSettings, saveSettings } from './core/settings.js';
import { CAR_TYPES } from './cars/carTypes.js';
import { Vehicle } from './physics/vehicle.js';
import { MapView } from './map/mapView.js';
import { Overlay } from './render/overlay.js';
import { InputManager, isTouchDevice } from './input/input.js';
import { Hud } from './ui/hud.js';
import { Menu } from './ui/menu.js';

const DEG = Math.PI / 180;
const cityById = (id) => CITIES.find((c) => c.id === id) || CITIES[0];

export class Game {
  constructor(el) {
    this.el = el;
    this.settings = loadSettings();
    this.state = 'menu'; // 'menu' | 'driving'
    this.running = false; // a drive session exists (for Resume)

    const city = cityById(this.settings.city);
    this.mapView = new MapView(el.map, {
      center: [city.lng, city.lat],
      zoom: CAMERA.zoomStill,
      onFallback: () => this.hud.toast('Map tiles unavailable: offline grid mode', 5000),
    });

    this.input = new InputManager(el.touch);
    this.hud = new Hud(el.hud);
    this.menu = new Menu(el.menu, el.topbar, this.settings, {
      onStart: () => this.start(),
      onSettings: (key) => this.applySettings(key),
      onPause: () => this.pause(),
      onCamera: () => this.cycleCamera(),
      onRespawn: () => this.respawn(),
      isRunning: () => this.running,
    });

    this._spawnAt(city);
    this.overlay = new Overlay(el.overlay, this.mapView, this.frame);
    this.cam = { bearing: city.heading, zoom: CAMERA.zoomStill, pitch: 0, look: CAMERA.lookAheadBase };

    this.applySettings();
    this._bindKeys();
    document.addEventListener('visibilitychange', () => {
      if (document.hidden && this.state === 'driving') this.pause();
    });

    this.mapView.onRender(() => this._draw());
    this.mapView.ready.then(() => el.loading?.remove());
    // Don't hold the menu hostage if the map is slow; it keeps loading.
    setTimeout(() => el.loading?.remove(), 6000);

    this._acc = 0;
    this._last = performance.now();
    requestAnimationFrame((t) => this._tick(t));
  }

  /* ---------------- session control ---------------- */

  /** (Re)create the local frame and player car at a city. */
  _spawnAt(city) {
    this.city = city;
    this.frame = new LocalFrame(city.lng, city.lat);
    if (this.overlay) this.overlay.frame = this.frame;
    const spec = CAR_TYPES[this.settings.car] || CAR_TYPES.hatchback;
    this.player = new Vehicle(spec, 0, 0, city.heading * DEG);
    this.playerColour = spec.colours[this.settings.colour] || spec.colours[0];
    this.menu.setPlace(`${city.name} · Free Drive`);
  }

  start() {
    if (!this.running || this.city.id !== this.settings.city) {
      this._spawnAt(cityById(this.settings.city));
      this.running = true;
    }
    this.state = 'driving';
    this.menu.hide();
  }

  pause() {
    this.state = 'menu';
    this.menu.show();
  }

  respawn() {
    this.player.reset(0, 0, this.city.heading * DEG);
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
    const touch = s.showTouch === 'on' || (s.showTouch === 'auto' && isTouchDevice());
    this.input.touch.setVisible(touch);
    this.el.root.classList.toggle('has-touch', touch);

    // Recolour the parked car straight away.
    const spec = this.player?.spec;
    if (spec) this.playerColour = spec.colours[s.colour] || spec.colours[0];

    // Preview the chosen city behind the menu before driving.
    if (key === undefined || (!this.running && this.city.id !== s.city)) {
      this._spawnAt(cityById(s.city));
      this.cam.bearing = this.city.heading;
    }
    saveSettings(s);
  }

  _bindKeys() {
    window.addEventListener('keydown', (e) => {
      if (e.repeat) return;
      if (e.code === 'Escape' || e.code === 'KeyP') {
        if (this.state === 'driving') this.pause();
        else this.start();
      } else if (this.state === 'driving') {
        if (e.code === 'KeyC') this.cycleCamera();
        else if (e.code === 'KeyR') this.respawn();
      } else if (e.code === 'Enter' && !this.el.menu.hidden) {
        this.start();
      }
    });
  }

  /* ---------------- main loop ---------------- */

  _tick(now) {
    const dt = Math.min((now - this._last) / 1000, 0.1);
    this._last = now;

    if (this.state === 'driving') {
      // Fixed-step physics: stable handling at 30, 60 or 120 Hz displays.
      const step = 1 / PERF.physicsHz;
      this._acc += dt;
      let n = 0;
      const ctl = this.input.read();
      while (this._acc >= step && n++ < PERF.maxStepsPerFrame) {
        this.player.step(step, ctl);
        this._acc -= step;
      }
      if (n >= PERF.maxStepsPerFrame) this._acc = 0; // tab was frozen
      this.hud.update(this.player);
    }

    this._updateCamera(dt);
    this.mapView.repaint();
    requestAnimationFrame((t) => this._tick(t));
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
    cam.screenY = (cam.screenY ?? 0.5) + (screenY - (cam.screenY ?? 0.5)) * smoothing(3, dt);
    this.mapView.setCamera(this.frame.toLngLat(cx, cy), cam.bearing, cam.zoom, cam.pitch, cam.screenY);
  }

  _draw() {
    const o = this.overlay;
    o.clear();
    if (this.mapView.fallback) o.drawGrid(this.player.x, this.player.y);
    o.drawCar(this.player, this.playerColour);
  }
}
