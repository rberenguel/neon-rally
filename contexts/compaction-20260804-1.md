# Session Compaction Summary

## User Intent
- Add a mode selection screen (Quick Race / Grand Prix) between splash and track select
- Make all map scaling parameters data-driven so new modes or sizes are a one-line change
- Fix mobile camera blur and tighten slipstream visuals

## Contextual Work Summary

### Mode Infrastructure
- New `src/modes.js` as single source of truth: `{ id, label, description, totalLaps, sizeMultiplier, trackSamples, arenaSize, hasFuel, hasTireWear, hasPit }`
- Quick Race: 1× scale, 5 laps, GP features off. Grand Prix: 2× scale, 15 laps, GP features stubbed true
- `showModeSelect()` added to `menu.js`: card-based UI, full keyboard/gamepad/touch navigation, 400 ms input dead zone to prevent double-accept from splash dismiss

### Map Scaling
- `generateTrack` extended with `sizeMultiplier` and `trackSamples` params; `baseR`, `cx/cy`, and min-radius clamp all scale proportionally
- `S.arena.width/height`, `S.trackSamples`, `S.raceConfig.totalLaps`, `S.aiGapFactor` all set from mode before Pixi init
- All hardcoded `1000` (track sample count) replaced with `S.trackSamples` across five files; lap-crossing thresholds expressed as fractions
- `MINIMAP_SCALE` fixed in both `app.js` and `hud.js` (hud.js was overwriting with hardcoded 4000)

### AI Parity
- `S.aiGapFactor = 1 / √sizeMultiplier` — automatic power-law compression of AI advantage over the player
- Applied to `maxSpeed` and `grip` in all three AI init/reroll paths; player baselines (8.8, 0.025) defined as constants in `ai.js`
- Quick Race unchanged; GP compresses the gap ~30%

### Slipstream Visual
- Two `Graphics` objects, one per front tire, each positioned at its tire coordinate so rotation stays anchored to the tire
- Tilt angle computed from `car._draftSourceX/Y` (stored by `computeDraftBoost` when a draft is found) → world vector rotated into car-local space each frame
- Draft cone tightened from 60 → 25 world-unit lateral tolerance
- Alpha fades 0→1 as `_draftBoost` rises to its 1.5 ceiling

### Camera Fix
- `updateCamera` now rounds `world.x/y` to integers, eliminating subpixel blur at any zoom level

### Docs
- `gp-mode.md` rewritten: Phase 1 marked complete, all implemented work documented, §2–5 (pit, tire wear, fuel) preserved with current-code references
- `next.md` deleted (fully superseded by `gp-mode.md`)

## Files Touched

### Core Logic
- **`src/modes.js`**: New — mode config array, single edit point for new modes
- **`src/state.js`**: Added `mode`, `trackSamples`, `aiGapFactor` fields
- **`src/track.js`**: `generateTrack` accepts `sizeMultiplier` + `trackSamples`; geometry scales with them
- **`src/trackManager.js`**: Reads `S.mode` to pass scaling params to `generateTrack`; `_trackMemory` sized from `S.trackSamples`
- **`src/ai.js`**: Imports `S`; player baselines + `aiGapFactor` applied in `createWaypointAI`, `createSplineAI`, `rerollSplineParams`; `_trackMemory` modular arithmetic uses `mem.length`; `computeDraftBoost` stores draft source position on car; draft cone narrowed
- **`src/race.js`**: `_trackIdx / 1000` → `/ S.trackSamples`
- **`src/gameLoop.js`**: All five `1000` track-sample references replaced; lap-crossing thresholds use `S.trackSamples` fractions; `_trackMemory` decay loop uses `mem.length`

### UI / Rendering
- **`src/menu.js`**: `showModeSelect()` added; `showTrackSelect` reads `S.mode` for preview track generation; imports `S` and `MODES`
- **`src/app.js`**: Mode select inserted between splash and Pixi init; mode fields applied to state; `MINIMAP_SCALE` uses `S.arena.width`; tuning GUI laps range extended to 30
- **`src/hud.js`**: `MINIMAP_SCALE` uses `S.arena.width` (was hardcoded 4000)
- **`src/renderer.js`**: `updateCamera` rounds to integers; player sprite gets two per-tire `Graphics` draft glows updated with tilt + alpha each frame

### Docs
- **`gp-mode.md`**: Full rewrite — Phase 1 status + what's done, §2–5 preserved
- **`next.md`**: Deleted
