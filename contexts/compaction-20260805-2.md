# Session Compaction Summary

## User Intent
- Add AI fuel burn and auto-pit parity so player stops don't feel unfairly punishing
- Polish the finish card with track minimap and top-3 position markers
- Fix menu sensitivity and mobile layout issues
- Maintain race balance after introducing tire wear system

## Contextual Work Summary

### AI Fuel Parity & Auto-Pit
- All cars now burn fuel identically (distance-based, regardless of gas input)
- AI cars start at `START_FUEL` constant (0.3 for testing, revertable to 1.0)
- Auto-pit triggers on pit zone entry at ≤20% fuel for both player and AI
- AI pit: freeze in place, fixed ~3.5s timer, no tyre change, refuel to 100%
- Ghost mode: pitting/invulnerable cars are transparent (alpha 0.3) and excluded from collisions
- Pit trigger debounced: 3 consecutive frames in-zone before firing (prevents border grazing)

### Collision System Upgrade
- Replaced circular collision with OBB (oriented bounding box) using Separating Axis Theorem
- Rectangle aligned to car rotation, push + velocity reflection along minimum overlap axis
- Active-car filtering: only non-pitting cars participate in collisions

### Finish Card Enhancement
- Canvas-drawn minimap embedded in the race-finished overlay
- Gold finish marker at start/finish point
- Top-3 finishers shown as colored dots on the track at their actual positions
- Standings passed from game loop via `getRaceProgress` sort

### Menu & Mobile Polish
- Keyboard nav cooldown added to mode and track select (prevents OS key-repeat oscillation)
- Controls overlay widened on mobile (`98vw`, reduced padding)
- Finished overlay widened and padded for better mobile fit
- Session share card got more horizontal margin (`PAD` 22→30)

### AI Speed Rebalance
- AI raw max speed range extended: `9.2 + rng*0.8` → `9.2 + rng*1.2`
- Effective GP ceiling now ~9.99 vs player 9.2, creating genuine straight-line challenge

## Files Touched

### Core Physics / Logic
- **src/car.js**: `START_FUEL` constant; fuel burn moved outside gas block (all cars); `tireGripMult` 0.8 severity
- **src/ai.js**: AI fuel init at `START_FUEL`; max speed ceiling raised; OBB `resolveCollisions` rewrite
- **src/race.js**: Reset `START_FUEL` and AI pit state fields on new race

### Game Loop
- **src/gameLoop.js**: AI pit zone detection + auto-pit logic; ghost collision filtering; sprite alpha for transparency; bump shake gated on player active; standings sort for finish card; `_pitZoneFrames` debounce; `_pitAutoTriggered` one-shot

### UI / Rendering
- **src/hud.js**: `showFinishedOverlay` accepts standings + trackCenterline; embedded canvas minimap with top-3 dots; finished overlay sizing; controls overlay mobile width
- **src/session.js**: `PAD` increased for more horizontal margin on shareable canvas
- **src/menu.js**: Keyboard and gamepad nav cooldown in `showModeSelect` and `showTrackSelect`

### State / Powerups
- **src/state.js**: Added `_pitChangeTires` field
- **src/powerups.js**: Store `_trackIdx` on spawned powerups for track-relative indicator

### Metadata
- **manifest.json** / **sw.js**: Bumped through 0.10.4 → 0.10.20
