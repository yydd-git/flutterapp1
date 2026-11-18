/**
 * Heading-up mini-map (top-right). Draws nearby roads from the physics
 * road network, the race line, the next checkpoint, opponents and
 * traffic. Redrawn ~8 times a second, not every frame, to save battery.
 */
const SIZE = 120; // CSS px
const RANGE = 260; // metres from centre to edge

export class Minimap {
  constructor(root) {
    this.el = document.createElement('div');
    this.el.className = 'minimap';
    this.canvas = document.createElement('canvas');
    this.el.appendChild(this.canvas);
    root.appendChild(this.el);
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.canvas.width = this.canvas.height = SIZE * this.dpr;
    this.ctx = this.canvas.getContext('2d');
    this._timer = 0;
  }

  setVisible(v) {
    this.el.hidden = !v;
  }

  /**
   * @param {number} dt
   * @param {{player, roads, race, traffic}} w
   */
  update(dt, w) {
    if (this.el.hidden || (this._timer -= dt) > 0) return;
    this._timer = 0.12;
    const { ctx } = this;
    const k = SIZE / 2 / RANGE; // px per metre
    const p = w.player;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, SIZE, SIZE);
    ctx.save();
    ctx.beginPath();
    ctx.arc(SIZE / 2, SIZE / 2, SIZE / 2 - 1, 0, Math.PI * 2);
    ctx.clip();
    ctx.fillStyle = 'rgba(32, 46, 30, 0.82)';
    ctx.fillRect(0, 0, SIZE, SIZE);
    // World → map: centre on the player, heading up, north = -y
    ctx.translate(SIZE / 2, SIZE / 2);
    ctx.rotate(-p.heading);
    ctx.scale(k, -k);
    ctx.translate(-p.x, -p.y);
    ctx.lineCap = 'round';

    // Roads
    ctx.strokeStyle = 'rgba(225, 222, 210, 0.9)';
    const buckets = new Map();
    w.roads.forEachNear(p.x, p.y, RANGE * 1.1, (s) => {
      const lw = Math.max(1.6 / k, s.way.half * 1.2);
      let list = buckets.get(lw);
      if (!list) buckets.set(lw, (list = []));
      list.push(s);
    });
    for (const [lw, list] of buckets) {
      ctx.lineWidth = lw;
      ctx.beginPath();
      for (const s of list) {
        ctx.moveTo(s.ax, s.ay);
        ctx.lineTo(s.bx, s.by);
      }
      ctx.stroke();
    }

    // Race line near the player + next checkpoint
    const race = w.race;
    if (race) {
      const path = race.path;
      ctx.strokeStyle = 'rgba(255, 153, 51, 0.95)';
      ctx.lineWidth = 3.2 / k;
      ctx.beginPath();
      const s0 = race.playerS - RANGE * 1.2;
      let first = true;
      const pt = { x: 0, y: 0, heading: 0 };
      for (let s = s0; s < s0 + RANGE * 2.6; s += 10) {
        if (!race.closed && (s < 0 || s > race.totalLen)) continue;
        path.pointAt(race.closed ? s : Math.min(s, race.totalLen), pt);
        if (first) ctx.moveTo(pt.x, pt.y);
        else ctx.lineTo(pt.x, pt.y);
        first = false;
      }
      ctx.stroke();
      if (race.nextCp < race.checkpoints.length) {
        const cp = race.checkpointPoint(race.nextCp);
        ctx.fillStyle = race.nextCp === race.checkpoints.length - 1 ? '#ffffff' : '#ffcc33';
        ctx.beginPath();
        ctx.arc(cp.x, cp.y, 6 / k, 0, Math.PI * 2);
        ctx.fill();
      }
      for (const r of race.racers) {
        ctx.fillStyle = r.colour;
        ctx.beginPath();
        ctx.arc(r.x, r.y, 4.2 / k, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 1 / k;
        ctx.stroke();
      }
    }

    // Traffic
    ctx.fillStyle = 'rgba(30, 30, 30, 0.75)';
    for (const a of w.traffic) {
      if (!a.active) continue;
      ctx.beginPath();
      ctx.arc(a.x, a.y, (a.spec.id === 'cow' ? 2 : 2.6) / k, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();

    // Player arrow (always centre, pointing up)
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.translate(SIZE / 2, SIZE / 2);
    ctx.fillStyle = '#ff9933';
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(0, -7);
    ctx.lineTo(5, 6);
    ctx.lineTo(0, 3);
    ctx.lineTo(-5, 6);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }
}
