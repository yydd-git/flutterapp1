/**
 * In-game HUD: analogue speedometer with digital readout and gear letter.
 * The gauge canvas is only redrawn when the displayed value changes, so
 * it costs nothing while cruising at constant speed.
 */
import { MPS_TO_KMH } from '../config.js';

const MAX_KMH = 160;
const START = Math.PI * 0.75; // gauge sweep: 135° → 405°
const SWEEP = Math.PI * 1.5;

export class Hud {
  /** @param {HTMLElement} root */
  constructor(root) {
    this.root = root;
    root.innerHTML = `
      <div class="speedo">
        <canvas width="150" height="150"></canvas>
        <div class="speedo-readout"><span class="kmh">0</span><small>km/h</small></div>
        <div class="gear">D</div>
      </div>
      <div class="toast" hidden></div>`;
    this.canvas = root.querySelector('canvas');
    this.ctx = this.canvas.getContext('2d');
    this.kmhEl = root.querySelector('.kmh');
    this.gearEl = root.querySelector('.gear');
    this.toastEl = root.querySelector('.toast');
    this.lastKmh = -1;
    this.lastGear = '';
    this._setupCanvas();
    this._draw(0);
  }

  _setupCanvas() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const size = 150;
    this.canvas.width = size * dpr;
    this.canvas.height = size * dpr;
    this.ctx.scale(dpr, dpr);
    // Static dial face drawn once to an offscreen canvas.
    const face = document.createElement('canvas');
    face.width = this.canvas.width;
    face.height = this.canvas.height;
    const f = face.getContext('2d');
    f.scale(dpr, dpr);
    const c = size / 2, r = size / 2 - 8;
    f.fillStyle = 'rgba(14,18,24,0.72)';
    f.beginPath();
    f.arc(c, c, r + 6, 0, Math.PI * 2);
    f.fill();
    for (let k = 0; k <= MAX_KMH; k += 10) {
      const a = START + (k / MAX_KMH) * SWEEP;
      const major = k % 20 === 0;
      f.strokeStyle = k >= 120 ? '#ff6b4a' : '#e8e2d0';
      f.lineWidth = major ? 2.5 : 1.2;
      f.beginPath();
      f.moveTo(c + Math.cos(a) * (r - (major ? 12 : 7)), c + Math.sin(a) * (r - (major ? 12 : 7)));
      f.lineTo(c + Math.cos(a) * r, c + Math.sin(a) * r);
      f.stroke();
      if (major) {
        f.fillStyle = '#cfc8b4';
        f.font = '600 10px system-ui, sans-serif';
        f.textAlign = 'center';
        f.textBaseline = 'middle';
        f.fillText(String(k), c + Math.cos(a) * (r - 22), c + Math.sin(a) * (r - 22));
      }
    }
    this.face = face;
    this.size = size;
  }

  _draw(kmh) {
    const { ctx, size } = this;
    const c = size / 2, r = size / 2 - 8;
    ctx.clearRect(0, 0, size, size);
    ctx.drawImage(this.face, 0, 0, size, size);
    const a = START + (Math.min(kmh, MAX_KMH) / MAX_KMH) * SWEEP;
    ctx.strokeStyle = '#ff9933'; // saffron needle
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(c - Math.cos(a) * 8, c - Math.sin(a) * 8);
    ctx.lineTo(c + Math.cos(a) * (r - 6), c + Math.sin(a) * (r - 6));
    ctx.stroke();
    ctx.fillStyle = '#ff9933';
    ctx.beginPath();
    ctx.arc(c, c, 4, 0, Math.PI * 2);
    ctx.fill();
  }

  /** Called every frame with the player vehicle. */
  update(car) {
    const kmh = Math.round(Math.abs(car.forwardSpeed) * MPS_TO_KMH);
    if (kmh !== this.lastKmh) {
      this.lastKmh = kmh;
      this.kmhEl.textContent = kmh;
      this._draw(kmh);
    }
    const gear = car.reversing ? 'R' : car.speed < 0.3 ? 'N' : 'D';
    if (gear !== this.lastGear) {
      this.lastGear = gear;
      this.gearEl.textContent = gear;
      this.gearEl.classList.toggle('rev', gear === 'R');
    }
  }

  /** Short message at the top of the screen. */
  toast(msg, ms = 3500) {
    this.toastEl.textContent = msg;
    this.toastEl.hidden = false;
    clearTimeout(this._toastTimer);
    this._toastTimer = setTimeout(() => (this.toastEl.hidden = true), ms);
  }
}
