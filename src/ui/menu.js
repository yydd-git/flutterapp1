/**
 * Start menu, settings panel and in-game top bar.
 * Plain DOM, no framework; it talks to the game through callbacks only.
 */
import { CITIES, CAMERA } from '../config.js';
import { CAR_TYPES, CAR_ORDER, carRatings } from '../cars/carTypes.js';
import { getCarSprite } from '../cars/sprites.js';
import { ROUTES, SPRINT_METRES, routeById } from '../race/routes.js';
import { topTimes, formatTime } from '../race/leaderboard.js';
import { TiltInput } from '../input/tilt.js';

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

export class Menu {
  /**
   * @param {HTMLElement} root   overlay container for menu screens
   * @param {HTMLElement} topbar in-game button bar
   * @param {object} settings    mutable settings object
   * @param {{onStart:Function, onSettings:Function, onPause:Function, onResume:Function, onRespawn:Function}} cb
   */
  constructor(root, topbar, settings, cb) {
    this.root = root;
    this.topbar = topbar;
    this.settings = settings;
    this.cb = cb;
    this._renderStart();
    this._renderTopbar();
  }

  /* ---------------- start screen ---------------- */

  _renderStart() {
    const s = this.settings;
    this.root.innerHTML = `
      <div class="panel start">
        <h1>Chhattisgarh <span>Road Rally</span></h1>
        <p class="tag">Drive real OpenStreetMap roads, from Raipur to Bastar.</p>

        <h2>Start city</h2>
        <div class="choices cities">
          ${CITIES.map((c) => `
            <button class="choice ${c.id === s.city ? 'sel' : ''}" data-city="${c.id}">
              ${esc(c.name)}<small>${esc(c.hindi)}</small>
            </button>`).join('')}
        </div>

        <h2>Car</h2>
        <div class="cars">
          ${CAR_ORDER.map((id) => `
            <button class="car-card ${id === s.car ? 'sel' : ''}" data-car="${id}" aria-label="${esc(CAR_TYPES[id].name)}">
              <canvas width="52" height="124"></canvas>${esc(CAR_TYPES[id].name)}
            </button>`).join('')}
        </div>
        <div class="car-detail"></div>

        <div class="modes">
          <button class="go resume" data-mode="resume" hidden>Resume</button>
          <button class="go" data-mode="free">Free Drive</button>
          <button class="go" data-mode="race">Race</button>
        </div>
        <button class="link" data-open="settings">⚙ Controls &amp; settings</button>
      </div>
      <div class="panel settings" hidden></div>
      <div class="panel race" hidden></div>`;

    this.root.querySelectorAll('[data-city]').forEach((b) =>
      b.addEventListener('click', () => {
        s.city = b.dataset.city;
        this._select(b, '[data-city]');
        this.cb.onSettings('city');
      })
    );
    this.root.querySelectorAll('[data-car]').forEach((b) =>
      b.addEventListener('click', () => {
        s.car = b.dataset.car;
        this._select(b, '[data-car]');
        this._renderCarDetail();
        this._drawCarIcons();
        this.cb.onSettings('car');
      })
    );
    this._renderCarDetail();
    this._drawCarIcons();
    this.root.querySelector('[data-mode="free"]').addEventListener('click', () => this.cb.onStart('free'));
    this.root.querySelector('[data-mode="resume"]').addEventListener('click', () => this.cb.onResume());
    this.root.querySelector('[data-mode="race"]').addEventListener('click', () => this.showRace());
    this.root.querySelector('[data-open="settings"]').addEventListener('click', () => this.showSettings());
  }

  /** Small sprite previews on each car card, in the chosen colour. */
  _drawCarIcons() {
    this.root.querySelectorAll('[data-car]').forEach((b) => {
      const spec = CAR_TYPES[b.dataset.car];
      const colour = spec.colours[b.dataset.car === this.settings.car ? this.settings.colour : 0] || spec.colours[0];
      const sprite = getCarSprite(spec, colour);
      const cv = b.querySelector('canvas');
      const ctx = cv.getContext('2d');
      ctx.clearRect(0, 0, cv.width, cv.height);
      // Fit the sprite (metres) into the card canvas, all cars at one scale.
      const scale = cv.height / 4.6;
      const w = sprite.w * scale, h = sprite.h * scale;
      ctx.drawImage(sprite.canvas, (cv.width - w) / 2, (cv.height - h) / 2, w, h);
    });
  }

