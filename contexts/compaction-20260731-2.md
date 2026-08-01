# Session Compaction Summary

## User Intent
- Polish the car shape toward an F1 silhouette with wheels and proper pivot feel
- Fix race ranking bugs and boost taper
- General gameplay tuning (grip, boost duration, skid palette, stationary rotation)

## Contextual Work Summary

### Race Ranking Fix
- `getRaceProgress` previously returned the same value for all finished cars → ties resolved wrong
- Added `_finishCounter` / `_finishOrder` per car: first car to complete final lap gets order=1, second gets order=2, etc.
- `getRaceProgress` now returns `totalLaps + 1.0 - finishOrder * 0.001` so earlier finishers rank strictly higher
- Reset `_finishOrder` and `_finishCounter` on race restart

### Boost Taper
- S boost: 300 frames → 60 frames (1 s); T boost: 60 → 20 frames (~0.3 s)
- Added `TAPER_FRAMES = 30` taper phase after duration expires: multipliers lerp back to 1.0 linearly
- `_speedBoost` now stores `{ duration, multiplier, accelBoost, taper }` so taper has the original values to interpolate from

### Skid Palette
- Changed skid color offset from +1 to +3 in the PALETTE array
- Yellow track now gets Magenta skids (was Purple — bad contrast)

### Car Shape: F1 Silhouette
- Replaced isosceles triangle with a 16-point F1 polygon: wide front wing bar, narrow nose shoulders, sidepod bulge, narrow rear, rear wing bar
- Converted `createCarSprite` return type from `Graphics` to `Container` to support separate wheel children
- Pivot moved to `(0, -10)` — near front wing — giving front-axle rotation feel
- Body trimmed 20% on front wing width, 10% on body; further 1–2px body thinning pass

### Wheels
- `_createWheel(isRear)`: dark rounded-rect Graphics; front 5×10, rear 6×12
- 4 wheels added as children of the Container (rendered under body)
- Front wheels at `(±10, -9)`, rear at `(±10, 10)`
- Front wheels steer visually: lerp toward `steerInput × 0.45 rad` at 15%/frame
- `steerInput` (actual -1/0/1 input) echoed back from `updateCarPhysics` return as `steerInput: steer` — separate from `turnSign` (slip direction used for body skew)
- Wheels return to neutral when input released; work at zero speed

### Player Marker
- Replaced white cockpit dot with a cyan centerline stripe (full car length, front wing to rear wing, x=0)

### Physics Fixes
- Stationary car no longer rotates when steering: `car.rotation` update gated on `speed > 0.1` and scaled by `speedFactor`
- Player grip set to `0.025` (below AI range of 0.03–0.05 — more slide than AI)

### Finish Line Z-order
- `finishLine` Graphics declared immediately after `world` Container so it can be `addChild`-ed before car sprites
- Sits in draw order: track surface → track glow → track line → finish line → skids → powerups → cars

### Documentation
- `README.md` updated: gamepad controls, powerups table, AI modes, all new architecture files
- `next.md` created with: proper menu, mobile/touch, time attack + URL hash challenge, splash screen, hide tuning GUI, code organisation, waypoint AI stuck-after-crash bug

## Files Touched

### Core Logic
- **car.js**: Stationary rotation fix (speed gate + speedFactor scaling); `steerInput` echoed in physics return
- **powerups.js**: Boost durations reduced; `TAPER_FRAMES` taper phase added to `tickBoosts`; `_speedBoost` stores original multipliers
- **ai.js**: Unchanged this session

### Rendering
- **renderer.js**: Full F1 car shape (16-point polygon); `Container`-based sprite with 4 wheel children; front wheel steering via `steerInput`; player marker changed to centerline stripe; skid palette offset +1→+3

### App Wiring
- **app.js**: `_finishCounter`/`_finishOrder` race ranking; `finishLine` moved to early declaration + correct z-order insertion; player grip=0.025; `steerInput` passed to both player and AI `updateCarSprite` calls

### Documentation
- **README.md**: Full rewrite to reflect current feature set
- **next.md**: Created — future improvements and known bugs
- **contexts/compaction-20260731-2.md**: This file
