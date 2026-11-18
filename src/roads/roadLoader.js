/**
 * Hybrid road loader (browser).
 *
 * 1. Pre-baked: `roads/index.json` lists cells that the build fetched from
 *    Overpass (city cores). Those load as small static JSON files: fast,
 *    reliable, and cacheable offline later.
 * 2. Live: any other cell is fetched from Overpass, one request at a time
 *    so the public servers aren't hammered. Failures back off for 30 s.
 *
 * Results are cached in memory by cell key.
 */
import { buildQuery, cellBounds, fetchOverpass, parseOverpass } from './overpass.js';

const RETRY_AFTER_MS = 30000;

export class RoadLoader {
  /** @param {string} base URL prefix of the pre-baked data, e.g. './roads/' */
  constructor(base = './roads/') {
    this.base = base;
    this.cache = new Map(); // key -> ways[]
    this.pending = new Map(); // key -> Promise<ways[]>
    this.failedAt = new Map(); // key -> timestamp
    this._chain = Promise.resolve(); // serialises live Overpass requests
    this.liveCount = 0;
    this.manifest = fetch(this.base + 'index.json')
      .then((r) => (r.ok ? r.json() : null))
      .then((m) => new Set(m?.cells || []))
      .catch(() => new Set());
  }

  /** True if a fetch for this cell is in flight. */
  isPending(key) {
    return this.pending.has(key);
  }

  /** True if this cell recently failed and is waiting to retry. */
  isBackingOff(key) {
    const t = this.failedAt.get(key);
    return t !== undefined && performance.now() - t < RETRY_AFTER_MS;
  }

  /**
   * Get the ways for a cell, loading if needed. Resolves to null on failure
   * (the caller simply treats that area as unknown).
   */
  load(key) {
    if (this.cache.has(key)) return Promise.resolve(this.cache.get(key));
    if (this.pending.has(key)) return this.pending.get(key);
    if (this.isBackingOff(key)) return Promise.resolve(null);

    const p = (async () => {
      try {
        const manifest = await this.manifest;
        const ways = manifest.has(key) ? await this._prebaked(key) : await this._live(key);
        this.cache.set(key, ways);
        this.failedAt.delete(key);
        return ways;
      } catch (err) {
        console.warn(`[roads] cell ${key} failed:`, err.message);
        this.failedAt.set(key, performance.now());
        return null;
      } finally {
        this.pending.delete(key);
      }
    })();
    this.pending.set(key, p);
    return p;
  }

  async _prebaked(key) {
    const res = await fetch(`${this.base}cells/${key}.json`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return (await res.json()).ways;
  }

  _live(key) {
    // Chain so only one Overpass request runs at a time.
    const run = this._chain.then(async () => {
      this.liveCount++;
      const json = await fetchOverpass(buildQuery(cellBounds(key)));
      return parseOverpass(json);
    });
    this._chain = run.catch(() => {});
    return run;
  }
}