  /** Blurb, stat bars and colour swatches for the selected car. */
  _renderCarDetail() {
    const s = this.settings;
    const car = CAR_TYPES[s.car];
    if (s.colour >= car.colours.length) s.colour = 0;
    const box = this.root.querySelector('.car-detail');
    box.innerHTML = `
      <div><b>${esc(car.name)}</b><p class="blurb">${esc(car.blurb)}</p></div>
      <div class="swatches">
        ${car.colours.map((col, i) => `
          <button class="swatch ${i === s.colour ? 'sel' : ''}" data-colour="${i}"
            style="background:${col}" aria-label="Colour ${i + 1}"></button>`).join('')}
      </div>
      <div class="stats">
        ${Object.entries(carRatings(car)).map(([k, v]) =>
          `<span>${k}</span><span class="bar"><i style="width:${Math.round(v * 100)}%"></i></span>`).join('')}
      </div>`;
    box.querySelectorAll('[data-colour]').forEach((b) =>
      b.addEventListener('click', () => {
        s.colour = Number(b.dataset.colour);
        box.querySelectorAll('[data-colour]').forEach((x) => x.classList.toggle('sel', x === b));
        this._drawCarIcons();
        this.cb.onSettings('colour');
      })
    );
  }

  _select(btn, selector) {
    this.root.querySelectorAll(selector).forEach((x) => x.classList.toggle('sel', x === btn));
  }

  /* ---------------- settings ---------------- */

  showSettings() {
    const s = this.settings;
    const panel = this.root.querySelector('.settings');
    const opt = (name, value, label, extra = '') =>
      `<button class="choice ${s[name] === value ? 'sel' : ''}" data-set="${name}" data-val="${value}" ${extra}>${label}</button>`;
    panel.innerHTML = `
      <h2>Steering</h2>
      <div class="choices">
        ${opt('steering', 'buttons', '◀ ▶ Buttons')}
        ${opt('steering', 'joystick', '⇆ Slide stick')}
        ${opt('steering', 'tilt', '📱 Tilt', TiltInput.supported ? '' : 'disabled')}
      </div>
      <h2>Camera</h2>
      <div class="choices">
        ${Object.entries(CAMERA.modes).map(([k, m]) => opt('camera', k, m.label)).join('')}
      </div>
      <h2>On-screen controls</h2>
      <div class="choices">
        ${opt('showTouch', 'auto', 'Auto')}${opt('showTouch', 'on', 'Always')}${opt('showTouch', 'off', 'Hidden')}
      </div>
      <h2>Traffic</h2>
      <div class="choices">
        ${opt('traffic', 'off', 'Empty roads')}${opt('traffic', 'normal', 'Normal')}${opt('traffic', 'busy', 'Busy bazaar')}
      </div>
      <h2>Buildings</h2>
      <div class="choices">
        ${opt('buildings', 'flat', 'Flat roofs (fastest)')}${opt('buildings', '3d', '3D blocks')}
      </div>
      <h2>Road edges</h2>
      <div class="choices">
        ${opt('boundaries', 'walls', 'Stay near roads')}${opt('boundaries', 'free', 'Drive anywhere')}
      </div>
      <label class="check"><input type="checkbox" data-check="invertTilt" ${s.invertTilt ? 'checked' : ''}> Invert tilt</label>
      <p class="keys">Keyboard: <kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> / arrows to drive,
        <kbd>Space</kbd> drift, <kbd>C</kbd> camera, <kbd>R</kbd> respawn, <kbd>Esc</kbd> pause.</p>
      <button class="go" data-close>Done</button>`;
    panel.hidden = false;
    this.root.querySelector('.start').hidden = true;

    panel.querySelectorAll('[data-set]').forEach((b) =>
      b.addEventListener('click', async () => {
        const { set, val } = b.dataset;
        s[set] = val;
        panel.querySelectorAll(`[data-set="${set}"]`).forEach((x) => x.classList.toggle('sel', x === b));
        await this.cb.onSettings(set);
      })
    );
    panel.querySelector('[data-check]').addEventListener('change', (e) => {
      s.invertTilt = e.target.checked;
      this.cb.onSettings('invertTilt');
    });
    panel.querySelector('[data-close]').addEventListener('click', () => {
      panel.hidden = true;
      this.root.querySelector('.start').hidden = false;
    });
  }

  /* ---------------- race setup ---------------- */

