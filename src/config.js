/**
 * Global game configuration: map source, start locations, camera and
 * performance knobs. Everything tunable lives here so modules stay generic.
 */

/**
 * Start locations. Coordinates are central squares / main roads; Phase 2
 * snaps the spawn point to the nearest real road from OSM.
 * heading: degrees clockwise from north, roughly along the main road.
 */
export const CITIES = [
  { id: 'raipur', name: 'Raipur', hindi: 'रायपुर', lng: 81.6339, lat: 21.2376, heading: 0 },
  { id: 'bhilai', name: 'Bhilai', hindi: 'भिलाई', lng: 81.3797, lat: 21.2093, heading: 90 },
  { id: 'durg', name: 'Durg', hindi: 'दुर्ग', lng: 81.2849, lat: 21.1904, heading: 90 },
  { id: 'bilaspur', name: 'Bilaspur', hindi: 'बिलासपुर', lng: 82.1484, lat: 22.0806, heading: 0 },
  { id: 'korba', name: 'Korba', hindi: 'कोरबा', lng: 82.6862, lat: 22.3527, heading: 0 },
  { id: 'jagdalpur', name: 'Jagdalpur', hindi: 'जगदलपुर', lng: 82.0285, lat: 19.0807, heading: 0 },
];

/** Camera behaviour. Zoom falls with speed so you see further ahead. */
export const CAMERA = {
  // A 3.4 m car is ~50 px at z20.5. Vector tiles stop at z14 and are
  // over-zoomed, so high zoom costs no extra tile downloads.
  zoomStill: 20.5,
  zoomFast: 19.2,
  /** Zoom values are tuned for a ~400 px tall (phone landscape) viewport;
   *  taller screens zoom in so the car keeps the same share of the screen. */
  refViewportHeight: 400,
  /** Speed (m/s) at which zoomFast is reached. */
  zoomSpeedRef: 35,
  /** Where the car sits on screen (fraction of height from the top). */
  carScreenY: 0.64,
  /** Extra metres of look-ahead per m/s of speed. */
  lookAheadBase: 0,
  lookAheadPerMps: 0.25,
  /** How quickly the camera bearing follows the car heading (1/s). */
  bearingFollow: 5,
  modes: {
    chase: { pitch: 50, headingUp: true, label: 'Chase' },
    top: { pitch: 0, headingUp: true, label: 'Top-down' },
    north: { pitch: 0, headingUp: false, label: 'North-up' },
    driver: { pitch: 80, headingUp: true, driver: true, label: 'Driver view' },
  },
};

/** Performance limits aimed at mid-range Android phones. */
export const PERF = {
  /** Cap the canvas resolution; 3x screens at full res cost ~4x fill-rate. */
  maxPixelRatio: 1.5,
  maxTileCacheSize: 96,
  /** Physics runs at a fixed rate regardless of display refresh. */
  physicsHz: 120,
  maxStepsPerFrame: 8,
};

/** Physics conversion helper. */
export const MPS_TO_KMH = 3.6;
