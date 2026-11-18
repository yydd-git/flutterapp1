/**
 * "Game city" map style: an original, cartoon-style look for the real
 * world, made to feel like a top-down arcade game rather than a map.
 *
 * - The base world (land use, water, parks, buildings, rail) comes from the
 *   free OpenFreeMap vector tiles, restyled in a bright palette with no
 *   shop icons or map labels.
 * - Roads are drawn from the SAME OpenStreetMap data the physics uses
 *   (a GeoJSON source filled from Overpass), so what you see is exactly
 *   where the road edges are: pavement, asphalt, edge lines and a dashed
 *   centre line, with widths in real metres.
 * - Until a cell's road data arrives, the vector tiles' own roads are shown
 *   as plain asphalt so the world never looks empty.
 */

export const ROADS_SOURCE = 'game-roads';
export const ROUTE_SOURCE = 'race-route';
export const TILE_ROAD_LAYERS = ['tile-road-casing', 'tile-road'];
export const BUILDING_FLAT_LAYERS = ['building-shadow', 'building-roof', 'building-edge'];
export const BUILDING_3D_LAYERS = ['building-3d'];

/** Palette: sunny central India. Lush paddy greens, dusty towns, warm roofs. */
export const PALETTE = {
  ground: '#a7c47c',
  farmland: '#bfd283',
  grass: '#86b85c',
  wood: '#5a9142',
  town: '#d8cdb3',
  commercial: '#e2c8a4',
  industrial: '#c5bcb0',
  sand: '#e5d39f',
  water: '#36b3c9',
  waterEdge: '#2a8ea3',
  pavement: '#dcd7cb',
  kerb: '#a9a395',
  asphalt: '#45484e',
  asphaltMajor: '#3b3e44',
  dirt: '#b48f5b',
  laneWhite: '#f4f2ea',
  laneYellow: '#f2c230',
  rail: '#6d5f55',
  roofs: ['#c96f4a', '#e8dcc2', '#e3a59c', '#9fd0bd', '#9fc2e3', '#d9a441', '#b9a6d6'],
  shadow: 'rgba(30, 36, 20, 0.35)',
  label: '#ffffff',
  labelHalo: 'rgba(25, 28, 34, 0.85)',
};

const ATTR_OSM = '<a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">© OpenStreetMap contributors</a>';

/**
 * Expression for a width (or offset) of `metres` metres at any zoom.
 * Map pixels per metre double every zoom level, so an exponential-2
 * interpolation between two zooms is exact.
 * @param {number} lat latitude (metres per pixel depends on it)
 * @param {any} metres number or expression
 */
export function metres(lat, metres) {
  const pxPerM = (z) => (512 * 2 ** z) / (40075016.686 * Math.cos((lat * Math.PI) / 180));
  return ['interpolate', ['exponential', 2], ['zoom'], 12, ['*', metres, pxPerM(12)], 22, ['*', metres, pxPerM(22)]];
}

/**
 * Build the full style. `lat` is the start city's latitude (for metre
 * widths; within Chhattisgarh it varies by < 3%).
 */
