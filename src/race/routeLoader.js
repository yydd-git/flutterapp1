/**
 * Get a race line for a route (browser).
 *   1. Pre-baked `routes/<id>.json` from the build (instant)
 *   2. Cached copy in localStorage from an earlier live download
 *   3. Live: download the route's area from Overpass and route it here
 */
import { buildQuery, fetchOverpass, parseOverpass } from '../roads/overpass.js';
import { buildGraph, routeThrough, simplify } from './routing.js';
import { routeBBox } from './routes.js';

const cacheKey = (id) => `cgrr.route.${id}.v1`;

/** @returns {Promise<{id:string, coords:number[][], length:number}>} */
export async function loadRoute(route, onStatus = () => {}) {
  try {
    const res = await fetch(`./routes/${route.id}.json`);
    if (res.ok) {
      const data = await res.json(); // dev servers may answer with HTML: throws
      if (data?.coords?.length > 1) return data;
    }
  } catch { /* not pre-baked */ }

  try {
    const cached = JSON.parse(localStorage.getItem(cacheKey(route.id)) || 'null');
    if (cached?.coords?.length > 1) return cached;
  } catch { /* storage unavailable */ }

  onStatus('Downloading the roads for this route…');
  const json = await fetchOverpass(buildQuery(routeBBox(route), 90, route.classes));
  onStatus('Planning the race line…');
  await new Promise((r) => setTimeout(r, 0)); // let the status paint
  const { coords, length } = routeThrough(buildGraph(parseOverpass(json)), route.waypoints, route.kind === 'circuit');
  const data = { id: route.id, coords: simplify(coords, 1.5), length };
  try {
    localStorage.setItem(cacheKey(route.id), JSON.stringify(data));
  } catch { /* too big or blocked: fine, just not cached */ }
  return data;
}
