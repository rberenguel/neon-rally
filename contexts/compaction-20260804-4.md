# Session Compaction Summary

## User Intent
- Tune player top speed and acceleration feel (taper, cap)
- Add F1-style kerb zone (physics + visuals)
- Improve HUD: lap crossing position flash, pit stop info, fuel warning, ordinal positions
- Fix acceleration asymmetry between player and AI in GP mode

## Contextual Work Summary

### Top Speed Tuning
- Player `maxSpeed` raised from 8.8 → 9.2 (`src/app.js`)
- AI `PLAYER_MAX_SPEED` renamed to `AI_SPEED_BASELINE` (stays 8.8) in `src/ai.js` — AI scaling unchanged
- Taper changed from quadratic (`headroom²`) to linear (`headroom`) over 1.0-unit window; floor 0.05
- Acceleration weight exponent changed from `invWeight` (linear) to `Math.pow(invWeight, 0.4)` to reduce full-tank penalty on acceleration

### Kerb Zone
- Added `KERB_EXTRA = 50` and `getTrackZone(x, y, centerline)` returning 0/1/2 to `src/track.js`
- `updateCarPhysics` in `src/car.js` now consumes zone (0=off/1=kerb/2=track): kerb gets 88% grip, friction 0.982, no offTrackDecay
- All `isOnTrackFn` call sites updated to pass `getTrackZone` lambda: `src/gameLoop.js`, `src/trackManager.js`
- Visual kerb stripes drawn in `src/trackManager.js` (`drawKerbStripes`): alternating red/white at 50% alpha, 120 world-unit intervals, width = track + 2×KERB_EXTRA
- `S.trackKerb` Graphics layer added in `src/app.js`, rendered below track surface

### HUD Improvements
- `announceDiv` moved from `top:50%` to `top:65%` — no longer obscures car/track center
- `showAnnounce` now accepts optional color param and uses `innerHTML` (supports HTML formatting)
- Lap crossing: shows "N laps to go!" + ordinal position ("2nd", "3rd") on second line
- `ordinal(n)` helper added in `src/gameLoop.js`
- Pit stop `lapDiv` shows countdown timer + laps remaining
- Pit start triggers `showAnnounce` with laps remaining (visible despite lapDiv showing "PAUSED")
- Low fuel warning: `showAnnounce('⚠ LOW FUEL', '#FF8800')` fires once when `fuel <= 0.2` in GP mode; flag `S._fuelWarningShown` reset on race reset

### Auto Pit on Low Fuel
- Auto-pit triggers on **pit zone entry edge** (rising edge of `_inPitZone`) when `fuel <= 0.2`
- Block placed inside `if (!S.raceFinished)` after `S._inPitZone` is freshly computed — not in control-reading section (previous misplacement fixed)
- Full refuel triggered automatically, orange "AUTO PIT — LOW FUEL" announce shown

### AI Fuel Weight Parity (in progress / under investigation)
- Goal: AI behave as if always carrying 80% fuel in GP mode
- `fuelLoad` in `car.js` changed from `car.isPlayer ? car.fuel : 0` to `car.fuel ?? 0` (applies to all cars)
- `accel` and `weightedMax` formulas now apply `Math.pow(invWeight, 0.4)` to AI too
- AI `fuel` set to `0.8` (GP) or `0` (Quick Race) at creation in `src/ai.js`
- **Issue**: user reports AI "extremely faster" after this change — debug logging added, not yet resolved
- Logging: `_logAccel = true` set on all cars at race start; `car.js` prints fuel/invWeight/factor/accel/weightedMax once per car to console

## Files Touched

### Core Physics
- **src/car.js**: Taper linear, invWeight exponent 0.4 for accel+top speed, fuelLoad universal, kerb zone physics, debug logging added
- **src/ai.js**: Renamed `PLAYER_MAX_SPEED`→`AI_SPEED_BASELINE`, `PLAYER_GRIP`→`AI_GRIP_BASELINE`; `ai.fuel` set at creation for weight parity

### Track / Kerb
- **src/track.js**: Added `KERB_EXTRA`, `getTrackZone()` export
- **src/trackManager.js**: Added `drawKerbStripes()`, calls it on rebuild; imports `KERB_EXTRA`, `getTrackZone`
- **src/app.js**: Added `S.trackKerb` Graphics layer; player `maxSpeed=9.2`, `acceleration=0.14`

### Game Loop
- **src/gameLoop.js**: All `isOnTrackFn` lambdas → `getTrackZone`; auto-pit logic moved/fixed; `ordinal()` helper; `_logAccel` trigger on race start; fuel warning check

### HUD
- **src/hud.js**: `announceDiv` at 65%, `showAnnounce` with color+innerHTML, pit stop text format
- **src/race.js**: `S._fuelWarningShown = false` added to `resetCarsForNewRace`

## Open Issues
- AI acceleration asymmetry investigation pending: console log output needed to determine if `car.fuel` values are correct at race start and whether `Math.pow(invWeight, 0.4)` is being applied as expected
