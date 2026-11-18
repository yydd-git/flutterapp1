# Chhattisgarh Road Rally

A mobile-first browser driving game on the real roads of Chhattisgarh, India.
Built with MapLibre GL JS, free OpenStreetMap vector tiles from OpenFreeMap,
and plain JavaScript (Vite). No paid APIs, no keys.

> **Status: Phase 1 of 4.** The map loads, and one drivable car (the *Pocket Hatch '84*)
> works with touch, tilt and keyboard controls in six cities. Road snapping, more
> cars, traffic, races and the PWA come in later phases.

## Run locally

Requires Node.js 20.19+ (22 LTS recommended).

```bash
npm install
npm run dev        # http://localhost:5173 (also printed with your LAN IP)
```

**Test on your phone:** connect it to the same Wi-Fi and open the
`Network:` URL Vite prints, e.g. `http://192.168.1.20:5173`.
Tilt steering needs HTTPS on most phones, so test tilt on a deployed build.

```bash
npm test           # physics unit tests (Node's built-in test runner)
npm run build      # production build into dist/
npm run preview    # serve dist/ locally
```

## Controls

| Action | Touch | Keyboard |
|---|---|---|
| Accelerate | **GAS** pedal | `W` / `↑` |
| Brake / reverse (hold when stopped) | **BRAKE** pedal | `S` / `↓` |
| Steer | ◀ ▶ pads, slide stick, or tilt | `A` `D` / `←` `→` |
| Drift (handbrake) | **DRIFT** | `Space` |
| Camera (chase / top-down / north-up) | 🎥 | `C` |
| Respawn | ⟲ | `R` |
| Pause / resume | ❚❚ | `Esc` / `P` |

Pick the steering style under **Controls & settings**. Tilt uses the phone's
position when you enable it as "straight ahead".

## Deploy for free

### GitHub Pages
1. Push to `main`.
2. In the repo, go to **Settings → Pages → Build and deployment → Source: GitHub Actions**.
3. The workflow in `.github/workflows/deploy.yml` tests, builds and publishes to
   `https://<user>.github.io/<repo>/`. Re-run it from the **Actions** tab at any time.

### Netlify
- **Git:** "Add new site → Import from Git" and pick the repo. `netlify.toml` already sets
  `npm run build` and the `dist` folder.
- **Drag and drop:** run `npm run build` and drop the `dist/` folder on
  <https://app.netlify.com/drop>.

## Architecture

```
src/
  main.js            entry: grabs DOM nodes, starts Game
  game.js            main loop: fixed-step physics → camera → map render → overlay
  config.js          cities, camera, performance knobs
  core/geo.js        lng/lat ↔ local metres, math helpers
  core/settings.js   localStorage-backed settings (fails safe)
  map/mapView.js     MapLibre setup, style trimming, offline fallback
  physics/vehicle.js arcade car model (no DOM; unit-tested, reused for AI later)
  cars/carTypes.js   car specs (speed, accel, grip, weight, colours)
  cars/sprites.js    procedural top-down sprites, cached per colour
  render/overlay.js  2D canvas drawn in sync with each map frame
  input/             keyboard, touch (multi-touch pointer events), tilt, merger
  ui/                HUD speedometer, menus, top bar
```

### Why 2D sprites instead of Three.js
The map already uses most of a mid-range phone's GPU budget. A 2D canvas overlay
adds one compositing pass and one `drawImage` per vehicle. It needs no model
downloads or second WebGL context, and stays readable from a chase camera. Each
sprite is placed using three projected points (centre, 1 m forward, 1 m right),
so it rotates, scales and foreshortens correctly at any zoom, bearing or pitch.

### Performance choices
- Canvas resolution capped at 1.5× device pixels.
- 3D buildings and hillshade layers removed from the style.
- Map gestures disabled (the game owns the camera), tile fade off, small tile cache.
- Driving zoom (≈20) over-zooms z14 vector tiles, so few tiles are downloaded.
- Fixed 120 Hz physics, decoupled from the display refresh rate.
- The speedometer redraws only when the displayed number changes, and sprites are pre-rendered.

### Offline fallback
If the tile server can't be reached, the game switches to a plain ground grid so
you can still drive. Offline tile caching arrives with the PWA in Phase 4.

## Roadmap
1. ✅ Map + one drivable car in Raipur + touch controls
2. Road snapping and off-road slowdown from Overpass/OSM road data (pre-baked plus live), all four cars
3. AI traffic (auto-rickshaws, buses, trucks, cows) and race mode (checkpoints, AI, leaderboard)
4. Polish: sound, skid marks, day/night, monsoon rain, PWA offline caching

## Credits & licence
Map data © [OpenStreetMap contributors](https://www.openstreetmap.org/copyright) (ODbL).
Tiles by [OpenFreeMap](https://openfreemap.org), schema © [OpenMapTiles](https://www.openmaptiles.org/).
Rendering: [MapLibre GL JS](https://maplibre.org) (BSD-3). Game code: MIT.
