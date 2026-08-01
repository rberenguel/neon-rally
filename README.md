# Neon Rally

A browser-based top-down arcade racer built with PixiJS. Drift-heavy physics inspired by Gene Rally, procedural tracks, shareable track IDs and challenge URLs, AI opponents that learn from their mistakes, and touch support for mobile.

Installable as a PWA on Android and iOS.

[Play it](#) — or paste a track hash like `#track=X7kP9m` to race a specific circuit.

---

## Quick Start

```bash
# Serve with any static file server
npx serve .
# or
python3 -m http.server 8080
```

Open `http://localhost:8080`. The animated splash screen plays first — press any key or tap to start. Click **OK** on the controls overlay to begin racing.

---

## Controls

### Keyboard

| Key | Action |
|---|---|
| `↑` / `↓` | Gas / Brake |
| `←` / `→` | Steer |
| `Z` | Activate held powerup / advance to next race |
| `Space` / `Esc` | Pause |
| `D` | Toggle debug panel |

### Gamepad

| Input | Action |
|---|---|
| Right stick (axis 2) | Steer |
| `B` (button 1) | Gas |
| `X` (button 3) | Brake |
| `Y` (button 2) | Activate held powerup / advance to next race |
| `Start` (button 9) | Pause |

Controls can be remapped in the **Controls** overlay (click any action, then press the desired key or button). Bindings are saved to `localStorage`.

### Touch (landscape)

| Zone | Action |
|---|---|
| Bottom-left | Steer left |
| Bottom-right | Steer right |
| Both bottom halves | Powerup · start race |
| Both top halves | Brake |
| Top half opposite steer | Lift gas |

Gas is automatic during a race.

---

## Gameplay

- **Grid start**: You begin 6th (last). Five AI cars start ahead of you.
- **Race starts are bunched**: Launch stiction makes the first second a slow crawl — grid position matters.
- **Drafting**: Tuck in behind an AI on a straight to gain +1.5 speed. Pull out and overtake.
- **Cornering**: The AI pre-brakes for corners. You must match that discipline — hard steering at high speed causes understeer.
- **Screen shake**: Collisions produce a bump shake; riding the off-track surface while on the gas produces a low ambient rattle.
- **5 laps** by default. Change in the tuning panel.

### Powerups

Two powerup types spawn along the track edges (slightly off the racing line so you have to detour):

| Type | Colour | Effect |
|---|---|---|
| **S** (Sustained) | Green | ×1.35 top speed for ~1 s |
| **T** (Turbo) | Orange | ×1.8 top speed + acceleration burst for ~0.3 s |

The player holds a collected powerup until activating it with `Z` / `Y`. AI cars activate immediately on pickup. Both boosts taper off smoothly rather than cutting out hard. The current held powerup and active boost state are shown in the top-right HUD.

---

## Track Sharing

Every generated track gets a unique 6-character ID (e.g. `aB3xK9`). The URL auto-updates to `#track=aB3xK9`. Share that link — anyone who opens it gets the exact same track.

You can also type a track ID into the **Parameter Tuning** panel and hit Enter.

---

## Time Attack & Challenges

After finishing a race the overlay shows your time (m:ss.cc, frame-accurate at 60 fps) and a **Copy Challenge** button. The resulting URL encodes your lap count and split times at 25/50/75/100% race progress.

Opening a challenge URL shows the target time in the pre-race overlay and a live **pace delta** (▲ ahead / ▼ behind) in the HUD during the race. Powerup placement is seeded per track so both runs are identical.

---

## AI Opponents

Each of the 5 AI cars has a randomized personality:

- **Risk factor** (0.2–1.0): Cautious cars brake early; aggressive ones carry speed into corners and sometimes crash.
- **Line offset** (inside ↔ outside): They take different racing lines.
- **Grip** (0.03–0.05): Low-grip cars slide more and leave skid marks.
- **Max speed** (9.5–10.5): Some are faster on straights.

Two AI modes are in use:
- **Waypoint** (3 cars): Follow sampled track waypoints with curvature-based braking.
- **Spline** (2 cars, including Yellow): Follow a smooth speed profile pre-computed from track curvature via `computeSpeedProfile`.

### AI Learning

AI cars remember where they went off-track or got stuck. On the next lap, they brake earlier and take a tighter line through those segments. The memory slowly decays, so a car that masters a corner will gradually speed back up. On each new track, AI memory is warm-started with `pretrainAI` so they aren't completely lost on lap 1.

If a car gets stuck off-track at near-zero speed for 2 s, it is temporarily rescued by switching to spline (centerline-following) mode. Once back on track it resumes waypoint mode.

Watch the browser console for `[LEARN]` and `[USE]` events.

---

## Architecture

| File | Role |
|---|---|
| `app.js` | Game loop, UI, track sharing, minimap, race state, track palette, PWA wiring |
| `splash.js` | Animated intro screen (separate PixiJS app, destroyed before game starts) |
| `car.js` | Shared physics for player and AI (acceleration, grip, drift, off-track handling) |
| `ai.js` | Waypoint & spline following, curvature braking, learning memory, draft detection, off-track recovery |
| `track.js` | Procedural track generation (Catmull-Rom splines), seeded PRNG, track ID encoding, speed profile |
| `renderer.js` | Car sprites, camera, particles (zoom-aware), skid marks (palette-rotated per track colour), screen shake |
| `audio.js` | Tone.js sampler — engine and drift sounds triggered from game state |
| `controls.js` | Keyboard + gamepad map, remap UI, `localStorage` persistence |
| `touch.js` | Zone-based touch controls, `preventDefault` strategy |
| `powerups.js` | Powerup spawn (seeded RNG per track), pickup, activation, tapered boost tick |
| `sw.js` | Cache-first service worker for offline / PWA install |
| `manifest.json` | PWA manifest — name, icons, display mode, theme colour |
| `libs/controlHandling.js` | Low-level gamepad polling (ported from Destrier) |
| `libs/Tone.js` | Tone.js audio library |
| `index.html` | Entry point, PixiJS 8 + lil-gui import map, manifest link |

---

## License

MIT
