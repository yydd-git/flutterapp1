# Chhattisgarh Road Rally

A mobile-first browser driving game on the real roads of Chhattisgarh, India.
Built with MapLibre GL JS, free OpenStreetMap vector tiles from OpenFreeMap,
and plain JavaScript (Vite). No paid APIs, no keys.

> **Status: Phase 3 of 4.** Drive four classic-inspired cars on real OpenStreetMap roads
> in six cities, among auto-rickshaws, buses, trucks and roadside cows. Race AI opponents or the clock
> on real routes (Raipur → Bhilai on NH-53, Raipur → Bilaspur, Jagdalpur → Chitrakote Falls) or a
> Raipur city circuit. Sound, effects and the installable PWA come in Phase 4.

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
| Camera (chase / top-down / north-up / driver view) | 🎥 | `C` |
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

## Driver view

Tap 🎥 (or press `C`) until **Driver view** for an in-car camera, about 1 m above the road at the
driver's seat. In this view:
- **The world:** you see a sky and horizon, the road ahead with its lane markings, and your own bonnet in
  your car's colour.
- **The cockpit:** a dashboard and a right-hand-drive steering wheel that turns as you steer.
- **3D blocks:** traffic, opponents, cows and checkpoint arches are drawn as low-poly 3D blocks
  (`src/render/boxes.js`), so they stand up from the road instead of lying flat.
- **The speedometer** moves down onto the dashboard.

MapLibre's camera is placed at the driver's eye: the zoom is chosen so that the camera's distance from
the map centre equals `eye height ÷ cos(pitch)`.

## Traffic

Auto-rickshaws, buses, trucks and cows (`src/ai/traffic.js`) use the real road graph around you:
- **Vehicles** keep left and mostly go straight on at junctions. They follow one-way streets, slow for bends,
  and brake and honk for anything in their lane, cows included.
- **Cows** stand at the roadside or amble across. They trot off if you nudge them.
- **Spawning:** vehicles appear out of sight 110–280 m away and are recycled beyond 360 m, from a fixed
  pool of 28. This keeps the roads busy for little CPU.
- **Collisions** exchange momentum by mass: a truck barely notices you, a rickshaw gets shoved.
- **Density:** choose under **Controls & settings → Traffic** (Empty roads / Normal / Busy bazaar).

## Race mode

Tap **Race** and pick a route:

| Route | Type | Length |
|---|---|---|
| Raipur → Bhilai (NH-53 via Kumhari) | point to point | ~26 km, or an 8 km Sprint |
| Raipur → Bilaspur (NH-130 via Simga) | point to point | ~115 km, or an 8 km Sprint |
| Jagdalpur → Chitrakote Falls (via Lohandiguda) | point to point | ~40 km, or an 8 km Sprint |
| Raipur City Circuit | laps (2, 3 or 5) | ~6 km lap |

- **The race line** follows real roads. It's calculated with A* over OSM roads between the route's
  waypoints, so it follows the actual highways, and one-way carriageways keep it on the left
  (`src/race/routing.js`). The deploy pre-builds each line into `public/routes/`. If a line is missing,
  the game downloads that area from Overpass and plans the route in your browser, then saves it on
  your device.
- **Checkpoints** are gates across the road, and the last one is the chequered finish. Progress is
  measured along the race line, so cutting corners doesn't skip gates.
- **AI opponents** (3, or a solo Time trial) drive the line in their own cars. They brake before bends,
  overtake traffic on the right and adjust their pace to keep races close (`src/ai/racers.js`).
- **HUD:** race position, lap or distance to go, checkpoint count and timer, a 3-2-1-GO countdown,
  an off-route warning (tap ⟲ to return to the line), and a results table.
- **Leaderboard:** the best times per route and length are saved on your device (localStorage).

**Mini-map** (top right, in every mode): a heading-up view of nearby roads, the race line, the next
checkpoint, opponents and traffic.

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
   deploy and keeps the results between runs, so it only fetches what's missing. That matters
   because the public Overpass servers often rate-limit GitHub's shared build machines.
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
  physics/collide.js circle-chain vehicle collisions with mass exchange
  ai/traffic.js      pooled traffic agents on the road graph
  ai/racers.js       race opponents: corner planning, overtaking, rubber-banding
  race/routes.js     route definitions (waypoints, road classes)
  race/routing.js    road graph + A* + simplification (browser and Node)
  race/routePath.js  resampled race line: lookups, windowed projection, corner radii
  race/raceManager.js grid → countdown → racing → results
  race/leaderboard.js best times in localStorage
  roads/overpass.js  cells, Overpass query/parse (shared by browser + Node script)
  roads/roadNetwork.js  spatial grid index: nearest road edge, spawn snapping
  roads/roadLoader.js   pre-baked cells first, live Overpass fallback
  cars/carTypes.js   4 car specs (speed, accel, grip, weight, off-road, toughness, colours)
  cars/sprites.js    procedural top-down sprites, cached per colour
  render/overlay.js  2D canvas drawn in sync with each map frame
  render/boxes.js    low-poly 3D blocks and cockpit for the Driver view
  input/             keyboard, touch (multi-touch pointer events), tilt, merger
  ui/                HUD speedometer + damage, mini-map, race HUD, menus, top bar
scripts/fetch-roads.mjs  build-time pre-fetch of city roads and race lines (incremental)
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
3. ✅ AI traffic (auto-rickshaws, buses, trucks, cows) and race mode (checkpoints, AI, leaderboard, mini-map)
4. Polish: sound, skid marks, day/night, monsoon rain, PWA offline caching

## Credits & licence
Map data © [OpenStreetMap contributors](https://www.openstreetmap.org/copyright) (ODbL).
Tiles by [OpenFreeMap](https://openfreemap.org), schema © [OpenMapTiles](https://www.openmaptiles.org/).
Rendering: [MapLibre GL JS](https://maplibre.org) (BSD-3). Game code: MIT.
