#!/usr/bin/env node
/**
 * Pre-bake OSM road data for the start cities (the "hybrid" part of road
 * loading). For each city it makes ONE Overpass query covering a block of
 * cells around the centre, splits the result into per-cell JSON files and
 * writes a manifest:
 *
 *   public/roads/index.json          { v, generated, cells: [...] }
 *   public/roads/cells/<key>.json    { key, ways: [...] }
 *
 * The game loads these first and falls back to live Overpass elsewhere.
 * Run locally with `npm run fetch-roads`; CI runs it before every deploy.
 *
 * Options: --radius N   cells around each city centre (default 1 → 3×3 ≈ 6.6 km)
 *          --out DIR    output directory (default public/roads)
 *          --city ID    only this city (repeatable)
 */
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { CITIES } from '../src/config.js';
import { buildQuery, cellBounds, cellsAround, fetchOverpass, parseOverpass, splitIntoCells } from '../src/roads/overpass.js';

const args = process.argv.slice(2);
const opt = (name, def) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : def;
};
const radius = Number(opt('radius', 1));
const outDir = opt('out', 'public/roads');
const only = args.flatMap((a, i) => (a === '--city' ? [args[i + 1]] : []));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function withRetry(fn, tries = 3) {
  for (let i = 1; ; i++) {
    try {
      return await fn();
    } catch (err) {
      if (i >= tries) throw err;
      console.warn(`  retry ${i}/${tries - 1} after error: ${err.message}`);
      await sleep(15000 * i); // Overpass rate limits recover in seconds to a minute
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
for (const city of CITIES) {
  if (only.length && !only.includes(city.id)) continue;
  const keys = cellsAround(city.lng, city.lat, radius);
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
console.log(`Wrote ${manifest.cells.length} cells to ${outDir}${failures ? ` (${failures} cities failed)` : ''}`);
