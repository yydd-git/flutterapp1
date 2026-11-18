/**
 * Race routes on real Chhattisgarh roads.
 *
 * Waypoints are approximate town/junction positions. The actual race line
 * is computed by routing along OSM roads between them (see routing.js),
 * so it follows real highways even if a waypoint is a few hundred metres off.
 *
 * kind: 'p2p' (point to point, optional sprint cut) | 'circuit' (laps)
 * classes: OSM highway classes the router may use for this route
 */
const MAJOR = ['motorway', 'motorway_link', 'trunk', 'trunk_link', 'primary', 'primary_link', 'secondary', 'secondary_link'];
const RURAL = [...MAJOR, 'tertiary', 'tertiary_link', 'unclassified'];
const CITY = [...RURAL, 'residential'];

export const ROUTES = [
  {
    id: 'raipur-bhilai',
    name: 'Raipur → Bhilai',
    sub: 'NH-53 via Kumhari',
    kind: 'p2p',
    approxKm: 26,
    classes: MAJOR,
    waypoints: [
      [81.6339, 21.2376], // Raipur, Jaistambh Chowk
      [81.5862, 21.2552], // Tatibandh
      [81.5245, 21.2650], // Kumhari
      [81.3862, 21.2105], // Bhilai, Supela
    ],
  },
  {
    id: 'raipur-bilaspur',
    name: 'Raipur → Bilaspur',
    sub: 'NH-130 via Simga',
    kind: 'p2p',
    approxKm: 115,
    classes: MAJOR,
    waypoints: [
      [81.6339, 21.2376], // Raipur
      [81.6955, 21.6297], // Simga
      [82.1484, 22.0806], // Bilaspur
    ],
  },
  {
    id: 'jagdalpur-chitrakote',
    name: 'Jagdalpur → Chitrakote Falls',
    sub: 'Through Bastar via Lohandiguda',
    kind: 'p2p',
    approxKm: 40,
    classes: RURAL,
    waypoints: [
      [82.0285, 19.0807], // Jagdalpur
      [81.8790, 19.1640], // Lohandiguda
      [81.6996, 19.2058], // Chitrakote Falls
    ],
  },
  {
    id: 'raipur-circuit',
    name: 'Raipur City Circuit',
    sub: 'Jaistambh · Telibandha · Pandri loop',
    kind: 'circuit',
    approxKm: 6,
    classes: CITY,
    waypoints: [
      [81.6339, 21.2376], // Jaistambh Chowk
      [81.6560, 21.2455], // Telibandha
      [81.6525, 21.2575], // Pandri
      [81.6385, 21.2490], // back towards the centre
    ],
  },
];

export const routeById = (id) => ROUTES.find((r) => r.id === id);

/** Sprint races stop after this many metres of a point-to-point route. */
export const SPRINT_METRES = 8000;

/** Bounding box of a route's waypoints, padded (degrees). */
export function routeBBox(route, pad = 0.06) {
  const lngs = route.waypoints.map((p) => p[0]), lats = route.waypoints.map((p) => p[1]);
  return { s: Math.min(...lats) - pad, w: Math.min(...lngs) - pad, n: Math.max(...lats) + pad, e: Math.max(...lngs) + pad };
}
