# Chhattisgarh Road Rally

A mobile-first browser driving game on the real roads of Chhattisgarh, India.
Built with MapLibre GL JS, free OpenStreetMap vector tiles from OpenFreeMap,
and plain JavaScript (Vite). No paid APIs, no keys.

> **Status: Phase 2 of 4.** Drive four classic-inspired cars on real OpenStreetMap roads
> in six cities. You spawn on the road, road names show as you drive, and road edges,
> off-road grip and damage all work. Traffic, races and the PWA come in later phases.

**Play:** https://yydd-git.github.io/flutterapp1/

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
npm run fetch-roads  # optional: pre-bake city road data from Overpass into public/roads/
npm test           # physics and road unit tests (Node's built-in test runner)
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

Pick the steering style and **Road edges** (*Stay near roads* or *Drive anywhere*)
under **Controls & settings**. Tilt uses the phone's
position when you enable it as "straight ahead".

## Look

The real world is drawn in an original, cartoon-style "game city" look (`src/map/gameStyle.js`) instead of
a map style:
- **Roads** are drawn from the same OSM road data the physics uses, with pavements, asphalt,
  white edge lines and a yellow or white dashed centre line, all at real widths in metres. The road
  you see is exactly where the road edges are.
- **The rest of the world** comes from OpenFreeMap vector tiles, restyled: coloured rooftops with drop
  shadows (or 3D blocks under **Controls & settings → Buildings**), turquoise water, paddy-green
  farmland, parks, railways, and a few landmark names. There are no map labels or shop icons.
- Before a road cell's data arrives, the tiles' own roads show as plain asphalt.

## Cars

| Car | Inspired by | Character |
|---|---|---|
| Pocket Hatch '84 | 1980s small hatchback | Light and nimble, ~110 km/h, average toughness |
| Raj Sedan '68 | Classic rounded sedan | Heavy and slow to accelerate, ~105 km/h, very tough |
| Ghat Jeep | Boxy 4x4 | ~90 km/h, keeps its grip off-road and can roam ~45 m off the tarmac |
| Rani Roadster '58 | 1950s open two-seater | ~165 km/h with sharp handling, but fragile and poor in dirt |

All are original designs, with no real brand names or logos. Menu stat bars are calculated from the physics specs.

## Real roads (hybrid loading)

The world is split into ~2 km cells (0.02°).
1. **Pre-baked:** `npm run fetch-roads` makes one Overpass query per start city and writes
   per-cell JSON to `public/roads/`. The GitHub Pages workflow runs this before every
   deploy, so city centres load instantly from static files.
2. **Live:** anywhere else, the game fetches cells from the
   [Overpass API](https://overpass-api.de) in the browser, one request at a time and
   with a mirror fallback, as you drive towards them.

The road data drives the physics:
- **Spawn and respawn** snap to the nearest major road, in the left lane and facing along the road.
- **Road edges:** on the tarmac you get full grip, and OSM unpaved or dirt roads have less. Each car has
  a verge (how far it can go off the road) with its own off-road penalty. Beyond the verge you hit
  a wall and take damage based on impact speed and the car's toughness. At 100% damage the car is
  towed back to the road.
- **HUD:** the top bar shows the current road's reference number and name, e.g. `NH53 · GE Road`.
- **Offline:** if map tiles can't load, the game draws the OSM roads itself.
- **Debug:** add `?debug` to the URL to outline the physics roads on top of the map tiles.

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
  physics/roadConstraint.js  surfaces, verges, wall collisions
  roads/overpass.js  cells, Overpass query/parse (shared by browser + Node script)
  roads/roadNetwork.js  spatial grid index: nearest road edge, spawn snapping
  roads/roadLoader.js   pre-baked cells first, live Overpass fallback
  cars/carTypes.js   4 car specs (speed, accel, grip, weight, off-road, toughness, colours)
  cars/sprites.js    procedural top-down sprites, cached per colour
  render/overlay.js  2D canvas drawn in sync with each map frame
  input/             keyboard, touch (multi-touch pointer events), tilt, merger
  ui/                HUD speedometer + damage, menus, car picker, top bar
scripts/fetch-roads.mjs  build-time road pre-fetch
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
2. ✅ Road snapping, road edges and off-road behaviour from OSM data (pre-baked plus live), all four cars
3. AI traffic (auto-rickshaws, buses, trucks, cows) and race mode (checkpoints, AI, leaderboard)
4. Polish: sound, skid marks, day/night, monsoon rain, PWA offline caching

## Credits & licence
Map data © [OpenStreetMap contributors](https://www.openstreetmap.org/copyright) (ODbL).
Tiles by [OpenFreeMap](https://openfreemap.org), schema © [OpenMapTiles](https://www.openmaptiles.org/).
Rendering: [MapLibre GL JS](https://maplibre.org) (BSD-3). Game code: MIT.
