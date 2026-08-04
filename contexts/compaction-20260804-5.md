# Session Compaction Summary

## User Intent
- Fix massive acceleration asymmetry between player and AI at race start
- Ensure auto-pit opens the fuel-choice menu instead of unilaterally refueling
- Convert the Magenta AI from a broken waypoint type to a player-cloned spline AI (still the worst car)
- Add visual kerb zones and HUD improvements (lap crossing flash, pit stop info, fuel warning)
- Tune player top speed and acceleration taper for better feel

## Contextual Work Summary

### Physics Investigation
- Added per-frame physics logging (`[PHYSICS]`) for the first 20 frames to diagnose acceleration divergence
- Discovered the real bug: intermittent `NO_GAS` frames on the player caused by gamepad button flicker, not physics
- Player and AI had nearly identical logged `baseAccel` values (~0.131 vs ~0.133); the issue was purely input layer

### Input Layer Fix
- Implemented 2-frame gamepad button debounce in `libs/controlHandling.js`
- Debounce only applies to the `gas` action; momentary inputs (`activate`, `pause`, steer) remain raw
- Fixed a critical edge case where untouched buttons defaulted to `pressed = true` on first poll

### Auto-Pit Fix
- Changed auto-pit on low fuel from silently refueling to pausing the game and opening `showPitMenu`
- Player can now choose fuel amount or cancel when auto-pit triggers
- Orange "AUTO PIT — LOW FUEL" announcement still fires to explain why the menu appeared

### Magenta AI Rework
- Converted Magenta from `waypoint` to `spline` type with `clonePlayer: true`
- Copies player physics (`maxSpeed=9.2`, `accel=0.14`, `grip=0.025`) but adds worse spline tuning (`_steerSmooth=0.06`, `_lookAhead=20`, `_speedTolerance=0.1`)
- `rerollSplineParams` preserves clone settings across track changes

### Version Bump
- Bumped `manifest.json` and `sw.js` from `0.9.4` → `0.10.0`

## Files Touched

### Input / Controls
- **libs/controlHandling.js**: Added per-button debounce for `gas`; fixed untouched-button default bug

### Core Physics / Car
- **src/car.js**: Added `[PHYSICS]` per-frame debug logging (temporary instrumentation)
- **src/gameLoop.js**: Auto-pit now opens pit menu; `_physicsLogFrame` init on race start

### AI
- **src/ai.js**: `rerollSplineParams` now respects `_clonePlayer` flag
- **src/app.js**: Magenta AI definition changed to `spline` + `clonePlayer`; post-creation clone override

### App Metadata
- **manifest.json**: Version bump to `0.10.0`
- **sw.js**: Cache name bump to `neon-rally-v0.10.0`

### Reset / Cleanup
- **src/race.js**: Clears `_physicsLogFrame` and `_logAccel` in `resetCarsForNewRace`
