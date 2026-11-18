/**
 * Procedural top-down car sprites.
 *
 * Why 2D sprites rather than Three.js 3D: on a mid-range Android GPU the map
 * already costs most of the frame. A 2D canvas overlay adds one cheap
 * compositing pass and a handful of drawImage calls, needs no 3D model
 * downloads, and keeps every vehicle readable from a top-down chase camera.
 *
 * Each sprite is drawn once to an offscreen canvas per (type, colour) and
 * cached, so per-frame cost is one drawImage. Sprites point "up" (front at
 * negative y) and are drawn in metres under the overlay's transform.
 */

const PX_PER_M = 24; // sprite resolution; enough for ~3x zoom-in on hi-dpi
const cache = new Map();

/** Rounded rectangle path helper (ctx.roundRect is missing on older WebViews). */
function rrect(ctx, x, y, w, h, r) {
  r = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** Lighten (amt > 0) or darken (amt < 0) a #rrggbb colour. */
export function shade(hex, amt) {
  const n = parseInt(hex.slice(1), 16);
  const f = (c) => Math.max(0, Math.min(255, Math.round(c + (amt > 0 ? (255 - c) : c) * amt)));
  const r = f(n >> 16), g = f((n >> 8) & 255), b = f(n & 255);
  return `#${((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1)}`;
}

/**
 * Small boxy 1980s hatchback: short bonnet, tall glasshouse, tiny wheels.
 * Coordinates are in metres with the car centred on (0,0).
 */
function drawHatchback(ctx, L, W, colour) {
  const hl = L / 2, hw = W / 2;
  // Wheels (peek out from under the body)
  ctx.fillStyle = '#1b1b1b';
  for (const [wy, sx] of [[-hl + 0.62, -1], [-hl + 0.62, 1], [hl - 0.6, -1], [hl - 0.6, 1]]) {
    ctx.fillRect(sx * hw - (sx > 0 ? 0.16 : 0.02), wy - 0.26, 0.18, 0.52);
  }
  // Body shell
  ctx.fillStyle = colour;
  rrect(ctx, -hw + 0.04, -hl, W - 0.08, L, 0.32);
  ctx.fill();
  ctx.lineWidth = 0.05;
  ctx.strokeStyle = shade(colour, -0.45);
  ctx.stroke();
  // Bonnet crease
  ctx.strokeStyle = shade(colour, -0.2);
  ctx.lineWidth = 0.04;
  ctx.beginPath();
  ctx.moveTo(0, -hl + 0.1);
  ctx.lineTo(0, -hl + 0.7);
  ctx.stroke();
  // Windscreen (raked trapezoid)
  ctx.fillStyle = '#26323d';
  ctx.beginPath();
  ctx.moveTo(-hw + 0.2, -hl + 0.95);
  ctx.lineTo(hw - 0.2, -hl + 0.95);
  ctx.lineTo(hw - 0.12, -hl + 0.62);
  ctx.lineTo(-hw + 0.12, -hl + 0.62);
  ctx.closePath();
  ctx.fill();
  // Roof
  ctx.fillStyle = shade(colour, 0.18);
  rrect(ctx, -hw + 0.18, -hl + 0.95, W - 0.36, 1.45, 0.12);
  ctx.fill();
  // Side windows
  ctx.fillStyle = '#334452';
  ctx.fillRect(-hw + 0.08, -hl + 0.98, 0.1, 1.38);
  ctx.fillRect(hw - 0.18, -hl + 0.98, 0.1, 1.38);
  // Rear hatch glass
  ctx.fillStyle = '#26323d';
  ctx.fillRect(-hw + 0.18, hl - 0.92, W - 0.36, 0.4);
  // Headlights (round, classic) and tail lamps
  ctx.fillStyle = '#fff6c8';
  ctx.beginPath();
  ctx.arc(-hw + 0.28, -hl + 0.1, 0.12, 0, Math.PI * 2);
  ctx.arc(hw - 0.28, -hl + 0.1, 0.12, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#8c1010';
  ctx.fillRect(-hw + 0.1, hl - 0.12, 0.32, 0.1);
  ctx.fillRect(hw - 0.42, hl - 0.12, 0.32, 0.1);
  // Wing mirrors
  ctx.fillStyle = shade(colour, -0.3);
  ctx.fillRect(-hw - 0.08, -hl + 0.95, 0.14, 0.1);
  ctx.fillRect(hw - 0.06, -hl + 0.95, 0.14, 0.1);
}

const DRAWERS = { hatchback: drawHatchback };

/**
 * Get (or build) the cached sprite canvas for a car spec + colour.
 * @returns {{canvas: HTMLCanvasElement|OffscreenCanvas, w:number, h:number}} w/h in metres
 */
export function getCarSprite(spec, colour) {
  const key = `${spec.sprite}|${colour}`;
  let s = cache.get(key);
  if (s) return s;
  const pad = 0.15; // metres around the body for mirrors/antialiasing
  const w = spec.width + pad * 2, h = spec.length + pad * 2;
  const canvas = document.createElement('canvas');
  canvas.width = Math.ceil(w * PX_PER_M);
  canvas.height = Math.ceil(h * PX_PER_M);
  const ctx = canvas.getContext('2d');
  ctx.scale(PX_PER_M, PX_PER_M);
  ctx.translate(w / 2, h / 2);
  (DRAWERS[spec.sprite] || drawHatchback)(ctx, spec.length, spec.width, colour);
  s = { canvas, w, h };
  cache.set(key, s);
  return s;
}
