/**
 * OpenStreetMap road data via the Overpass API.
 *
 * The world is split into fixed ~2 km "cells" (0.02° × 0.02°). Roads are
 * fetched, cached and pre-baked per cell, so the build-time fetch script
 * and the in-browser live loader share one format.
 *
 * Pure functions only (no DOM): shared by the browser, the Node fetch
 * script and the unit tests.
 */

export const CELL_DEG = 0.02;

export const OVERPASS_ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
];

/**
 * Drivable highway classes.
 * half: default half-width in metres (carriageway + kerb tolerance).
 *       OSM centre lines and the map tiles disagree by a few metres, so
 *       these are generous.
 * rank: preference when choosing a spawn road.
 */
export const ROAD_CLASSES = {
  motorway: { half: 10, rank: 6 },
  trunk: { half: 9, rank: 6 },
  primary: { half: 8, rank: 5 },
  secondary: { half: 7, rank: 4 },
  tertiary: { half: 6, rank: 3 },
  motorway_link: { half: 5.5, rank: 2 },
  trunk_link: { half: 5.5, rank: 2 },
  primary_link: { half: 5, rank: 2 },
  secondary_link: { half: 5, rank: 2 },
  tertiary_link: { half: 4.5, rank: 1 },
  unclassified: { half: 5, rank: 1 },
  road: { half: 5, rank: 1 },
  residential: { half: 4.5, rank: 0 },
  living_street: { half: 4, rank: 0 },
  track: { half: 3.5, rank: -1 },
};

const UNPAVED = new Set([
  'unpaved', 'dirt', 'gravel', 'fine_gravel', 'ground', 'sand', 'mud',
  'compacted', 'earth', 'grass', 'pebblestone', 'rock',
]);

/* ---------------- cells ---------------- */

export const cellKey = (lng, lat) => `${Math.floor(lat / CELL_DEG)}_${Math.floor(lng / CELL_DEG)}`;

/** @returns {{s:number,w:number,n:number,e:number}} bounds in degrees */
export function cellBounds(key) {
  const [i, j] = key.split('_').map(Number);
  return { s: i * CELL_DEG, w: j * CELL_DEG, n: (i + 1) * CELL_DEG, e: (j + 1) * CELL_DEG };
}

/** All cell keys within `radius` cells of the cell containing (lng, lat). */
export function cellsAround(lng, lat, radius = 1) {
  const i0 = Math.floor(lat / CELL_DEG), j0 = Math.floor(lng / CELL_DEG);
  const keys = [];
  for (let di = -radius; di <= radius; di++)
    for (let dj = -radius; dj <= radius; dj++) keys.push(`${i0 + di}_${j0 + dj}`);
  return keys;
}

/** Cell keys overlapped by a lng/lat box. */
export function cellsInBox(w, s, e, n) {
  const keys = [];
  for (let i = Math.floor(s / CELL_DEG); i <= Math.floor(n / CELL_DEG); i++)
    for (let j = Math.floor(w / CELL_DEG); j <= Math.floor(e / CELL_DEG); j++) keys.push(`${i}_${j}`);
  return keys;
}

/* ---------------- query & parse ---------------- */

/** Overpass QL for every drivable road intersecting a bbox. */
export function buildQuery({ s, w, n, e }, timeout = 25) {
  const types = Object.keys(ROAD_CLASSES).join('|');
  const f = (v) => v.toFixed(5);
  return (
    `[out:json][timeout:${timeout}];` +
    `way["highway"~"^(${types})$"]["area"!="yes"]["access"!~"^(private|no)$"]` +
    `(${f(s)},${f(w)},${f(n)},${f(e)});out tags geom qt;`
  );
}

/**
 * Compact way record:
 * { id, t: highway, n?: name, r?: ref, l?: lanes, u?: 1 if unpaved,
 *   c: [lng, lat, lng, lat, ...] rounded to 5 dp (~1 m) }
 */
export function parseOverpass(json) {
  const ways = [];
  for (const el of json?.elements || []) {
    if (el.type !== 'way' || !el.geometry || el.geometry.length < 2) continue;
    const tg = el.tags || {};
    if (!ROAD_CLASSES[tg.highway]) continue;
    const c = [];
    for (const p of el.geometry) {
      if (!p) continue; // Overpass emits null for points outside some outputs
      c.push(Math.round(p.lon * 1e5) / 1e5, Math.round(p.lat * 1e5) / 1e5);
    }
    if (c.length < 4) continue;
    const w = { id: el.id, t: tg.highway, c };
    const name = tg['name:en'] || tg.name;
    if (name) w.n = name;
    if (tg.ref) w.r = tg.ref;
    const lanes = parseInt(tg.lanes, 10);
    if (lanes > 0 && lanes < 12) w.l = lanes;
    if (tg.highway === 'track' || UNPAVED.has(tg.surface)) w.u = 1;
    ways.push(w);
  }
  return ways;
}

/** Bounding box of a compact way: [w, s, e, n]. */
function wayBox(c) {
  let w = Infinity, s = Infinity, e = -Infinity, n = -Infinity;
  for (let k = 0; k < c.length; k += 2) {
    if (c[k] < w) w = c[k];
    if (c[k] > e) e = c[k];
    if (c[k + 1] < s) s = c[k + 1];
    if (c[k + 1] > n) n = c[k + 1];
  }
  return [w, s, e, n];
}

/**
 * Group ways by every cell their bbox touches (a way can be in several
 * cells; the network de-duplicates by id). Optionally keep only `onlyKeys`.
 * @returns {Map<string, object[]>}
 */
export function splitIntoCells(ways, onlyKeys = null) {
  const keep = onlyKeys ? new Set(onlyKeys) : null;
  const out = new Map();
  for (const way of ways) {
    for (const key of cellsInBox(...wayBox(way.c))) {
      if (keep && !keep.has(key)) continue;
      if (!out.has(key)) out.set(key, []);
      out.get(key).push(way);
    }
  }
  return out;
}

/** Half-width in metres for a compact way. */
export function wayHalfWidth(way) {
  const base = (ROAD_CLASSES[way.t] || ROAD_CLASSES.road).half;
  return way.l ? Math.max(base, way.l * 1.75 + 1.5) : base;
}

/* ---------------- fetch ---------------- */

/**
 * POST a query to Overpass, falling back across mirrors on errors and
 * rate limits (429/504).
 */
export async function fetchOverpass(query, { endpoints = OVERPASS_ENDPOINTS, signal, fetchImpl = fetch } = {}) {
  let lastErr;
  for (const url of endpoints) {
    try {
      const res = await fetchImpl(url, {
        method: 'POST',
        body: 'data=' + encodeURIComponent(query),
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        signal,
      });
      if (!res.ok) throw new Error(`Overpass ${res.status} from ${new URL(url).host}`);
      return await res.json();
    } catch (err) {
      if (signal?.aborted) throw err;
      lastErr = err;
    }
  }
  throw lastErr;
}
