/**
 * MapLibre wrapper: creates the map, trims the style for mobile
 * performance, falls back to a plain offline style if tiles are
 * unreachable, and exposes a minimal camera API to the game.
 */
import { Map as MlMap, AttributionControl, setWorkerUrl } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
// MapLibre 6 looks for its worker next to its own module file, which
// doesn't exist after bundling. Ship the worker as a hashed asset instead.
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?url';
import { MAP_STYLE_URL, ATTRIBUTION, PERF } from '../config.js';

/** Plain land-coloured style used when the tile server can't be reached. */
const FALLBACK_STYLE = {
  version: 8,
  sources: {},
  layers: [{ id: 'bg', type: 'background', paint: { 'background-color': '#d9dcc6' } }],
};

/** Layers that cost a lot on mobile GPUs and add little from a chase cam. */
const DROP_LAYER_TYPES = new Set(['fill-extrusion', 'hillshade', 'heatmap']);

setWorkerUrl(new URL(workerUrl, import.meta.url).href);

export class MapView {
  /**
   * @param {HTMLElement} container
   * @param {{center:[number,number], zoom:number, onFallback?:()=>void}} opts
   */
  constructor(container, { center, zoom, onFallback }) {
    this.fallback = false;
    this.onFallback = onFallback;
    this._styleLoaded = false;

    this.map = new MlMap({
      container,
      style: MAP_STYLE_URL,
      center,
      zoom,
      pitch: 0,
      bearing: 0,
      maxPitch: 60,
      maxZoom: 22,
      // The game owns the camera: disable every user gesture so touches on
      // the pedals never pan or zoom the map.
      dragPan: false,
      dragRotate: false,
      scrollZoom: false,
      boxZoom: false,
      keyboard: false,
      doubleClickZoom: false,
      touchZoomRotate: false,
      touchPitch: false,
      // Performance
      pixelRatio: Math.min(window.devicePixelRatio || 1, PERF.maxPixelRatio),
      maxTileCacheSize: PERF.maxTileCacheSize,
      fadeDuration: 0,
      renderWorldCopies: false,
      validateStyle: false,
      refreshExpiredTiles: false,
      canvasContextAttributes: { antialias: false, powerPreference: 'high-performance' },
      attributionControl: false,
    });

    // Attribution is always expanded: the OSM licence requires it visible.
    this.map.addControl(
      new AttributionControl({ compact: false, customAttribution: ATTRIBUTION }),
      'bottom-left'
    );

    this.map.on('style.load', () => {
      this._styleLoaded = true;
      if (!this.fallback) this._trimStyle();
    });
    this.map.on('error', (e) => {
      // Before the style arrives, any error means the style or tile server
      // is unreachable. Switch to the offline style so the game still runs.
      if (!this._styleLoaded) this._useFallback(e?.error?.message);
    });
    this._fallbackTimer = setTimeout(() => {
      if (!this._styleLoaded) this._useFallback('timeout');
    }, 10000);

    this.ready = new Promise((resolve) => this.map.once('load', resolve));
  }

  _useFallback(reason) {
    if (this.fallback) return;
    console.warn('[map] Tiles unavailable, using offline style:', reason);
    clearTimeout(this._fallbackTimer);
    this.fallback = true;
    this.map.setStyle(FALLBACK_STYLE);
    this.onFallback?.();
  }

  /** Remove expensive layers from the downloaded style. */
  _trimStyle() {
    clearTimeout(this._fallbackTimer);
    const style = this.map.getStyle();
    for (const layer of style.layers) {
      if (DROP_LAYER_TYPES.has(layer.type)) this.map.removeLayer(layer.id);
    }
  }

  /**
   * Move the camera instantly (called once per frame by the game).
   * `screenY` (0..1) is where `center` appears vertically, done with top
   * padding so it works at any screen size or zoom.
   */
  setCamera(center, bearingDeg, zoom, pitch, screenY = 0.5) {
    const h = this.map.getContainer().clientHeight;
    const top = Math.max(0, (2 * screenY - 1) * h);
    this._padding ??= { top: 0, bottom: 0, left: 0, right: 0 };
    this._padding.top = top;
    this.map.jumpTo({ center, bearing: bearingDeg, zoom, pitch, padding: this._padding });
  }

  /** lng/lat → CSS pixels in the map container. */
  project(lngLat) {
    return this.map.project(lngLat);
  }

  /** Ask MapLibre to render a frame even if the camera didn't change. */
  repaint() {
    this.map.triggerRepaint();
  }

  /** Fires after every map frame, in sync with what's on screen. */
  onRender(fn) {
    this.map.on('render', fn);
  }
}
