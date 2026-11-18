#!/usr/bin/env node
/**
 * Pre-bake OSM data (the "hybrid" part of road loading):
 *
 *  1. City roads. For each start city, ONE Overpass query covers a block of
 *     cells around the centre; the result is split into per-cell files:
 *       public/roads/index.json          { v, generated, cells: [...] }
 *       public/roads/cells/<key>.json    { key, ways: [...] }
 *  2. Race lines. For each race route, ONE query fetches the main roads in
 *     the route's area and the route is planned with A*:
 *       public/routes/<id>.json          { id, coords, length }
 *
 * Incremental: cities and routes already on disk are skipped, so CI (which
 * caches these folders between runs) only asks Overpass for what's missing.
 * Public Overpass servers rate-limit shared CI machines; the game falls back
 * to fetching live in the browser for anything that's missing.
 *
 * Options: --radius N   cells around each city centre (default 1 → 3×3 ≈ 6.6 km)
 *          --out DIR    road output directory (default public/roads)
 *          --routes-out DIR  route output directory (default public/routes)
 *          --city ID    only this city (repeatable)
 *          --refresh    re-download everything
 *          --no-routes / --no-cities  skip a part
 */
import { mkdir, writeFile, readFile, access } from 'node:fs/promises';
import { join } from 'node:path';
import { CITIES } from '../src/config.js';
import { buildQuery, cellBounds, cellsAround, fetchOverpass, parseOverpass, splitIntoCells } from '../src/roads/overpass.js';
import { ROUTES, routeBBox } from '../src/race/routes.js';
import { buildGraph, routeThrough, simplify } from '../src/race/routing.js';

const args = process.argv.slice(2);
const opt = (name, def) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : def;
};
const radius = Number(opt('radius', 1));
const outDir = opt('out', 'public/roads');
const routesDir = opt('routes-out', 'public/routes');
const refresh = args.includes('--refresh');
const doCities = !args.includes('--no-cities');
const doRoutes = !args.includes('--no-routes');
const exists = (f) => access(f).then(() => true, () => false);
const only = args.flatMap((a, i) => (a === '--city' ? [args[i + 1]] : []));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function withRetry(fn, tries = 4) {
  for (let i = 1; ; i++) {
    try {
      return await fn();
    } catch (err) {
      if (i >= tries) throw err;
      const wait = [20, 45, 90][i - 1] * 1000; // rate-limit slots free up within a minute or two
      console.warn(`  retry ${i}/${tries - 1} in ${wait / 1000}s: ${err.message}`);
      await sleep(wait);
    }
  }
}

await mkdir(join(outDir, 'cells'), { recursive: true });
let manifest = { v: 1, cells: [] };
try {
  manifest = JSON.parse(await readFile(join(outDir, 'index.json'), 'utf8'));
} catch { /* first run */ }
const cells = new Set(manifest.cells);

let failures = 0;
for (const city of doCities ? CITIES : []) {
  if (only.length && !only.includes(city.id)) continue;
  const keys = cellsAround(city.lng, city.lat, radius);
  if (!refresh && keys.every((k) => cells.has(k))) {
    console.log(`${city.name}: already have ${keys.length} cells, skipping`);
    continue;
  }
  const boxes = keys.map(cellBounds);
  const bbox = {
    s: Math.min(...boxes.map((b) => b.s)), w: Math.min(...boxes.map((b) => b.w)),
    n: Math.max(...boxes.map((b) => b.n)), e: Math.max(...boxes.map((b) => b.e)),
  };
  process.stdout.write(`${city.name}: ${keys.length} cells … `);
  try {
    const json = await withRetry(() => fetchOverpass(buildQuery(bbox, 120)));
    const ways = parseOverpass(json);
    const byCell = splitIntoCells(ways, keys);
    let bytes = 0;
    for (const key of keys) {
      const body = JSON.stringify({ key, ways: byCell.get(key) || [] });
      bytes += body.length;
      await writeFile(join(outDir, 'cells', `${key}.json`), body);
      cells.add(key);
    }
    console.log(`${ways.length} roads, ${(bytes / 1024).toFixed(0)} KB`);
  } catch (err) {
    failures++;
    console.log(`FAILED (${err.message}); the game will load this city live`);
  }
  await sleep(3000); // be polite to the shared Overpass servers
}

manifest = { v: 1, generated: new Date().toISOString(), cells: [...cells].sort() };
await writeFile(join(outDir, 'index.json'), JSON.stringify(manifest));
console.log(`Roads: ${manifest.cells.length} cells in ${outDir}${failures ? ` (${failures} cities failed)` : ''}`);

// ---- Race lines
let routeFailures = 0;
if (doRoutes) await mkdir(routesDir, { recursive: true });
for (const route of doRoutes ? ROUTES : []) {
  const file = join(routesDir, `${route.id}.json`);
  if (!refresh && (await exists(file))) {
    console.log(`Route ${route.name}: already built, skipping`);
    continue;
  }
  process.stdout.write(`Route ${route.name} … `);
  try {
    const json = await withRetry(() => fetchOverpass(buildQuery(routeBBox(route), 180, route.classes)));
    const ways = parseOverpass(json);
    const { coords, length } = routeThrough(buildGraph(ways), route.waypoints, route.kind === 'circuit');
    const simple = simplify(coords, 1.5);
    await writeFile(file, JSON.stringify({ id: route.id, coords: simple, length: Math.round(length) }));
    console.log(`${(length / 1000).toFixed(1)} km, ${simple.length} points (from ${ways.length} roads)`);
  } catch (err) {
    routeFailures++;
    console.log(`FAILED (${err.message}); the game will plan it live`);
  }
  await sleep(3000);
}
if (failures || routeFailures) process.exitCode = 1;