export function buildGameStyle({ lat, buildings3d = false }) {
  const P = PALETTE;
  const W = (m) => metres(lat, m);
  const half = ['get', 'h'];
  const isMajor = ['>=', ['get', 'rank'], 3];
  const roofColour = [
    'match',
    ['%', ['+', ['to-number', ['id'], 0], ['round', ['to-number', ['get', 'render_height'], 0]]], P.roofs.length],
    ...P.roofs.slice(1).flatMap((c, i) => [i + 1, c]),
    P.roofs[0],
  ];
  const vis = (on) => ({ visibility: on ? 'visible' : 'none' });

  return {
    version: 8,
    name: 'Chhattisgarh Road Rally',
    glyphs: 'https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf',
    // Sky and haze for the near-level Driver view (hidden at lower pitch)
    sky: {
      'sky-color': '#8fc6ea',
      'horizon-color': '#f4e6c8',
      'fog-color': '#e9e2cc',
      'sky-horizon-blend': 0.6,
      'horizon-fog-blend': 0.7,
      'fog-ground-blend': 0.75,
      'atmosphere-blend': 0,
    },
    sources: {
      world: {
        type: 'vector',
        url: 'https://tiles.openfreemap.org/planet',
        attribution:
          '<a href="https://openfreemap.org" target="_blank" rel="noopener">OpenFreeMap</a> ' +
          '<a href="https://www.openmaptiles.org/" target="_blank" rel="noopener">© OpenMapTiles</a> ' +
          ATTR_OSM,
      },
      [ROADS_SOURCE]: {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
        // OSM credit here too, so it stays visible even if the world tiles fail.
        attribution: 'Roads ' + ATTR_OSM + ' via <a href="https://overpass-api.de" target="_blank" rel="noopener">Overpass</a>',
        buffer: 64,
        tolerance: 0.2,
      },
      [ROUTE_SOURCE]: { type: 'geojson', data: { type: 'FeatureCollection', features: [] } },
    },
    layers: [
      { id: 'ground', type: 'background', paint: { 'background-color': P.ground } },

      /* ---------- land use & cover ---------- */
      {
        id: 'landuse', type: 'fill', source: 'world', 'source-layer': 'landuse',
        paint: {
          'fill-color': ['match', ['get', 'class'],
            ['residential', 'suburb', 'neighbourhood', 'quarter'], P.town,
            ['commercial', 'retail'], P.commercial,
            ['industrial', 'railway', 'garages', 'quarry'], P.industrial,
            ['cemetery', 'pitch', 'stadium', 'playground'], P.grass,
            P.town],
        },
      },
      {
        id: 'landcover', type: 'fill', source: 'world', 'source-layer': 'landcover',
        paint: {
          'fill-color': ['match', ['get', 'class'],
            'farmland', P.farmland, 'wood', P.wood, 'grass', P.grass,
            'wetland', P.grass, 'sand', P.sand, P.grass],
          'fill-opacity': ['match', ['get', 'class'], 'farmland', 0.8, 1],
        },
      },
      { id: 'park', type: 'fill', source: 'world', 'source-layer': 'park', paint: { 'fill-color': P.grass } },

      /* ---------- water ---------- */
      {
        id: 'waterway', type: 'line', source: 'world', 'source-layer': 'waterway',
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: { 'line-color': P.water, 'line-width': W(['match', ['get', 'class'], 'river', 30, 'canal', 12, 4]) },
      },
      {
        id: 'water', type: 'fill', source: 'world', 'source-layer': 'water',
        paint: { 'fill-color': P.water, 'fill-outline-color': P.waterEdge },
      },

      /* ---------- base roads from tiles (until real data loads) ---------- */
      {
        id: 'tile-road-casing', type: 'line', source: 'world', 'source-layer': 'transportation',
        filter: ['match', ['get', 'class'], ['motorway', 'trunk', 'primary', 'secondary', 'tertiary', 'minor', 'track'], true, false],
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: { 'line-color': P.pavement, 'line-width': W(['match', ['get', 'class'], ['motorway', 'trunk', 'primary'], 19, ['secondary', 'tertiary'], 15, 10]) },
      },
      {
        id: 'tile-road', type: 'line', source: 'world', 'source-layer': 'transportation',
        filter: ['match', ['get', 'class'], ['motorway', 'trunk', 'primary', 'secondary', 'tertiary', 'minor', 'track'], true, false],
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: {
          'line-color': ['match', ['get', 'class'], 'track', P.dirt, P.asphalt],
          'line-width': W(['match', ['get', 'class'], ['motorway', 'trunk', 'primary'], 16, ['secondary', 'tertiary'], 12, 8]),
        },
      },

      /* ---------- railways ---------- */
      {
        id: 'rail', type: 'line', source: 'world', 'source-layer': 'transportation',
        filter: ['==', ['get', 'class'], 'rail'],
        paint: { 'line-color': P.rail, 'line-width': W(3) },
      },
      {
        id: 'rail-ties', type: 'line', source: 'world', 'source-layer': 'transportation',
        filter: ['==', ['get', 'class'], 'rail'],
        paint: { 'line-color': P.rail, 'line-width': W(5), 'line-dasharray': [0.25, 0.75] },
      },

      /* ---------- game roads (exactly the physics roads) ---------- */
      {
        id: 'road-pavement', type: 'line', source: ROADS_SOURCE,
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: { 'line-color': ['case', ['get', 'u'], P.sand, P.pavement], 'line-width': W(['+', ['*', half, 2], 3.5]) },
      },
      {
        id: 'road-kerb', type: 'line', source: ROADS_SOURCE,
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        filter: ['!', ['get', 'u']],
        paint: { 'line-color': P.kerb, 'line-width': W(['+', ['*', half, 2], 0.6]) },
      },
      {
        id: 'road-asphalt', type: 'line', source: ROADS_SOURCE,
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: {
          'line-color': ['case', ['get', 'u'], P.dirt, isMajor, P.asphaltMajor, P.asphalt],
          'line-width': W(['*', half, 2]),
        },
      },
      ...[1, -1].map((side) => ({
        id: `road-edge-${side > 0 ? 'r' : 'l'}`, type: 'line', source: ROADS_SOURCE,
        filter: ['all', isMajor, ['!', ['get', 'u']]],
        paint: { 'line-color': P.laneWhite, 'line-width': W(0.18), 'line-offset': W(['*', ['-', half, 0.7], side]), 'line-opacity': 0.85 },
      })),
      {
        id: 'road-centre', type: 'line', source: ROADS_SOURCE,
        filter: ['all', ['!', ['get', 'u']], ['!', ['get', 'o']], ['>=', half, 4.5]],
        paint: {
          'line-color': ['case', isMajor, P.laneYellow, P.laneWhite],
          'line-width': W(0.2),
          'line-dasharray': [14, 22],
        },
      },

      /* ---------- race line (only during races) ---------- */
      {
        id: 'race-line-glow', type: 'line', source: ROUTE_SOURCE,
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: { 'line-color': '#ff9933', 'line-opacity': 0.14, 'line-width': W(3.5) },
      },
      {
        id: 'race-line', type: 'line', source: ROUTE_SOURCE,
        layout: { 'line-cap': 'butt', 'line-join': 'round' },
        paint: { 'line-color': '#ff9933', 'line-opacity': 0.7, 'line-width': W(0.5), 'line-dasharray': [6, 6] },
      },

      /* ---------- buildings ---------- */
      {
        id: 'building-shadow', type: 'fill', source: 'world', 'source-layer': 'building', minzoom: 14,
        layout: vis(!buildings3d),
        paint: { 'fill-color': P.shadow, 'fill-translate': [5, 5], 'fill-translate-anchor': 'viewport' },
      },
      {
        id: 'building-roof', type: 'fill', source: 'world', 'source-layer': 'building', minzoom: 14,
        layout: vis(!buildings3d),
        paint: { 'fill-color': roofColour },
      },
      {
        id: 'building-edge', type: 'line', source: 'world', 'source-layer': 'building', minzoom: 16,
        layout: vis(!buildings3d),
        paint: { 'line-color': 'rgba(0,0,0,0.25)', 'line-width': 1 },
      },
      {
        id: 'building-3d', type: 'fill-extrusion', source: 'world', 'source-layer': 'building', minzoom: 15,
        layout: vis(buildings3d),
        paint: {
          'fill-extrusion-color': roofColour,
          'fill-extrusion-height': ['coalesce', ['get', 'render_height'], 6],
          'fill-extrusion-base': ['coalesce', ['get', 'render_min_height'], 0],
          'fill-extrusion-vertical-gradient': true,
        },
      },

      /* ---------- labels: road names and a few landmarks ---------- */
      {
        id: 'road-names', type: 'symbol', source: ROADS_SOURCE, minzoom: 16,
        filter: ['has', 'label'],
        layout: {
          'symbol-placement': 'line',
          'text-field': ['get', 'label'],
          'text-font': ['Noto Sans Bold'],
          'text-size': 13,
          'text-letter-spacing': 0.05,
          'symbol-spacing': 400,
          'text-max-angle': 30,
        },
        paint: { 'text-color': P.label, 'text-halo-color': P.labelHalo, 'text-halo-width': 1.6 },
      },
      {
        id: 'landmarks', type: 'symbol', source: 'world', 'source-layer': 'poi', minzoom: 15,
        filter: ['all', ['has', 'name'], ['<=', ['to-number', ['get', 'rank'], 99], 6],
          ['match', ['get', 'class'], ['place_of_worship', 'railway', 'stadium', 'attraction', 'park', 'college', 'hospital', 'museum', 'town_hall', 'monument'], true, false]],
        layout: {
          'text-field': ['get', 'name'],
          'text-font': ['Noto Sans Bold'],
          'text-size': 12,
          'text-transform': 'uppercase',
          'text-letter-spacing': 0.08,
          'text-max-width': 8,
        },
        paint: { 'text-color': '#fff4d6', 'text-halo-color': 'rgba(120, 52, 20, 0.85)', 'text-halo-width': 1.8 },
      },
    ],
  };
}

/** Convert compact ways (overpass.js format) to GeoJSON features for the road layers. */
export function waysToFeatures(ways, halfWidth, rankOf, labelOf) {
  return ways.map((w) => {
    const coords = [];
    for (let k = 0; k < w.c.length; k += 2) coords.push([w.c[k], w.c[k + 1]]);
    const props = { h: halfWidth(w), rank: rankOf(w), u: !!w.u, o: !!w.o };
    const label = labelOf(w);
    if (label) props.label = label;
    return { type: 'Feature', id: w.id, properties: props, geometry: { type: 'LineString', coordinates: coords } };
  });
}
