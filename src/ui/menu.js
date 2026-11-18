/**
 * Start menu, settings panel and in-game top bar.
 * Plain DOM, no framework; it talks to the game through callbacks only.
 */
import { CITIES, CAMERA } from '../config.js';
import { CAR_TYPES } from '../cars/carTypes.js';
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
    const car = CAR_TYPES[s.car];
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
        <div class="car-pick">
          <div><b>${esc(car.name)}</b><small>${esc(car.blurb)}</small></div>
          <div class="swatches">
            ${car.colours.map((col, i) => `
              <button class="swatch ${i === s.colour ? 'sel' : ''}" data-colour="${i}"
                style="background:${col}" aria-label="Colour ${i + 1}"></button>`).join('')}
          </div>
        </div>

        <div class="modes">
          <button class="go" data-mode="free">Free Drive</button>
          <button class="go" disabled title="Arrives in Phase 3">Race <small>soon</small></button>
        </div>
        <button class="link" data-open="settings">⚙ Controls &amp; settings</button>
      </div>
      <div class="panel settings" hidden></div>`;

    this.root.querySelectorAll('[data-city]').forEach((b) =>
      b.addEventListener('click', () => {
        s.city = b.dataset.city;
        this._select(b, '[data-city]');
        this.cb.onSettings();
      })
    );
    this.root.querySelectorAll('[data-colour]').forEach((b) =>
      b.addEventListener('click', () => {
        s.colour = Number(b.dataset.colour);
        this._select(b, '[data-colour]');
        this.cb.onSettings();
      })
    );
    this.root.querySelector('[data-mode="free"]').addEventListener('click', () => this.cb.onStart('free'));
    this.root.querySelector('[data-open="settings"]').addEventListener('click', () => this.showSettings());
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
    const startBtn = this.root.querySelector('[data-mode="free"]');
    startBtn.textContent = this.cb.isRunning?.() ? 'Resume' : 'Free Drive';
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