  showRace() {
    const s = this.settings;
    const panel = this.root.querySelector('.race');
    const route = routeById(s.raceRoute) || ROUTES[0];
    s.raceRoute = route.id;
    const circuit = route.kind === 'circuit';
    const board = circuit ? `${route.id}:laps${s.raceLaps}` : `${route.id}:${s.raceVariant}`;
    const best = topTimes(board, 3);
    const opt = (name, value, label) =>
      `<button class="choice ${String(s[name]) === String(value) ? 'sel' : ''}" data-rset="${name}" data-val="${value}">${label}</button>`;
    panel.innerHTML = `
      <h2>Route</h2>
      <div class="routes">
        ${ROUTES.map((r) => `
          <button class="route-card ${r.id === route.id ? 'sel' : ''}" data-route="${r.id}">
            <b>${esc(r.name)}</b><small>${esc(r.sub)}</small>
            <span class="km">${r.kind === 'circuit' ? `~${r.approxKm} km lap` : `~${r.approxKm} km`}</span>
          </button>`).join('')}
      </div>
      <div class="race-opts">
        <div>
          <h2>${circuit ? 'Laps' : 'Length'}</h2>
          <div class="choices">
            ${circuit
              ? [2, 3, 5].map((n) => opt('raceLaps', n, `${n} laps`)).join('')
              : opt('raceVariant', 'sprint', `Sprint · ${SPRINT_METRES / 1000} km`) + opt('raceVariant', 'full', 'Full route')}
          </div>
        </div>
        <div>
          <h2>Opponents</h2>
          <div class="choices">${opt('raceOpponents', 3, '3 AI racers')}${opt('raceOpponents', 0, 'Time trial')}</div>
        </div>
      </div>
      <h2>Best times</h2>
      <ol class="best">${best.map((b) => `<li>${formatTime(b.time)} <small>${esc(b.carName || b.car)} · ${esc(b.date)}</small></li>`).join('') || '<li class="none">No times yet. Set the first one!</li>'}</ol>
      <div class="modes">
        <button class="go" data-race="start">Start race</button>
        <button class="go alt" data-race="back">Back</button>
      </div>`;
    panel.hidden = false;
    this.root.querySelector('.start').hidden = true;
    panel.querySelectorAll('[data-route]').forEach((b) =>
      b.addEventListener('click', () => {
        s.raceRoute = b.dataset.route;
        this.cb.onSettings('race');
        this.showRace();
      })
    );
    panel.querySelectorAll('[data-rset]').forEach((b) =>
      b.addEventListener('click', () => {
        const v = b.dataset.val;
        s[b.dataset.rset] = /^\d+$/.test(v) ? Number(v) : v;
        this.cb.onSettings('race');
        this.showRace();
      })
    );
    panel.querySelector('[data-race="back"]').addEventListener('click', () => {
      panel.hidden = true;
      this.root.querySelector('.start').hidden = false;
    });
    panel.querySelector('[data-race="start"]').addEventListener('click', () => {
      panel.hidden = true;
      this.root.querySelector('.start').hidden = false;
      this.cb.onStartRace({
        routeId: s.raceRoute,
        variant: s.raceVariant,
        laps: s.raceLaps,
        opponents: s.raceOpponents,
      });
    });
  }

  /** Re-highlight a setting chosen elsewhere (e.g. tilt fell back to buttons). */
  refreshSetting(name) {
    this.root.querySelectorAll(`[data-set="${name}"]`).forEach((x) =>
      x.classList.toggle('sel', x.dataset.val === this.settings[name])
    );
  }

  /* ---------------- in-game top bar ---------------- */

  _renderTopbar() {
    const fsSupported = !!document.documentElement.requestFullscreen;
    this.topbar.innerHTML = `
      <button data-act="pause" aria-label="Pause">❚❚</button>
      <span class="place"></span>
      <button data-act="camera" aria-label="Change camera">🎥</button>
      <button data-act="respawn" aria-label="Respawn">⟲</button>
      ${fsSupported ? '<button data-act="fullscreen" aria-label="Fullscreen">⛶</button>' : ''}`;
    this.topbar.addEventListener('click', (e) => {
      const act = e.target.closest('[data-act]')?.dataset.act;
      if (act === 'pause') this.cb.onPause();
      else if (act === 'camera') this.cb.onCamera();
      else if (act === 'respawn') this.cb.onRespawn();
      else if (act === 'fullscreen') toggleFullscreen();
    });
  }

  setPlace(text) {
    this.topbar.querySelector('.place').textContent = text;
  }

  show() {
    this.root.hidden = false;
    this.topbar.hidden = true;
    const running = this.cb.isRunning?.(); // 'free' | 'race' | null
    const resume = this.root.querySelector('[data-mode="resume"]');
    resume.hidden = !running;
    resume.textContent = running === 'race' ? 'Resume race' : 'Resume';
  }

  hide() {
    this.root.hidden = true;
    this.topbar.hidden = false;
  }
}

/** Fullscreen plus landscape lock (Android Chrome; iOS ignores both). */
export async function toggleFullscreen() {
  try {
    if (document.fullscreenElement) {
      await document.exitFullscreen();
    } else {
      await document.documentElement.requestFullscreen({ navigationUI: 'hide' });
      await screen.orientation?.lock?.('landscape').catch(() => {});
    }
  } catch {
    /* not allowed here: ignore */
  }
}
