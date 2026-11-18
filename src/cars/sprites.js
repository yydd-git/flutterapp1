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

/** Shared helper: four dark tyres at given axle offsets from the centre. */
function wheels(ctx, hw, frontY, rearY, tw = 0.2, tl = 0.6, inset = 0.02) {
  ctx.fillStyle = '#1b1b1b';
  for (const wy of [frontY, rearY])
    for (const sx of [-1, 1]) ctx.fillRect(sx > 0 ? hw - tw + inset : -hw - inset, wy - tl / 2, tw, tl);
}

/**
 * Classic rounded 1960s sedan: long domed bonnet, upright cabin, round
 * boot, chrome bumpers and a big grille.
 */
function drawSedan(ctx, L, W, colour) {
  const hl = L / 2, hw = W / 2;
  wheels(ctx, hw, -hl + 0.85, hl - 0.85, 0.22, 0.66);
  // Body: rounded "pillow" shape with bulging sides
  ctx.fillStyle = colour;
  ctx.beginPath();
  ctx.moveTo(-hw + 0.35, -hl);
  ctx.quadraticCurveTo(0, -hl - 0.08, hw - 0.35, -hl);
  ctx.quadraticCurveTo(hw, -hl + 0.05, hw - 0.02, -hl + 0.6);
  ctx.quadraticCurveTo(hw + 0.04, 0, hw - 0.02, hl - 0.6);
  ctx.quadraticCurveTo(hw, hl - 0.05, hw - 0.35, hl);
  ctx.quadraticCurveTo(0, hl + 0.06, -hw + 0.35, hl);
  ctx.quadraticCurveTo(-hw, hl - 0.05, -hw + 0.02, hl - 0.6);
  ctx.quadraticCurveTo(-hw - 0.04, 0, -hw + 0.02, -hl + 0.6);
  ctx.quadraticCurveTo(-hw, -hl + 0.05, -hw + 0.35, -hl);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = shade(colour, -0.45);
  ctx.lineWidth = 0.05;
  ctx.stroke();
  // Domed bonnet highlight and centre ridge
  ctx.fillStyle = shade(colour, 0.12);
  rrect(ctx, -hw + 0.3, -hl + 0.15, W - 0.6, 1.0, 0.35);
  ctx.fill();
  ctx.strokeStyle = shade(colour, -0.15);
  ctx.lineWidth = 0.035;
  ctx.beginPath();
  ctx.moveTo(0, -hl + 0.12);
  ctx.lineTo(0, -hl + 1.2);
  ctx.stroke();
  // Windscreen, roof, rear window
  ctx.fillStyle = '#26323d';
  ctx.beginPath();
  ctx.moveTo(-hw + 0.24, -hl + 1.62);
  ctx.quadraticCurveTo(0, -hl + 1.5, hw - 0.24, -hl + 1.62);
  ctx.lineTo(hw - 0.16, -hl + 1.28);
  ctx.quadraticCurveTo(0, -hl + 1.18, -hw + 0.16, -hl + 1.28);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = shade(colour, 0.2);
  rrect(ctx, -hw + 0.24, -hl + 1.62, W - 0.48, 1.35, 0.25);
  ctx.fill();
  ctx.fillStyle = '#26323d';
  rrect(ctx, -hw + 0.24, hl - 1.38, W - 0.48, 0.32, 0.12);
  ctx.fill();
  ctx.fillStyle = '#334452';
  ctx.fillRect(-hw + 0.08, -hl + 1.62, 0.13, 1.3);
  ctx.fillRect(hw - 0.21, -hl + 1.62, 0.13, 1.3);
  // Chrome bumpers, grille, round lamps
  ctx.fillStyle = '#d8dde2';
  rrect(ctx, -hw + 0.1, -hl - 0.1, W - 0.2, 0.12, 0.06);
  ctx.fill();
  rrect(ctx, -hw + 0.1, hl - 0.02, W - 0.2, 0.12, 0.06);
  ctx.fill();
  ctx.fillStyle = '#9aa3ab';
  ctx.fillRect(-0.4, -hl + 0.02, 0.8, 0.12);
  ctx.fillStyle = '#fff6c8';
  ctx.beginPath();
  ctx.arc(-hw + 0.33, -hl + 0.12, 0.13, 0, Math.PI * 2);
  ctx.arc(hw - 0.33, -hl + 0.12, 0.13, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#8c1010';
  ctx.fillRect(-hw + 0.12, hl - 0.16, 0.28, 0.12);
  ctx.fillRect(hw - 0.4, hl - 0.16, 0.28, 0.12);
}

/**
 * Boxy 4x4: flat bonnet, open back with roll bar, spare wheel on the
 * tailgate, chunky exposed tyres.
 */
function drawJeep(ctx, L, W, colour) {
  const hl = L / 2, hw = W / 2;
  wheels(ctx, hw, -hl + 0.7, hl - 0.75, 0.3, 0.72, 0.08);
  // Body tub
  ctx.fillStyle = colour;
  rrect(ctx, -hw + 0.08, -hl + 0.05, W - 0.16, L - 0.25, 0.1);
  ctx.fill();
  ctx.strokeStyle = shade(colour, -0.5);
  ctx.lineWidth = 0.05;
  ctx.stroke();
  // Flat bonnet with louvres
  ctx.strokeStyle = shade(colour, -0.25);
  ctx.lineWidth = 0.03;
  for (let k = 0; k < 4; k++) {
    ctx.beginPath();
    ctx.moveTo(-0.35, -hl + 0.3 + k * 0.14);
    ctx.lineTo(0.35, -hl + 0.3 + k * 0.14);
    ctx.stroke();
  }
  // Fold-flat windscreen frame
  ctx.fillStyle = '#26323d';
  ctx.fillRect(-hw + 0.15, -hl + 1.05, W - 0.3, 0.18);
  // Open cabin: seats visible
  ctx.fillStyle = shade(colour, -0.35);
  ctx.fillRect(-hw + 0.15, -hl + 1.25, W - 0.3, 1.9);
  ctx.fillStyle = '#3b2f25';
  rrect(ctx, -hw + 0.25, -hl + 1.45, 0.5, 0.55, 0.08);
  ctx.fill();
  rrect(ctx, hw - 0.75, -hl + 1.45, 0.5, 0.55, 0.08);
  ctx.fill();
  rrect(ctx, -hw + 0.25, -hl + 2.35, W - 0.5, 0.5, 0.08);
  ctx.fill();
  // Roll bar
  ctx.strokeStyle = '#2a2a2a';
  ctx.lineWidth = 0.09;
  ctx.beginPath();
  ctx.moveTo(-hw + 0.12, -hl + 2.15);
  ctx.lineTo(hw - 0.12, -hl + 2.15);
  ctx.stroke();
  // Spare wheel on the tailgate
  ctx.fillStyle = '#1b1b1b';
  ctx.beginPath();
  ctx.arc(0, hl - 0.12, 0.3, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#6b6b6b';
  ctx.beginPath();
  ctx.arc(0, hl - 0.12, 0.12, 0, Math.PI * 2);
  ctx.fill();
  // Square-ish headlamps, tail lamps
  ctx.fillStyle = '#fff6c8';
  ctx.beginPath();
  ctx.arc(-hw + 0.3, -hl + 0.12, 0.11, 0, Math.PI * 2);
  ctx.arc(hw - 0.3, -hl + 0.12, 0.11, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#8c1010';
  ctx.fillRect(-hw + 0.12, hl - 0.32, 0.2, 0.12);
  ctx.fillRect(hw - 0.32, hl - 0.32, 0.2, 0.12);
}

/**
 * 1950s open roadster: very long bonnet, flowing separate wings, a tiny
 * cockpit set far back with two seats, wire wheels and a chrome grille.
 */
function drawRoadster(ctx, L, W, colour) {
  const hl = L / 2, hw = W / 2;
  // Wire wheels (light hubs)
  for (const wy of [-hl + 0.75, hl - 0.8])
    for (const sx of [-1, 1]) {
      ctx.fillStyle = '#1b1b1b';
      ctx.fillRect(sx > 0 ? hw - 0.2 : -hw, wy - 0.3, 0.2, 0.6);
      ctx.fillStyle = '#c9ced4';
      ctx.fillRect(sx > 0 ? hw - 0.14 : -hw + 0.06, wy - 0.1, 0.08, 0.2);
    }
  // Flowing wings and narrow waist
  ctx.fillStyle = colour;
  ctx.beginPath();
  ctx.moveTo(0, -hl);
  ctx.bezierCurveTo(hw * 0.7, -hl, hw, -hl + 0.3, hw, -hl + 0.9);
  ctx.bezierCurveTo(hw, -hl + 1.4, hw - 0.28, -0.2, hw - 0.28, 0.2);
  ctx.bezierCurveTo(hw - 0.28, 0.6, hw, hl - 1.3, hw, hl - 0.8);
  ctx.bezierCurveTo(hw, hl - 0.25, hw * 0.6, hl, 0, hl);
  ctx.bezierCurveTo(-hw * 0.6, hl, -hw, hl - 0.25, -hw, hl - 0.8);
  ctx.bezierCurveTo(-hw, hl - 1.3, -hw + 0.28, 0.6, -hw + 0.28, 0.2);
  ctx.bezierCurveTo(-hw + 0.28, -0.2, -hw, -hl + 1.4, -hw, -hl + 0.9);
  ctx.bezierCurveTo(-hw, -hl + 0.3, -hw * 0.7, -hl, 0, -hl);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = shade(colour, -0.45);
  ctx.lineWidth = 0.05;
  ctx.stroke();
  // Long bonnet with central strip and side vents
  ctx.fillStyle = shade(colour, 0.15);
  ctx.beginPath();
  ctx.ellipse(0, -hl + 1.05, 0.42, 0.95, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = shade(colour, -0.2);
  ctx.lineWidth = 0.035;
  ctx.beginPath();
  ctx.moveTo(0, -hl + 0.1);
  ctx.lineTo(0, -hl + 2.0);
  ctx.stroke();
  // Thin wrap-around windscreen
  ctx.strokeStyle = '#9fb4c4';
  ctx.lineWidth = 0.07;
  ctx.beginPath();
  ctx.moveTo(-hw + 0.38, 0.05);
  ctx.quadraticCurveTo(0, -0.18, hw - 0.38, 0.05);
  ctx.stroke();
  // Open cockpit with two leather seats
  ctx.fillStyle = '#2b201a';
  rrect(ctx, -hw + 0.36, 0.12, W - 0.72, 1.0, 0.25);
  ctx.fill();
  ctx.fillStyle = '#8b3a1e';
  rrect(ctx, -hw + 0.42, 0.45, 0.38, 0.5, 0.12);
  ctx.fill();
  rrect(ctx, hw - 0.8, 0.45, 0.38, 0.5, 0.12);
  ctx.fill();
  // Steering wheel (right-hand drive)
  ctx.strokeStyle = '#111';
  ctx.lineWidth = 0.04;
  ctx.beginPath();
  ctx.arc(hw - 0.61, 0.3, 0.14, 0, Math.PI * 2);
  ctx.stroke();
  // Chrome grille and lamps
  ctx.fillStyle = '#d8dde2';
  rrect(ctx, -0.22, -hl + 0.02, 0.44, 0.14, 0.06);
  ctx.fill();
  ctx.fillStyle = '#fff6c8';
  ctx.beginPath();
  ctx.arc(-hw + 0.32, -hl + 0.45, 0.13, 0, Math.PI * 2);
  ctx.arc(hw - 0.32, -hl + 0.45, 0.13, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#8c1010';
  ctx.beginPath();
  ctx.arc(-hw + 0.35, hl - 0.3, 0.08, 0, Math.PI * 2);
  ctx.arc(hw - 0.35, hl - 0.3, 0.08, 0, Math.PI * 2);
  ctx.fill();
}

const DRAWERS = { hatchback: drawHatchback, sedan: drawSedan, jeep: drawJeep, roadster: drawRoadster };

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
