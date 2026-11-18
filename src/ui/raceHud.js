/**
 * Race HUD: position / lap / checkpoint / timer panel, the 3-2-1-GO
 * countdown, an off-route warning, loading status and the results screen.
 */
import { formatTime, topTimes } from '../race/leaderboard.js';

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const ordinal = (n) => n + (['th', 'st', 'nd', 'rd'][(n % 100 > 10 && n % 100 < 14) ? 0 : n % 10] || 'th');

export class RaceHud {
  constructor(root) {
    this.root = root;
    root.insertAdjacentHTML('beforeend', `
      <div class="race-panel" hidden>
        <div class="race-pos"><b>1</b><small>/4</small></div>
        <div class="race-meta"><span class="race-lap"></span><span class="race-cp"></span></div>
        <div class="race-time">0:00.00</div>
      </div>
      <div class="race-count" hidden></div>
      <div class="race-warn" hidden>Off the race route. Tap ⟲ to get back on it.</div>
      <div class="race-loading" hidden><div class="spinner"></div><span></span></div>
      <div class="race-results" hidden></div>`);
    const $ = (s) => root.querySelector(s);
    this.panel = $('.race-panel');
    this.posEl = $('.race-pos b');
    this.ofEl = $('.race-pos small');
    this.lapEl = $('.race-lap');
    this.cpEl = $('.race-cp');
    this.timeEl = $('.race-time');
    this.countEl = $('.race-count');
    this.warnEl = $('.race-warn');
    this.loadingEl = $('.race-loading');
    this.resultsEl = $('.race-results');
    this._last = {};
  }

  loading(text) {
    this.loadingEl.hidden = !text;
    if (text) this.loadingEl.querySelector('span').textContent = text;
  }

  hide() {
    this.panel.hidden = this.countEl.hidden = this.warnEl.hidden = this.resultsEl.hidden = true;
    this.loading(null);
  }

  _set(el, key, text) {
    if (this._last[key] !== text) {
      this._last[key] = text;
      el.textContent = text;
    }
  }

  /** Called every frame while a race exists. */
  update(race) {
    this.panel.hidden = false;
    const n = race.racers.length + 1;
    this.ofEl.hidden = n === 1;
    this._set(this.posEl, 'pos', n === 1 ? 'TT' : String(race.position));
    this._set(this.ofEl, 'of', `/${n}`);
    this._set(this.lapEl, 'lap', race.closed ? `Lap ${race.displayLap}/${race.laps}` : `${(Math.max(0, race.totalLen - race.playerS) / 1000).toFixed(1)} km to go`);
    this._set(this.cpEl, 'cp', `CP ${Math.min(race.nextCp, race.checkpoints.length)}/${race.checkpoints.length}`);
    this._set(this.timeEl, 'time', formatTime(race.state === 'finished' ? race.finishTime : race.elapsed));

    if (race.state === 'countdown' || race.state === 'grid') {
      this.countEl.hidden = false;
      this.countEl.classList.remove('go');
      this._set(this.countEl, 'count', race.state === 'grid' ? 'Get ready' : String(Math.ceil(race.countdown)));
    } else if (race.state === 'racing' && race.elapsed < 1) {
      this.countEl.hidden = false;
      this.countEl.classList.add('go');
      this._set(this.countEl, 'count', 'GO!');
    } else {
      this.countEl.hidden = true;
    }
    this.warnEl.hidden = !(race.offRoute && race.state === 'racing');
  }

  /** Results screen after the player finishes. */
  showResults(race, rank, { onRetry, onExit }) {
    const best = topTimes(race.board, 5);
    const me = race.results.find((r) => r.player);
    this.resultsEl.innerHTML = `
      <div class="panel">
        <h2 class="res-title">${race.racers.length ? `You finished ${ordinal(me.pos)}` : 'Time trial complete'}</h2>
        <p class="res-time">${formatTime(race.finishTime)}${rank === 1 ? ' <span class="pb">New best!</span>' : rank ? ` <span class="pb">#${rank} on the board</span>` : ''}</p>
        ${race.lapTimes.length > 1 ? `<p class="res-laps">Laps: ${race.lapTimes.map(formatTime).join(' · ')}</p>` : ''}
        ${race.racers.length ? `<table class="res-table">${race.results.map((r) => `
          <tr class="${r.player ? 'me' : ''}"><td>${r.pos}</td><td>${esc(r.name)}<small>${esc(r.car)}</small></td>
          <td>${r.estimated ? '~' : ''}${formatTime(r.time)}</td></tr>`).join('')}</table>` : ''}
        <h3>Best times · ${esc(race.route.name)}</h3>
        <ol class="res-board">${best.map((b) => `<li><span>${formatTime(b.time)}</span><small>${esc(b.carName || b.car)} · ${esc(b.date)}</small></li>`).join('') || '<li>No times yet</li>'}</ol>
        <div class="modes"><button class="go" data-r="retry">Race again</button><button class="go alt" data-r="exit">Menu</button></div>
      </div>`;
    this.resultsEl.hidden = false;
    this.resultsEl.querySelector('[data-r="retry"]').onclick = onRetry;
    this.resultsEl.querySelector('[data-r="exit"]').onclick = onExit;
  }
}
