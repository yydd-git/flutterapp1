/**
 * MapLibre wrapper: creates the map with the game-city style, feeds it
 * the physics road data, and exposes a minimal camera API to the game.
 */
import { Map as MlMap, AttributionControl, setWorkerUrl } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
// MapLibre 6 looks for its worker next to its own module file, which
// doesn't exist after bundling. Ship the worker as a hashed asset instead.
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?url';
import { PERF } from '../config.js';
import { buildGameStyle, ROADS_SOURCE, ROUTE_SOURCE, TILE_ROAD_LAYERS, BUILDING_FLAT_LAYERS, BUILDING_3D_LAYERS } from './gameStyle.js';

setWorkerUrl(new URL(workerUrl, import.meta.url).href);

export class MapView {
  /**
   * @param {HTMLElement} container
   * @param {{center:[number,number], zoom:number, buildings3d?:boolean, onFallback?:()=>void}} opts
   */
  constructor(container, { center, zoom, buildings3d = false, onFallback }) {
    this.fallback = false; // true once the world tiles have failed to load
    this.onFallback = onFallback;
    this._loaded = false;
    this._pendingRoads = null;
    this._tileRoads = true;

    this.map = new MlMap({
      container,
      style: buildGameStyle({ lat: center[1], buildings3d }),
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
    // Credits come from each source in the style.
    this.map.addControl(new AttributionControl({ compact: false }), 'bottom-left');

    this.map.on('error', (e) => {
      // The style is built in code, so it always loads; an error from the
      // world tile source means we're offline. Roads (from Overpass) still
      // draw, so the game stays playable.
      const msg = String(e?.error?.message || '');
      if (!this.fallback && (e?.sourceId === 'world' || msg.includes('openfreemap'))) {
        this.fallback = true;
        console.warn('[map] World tiles unavailable:', msg);
        this.onFallback?.();
      }
    });

    this.ready = new Promise((resolve) =>
      this.map.once('load', () => {
        this._loaded = true;
        if (this._pendingRoads) this.setRoads(this._pendingRoads);
        this.setTileRoadsVisible(this._tileRoads, true);
        resolve();
      })
    );
  }

  /** Replace the drawn game roads (GeoJSON features from the road network). */
  setRoads(features) {
    if (!this._loaded) {
      this._pendingRoads = features;
      return;
    }
    this._pendingRoads = null;
    this.map.getSource(ROADS_SOURCE)?.setData({ type: 'FeatureCollection', features });
  }

  /** Draw the race line ([lng, lat] list), or clear it with null. */
  setRoute(coords) {
    if (!this._loaded) {
      this.ready.then(() => this.setRoute(coords));
      return;
    }
    const features = coords ? [{ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: coords } }] : [];
    this.map.getSource(ROUTE_SOURCE)?.setData({ type: 'FeatureCollection', features });
  }

  /** Show the tiles' generic roads (used where real road data isn't loaded yet). */
  setTileRoadsVisible(visible, force = false) {
    if (visible === this._tileRoads && !force) return;
    this._tileRoads = visible;
    if (!this._loaded) return;
    for (const id of TILE_ROAD_LAYERS) this.map.setLayoutProperty(id, 'visibility', visible ? 'visible' : 'none');
  }

  /** Flat roofs with shadows (fast) or extruded 3D blocks. */
  setBuildings3d(on) {
    if (!this._loaded) {
      this.ready.then(() => this.setBuildings3d(on));
      return;
    }
    for (const id of BUILDING_FLAT_LAYERS) this.map.setLayoutProperty(id, 'visibility', on ? 'none' : 'visible');
    for (const id of BUILDING_3D_LAYERS) this.map.setLayoutProperty(id, 'visibility', on ? 'visible' : 'none');
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
