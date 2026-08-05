# Session Compaction Summary

## User Intent
- Implement tire wear on player only, as the next step in the Grand Prix mode plan
- Fix player being too fast compared to AI after recent tuning changes
- Make pit stop tyre changes a player decision with meaningful time cost and grip consequence
- Add powerup proximity indicators to give players time to align for off-screen pickups
- Make car collisions respect rectangular body shape instead of circular approximation

## Contextual Work Summary

### Tire Wear System (Player Only)
- `tireWear` field added to car state (0 fresh → 1 bald)
- Decay model: lateral load (slip × speed) drives wear on-track; half rate off-track
- Grip multiplier: `1 - tireWear * 0.8` → fresh = 100% grip, bald = 20% grip
- Visual feedback: skid marks widen (1× → 3×) as wear increases
- HUD renamed from "TIRES" to "GRIP" showing remaining grip % top-down
- Reset to 0 on pit stop only when player actively chooses tyre change

### Pit Menu Tyre Decision
- Pit menu gained "Change tyres: NO / YES" toggle button; default is NO
- Changing tyres costs +1.0s added to pit stop timer
- `pitStopFrames` now accepts `(fuelPct, changeTires)`
- Tyre reset guarded: only happens when `_pitChangeTires` was true at confirm

### AI Speed Rebalance
- Raised `AI_SPEED_BASELINE` from 8.8 → 9.0
- Raised AI `rawMaxSpeed` from 9.0–9.8 → 9.2–10.0 in all three creation/reroll paths
- Player maxSpeed stays 9.2; AI now has cars above and below player ceiling in GP mode
- Cornering behavior and random ranges left untouched per user request

### Powerup Proximity Indicators
- Edge-aligned bars on screen border point toward nearby off-screen powerups
- "Ahead" computed via track centerline index difference, not car heading
- Bars flush to screen edge (7×24px vertical, 24×7px horizontal), rotated to match edge
- Green = S boost, orange = T boost; only shown when powerup is ahead on track and off-screen

### OBB Collision Detection
- Replaced circular collision with oriented bounding box (OBB) using Separating Axis Theorem
- Rectangle dimensions: 34×22 units aligned to car rotation
- Collision normal derived from minimum overlap axis; push + velocity reflection
- Screen shake `BUMP_DIST` raised 16 → 26 to match larger collision envelope

### HUD Polish
- Fuel/tire HUD moved down to avoid overlap with challenge delta text
- Lap info font on mobile reduced 13px → 11px for long text fit

## Files Touched

### Core Physics
- **src/car.js**: tireWear decay, grip multiplier, fresh/remaining display model
- **src/ai.js**: AI baseline and ceiling raised; full OBB collision rewrite (`resolveCollisions`)

### Rendering
- **src/renderer.js**: skid `emitSeg` accepts width multiplier; alpha-bucketed draw scales stroke width

### Game Loop / State
- **src/gameLoop.js**: tyre reset on pit completion, GRIP HUD display, powerup indicator call, BUMP_DIST bump
- **src/state.js**: added `_pitChangeTires` field
- **src/race.js**: reset `tireWear` on new race

### Powerups
- **src/powerups.js**: store `_trackIdx` on each spawned powerup for track-relative ahead check

### UI
- **src/hud.js**: tireWearLabel added, pit menu with tyre toggle, `updatePowerupIndicators` export, pit menu timing includes tyre penalty

### Metadata
- **manifest.json** / **sw.js**: bumped through 0.10.4 → 0.10.12
