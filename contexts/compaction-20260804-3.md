# Session Compaction Summary

## User Intent
- Implement a fuel flow system (Conserve / Balanced / Push) with real weight and burn consequences
- Add pit stops as the strategic recovery mechanic, gated by pausing inside a marked track zone
- Make all controls and menus use the game's existing remappable control system — no hardcoded keys

## Contextual Work Summary

### Fuel Flow System
- Three modes: `fuelFlow` −1/0/+1 (CON/BAL/PSH) stored on `car`
- Controlled via `fuelFlowUp`/`fuelFlowDown` actions (keyboard `Q`/`E`, gamepad `b:4`/`b:5`, touch LU/RU)
- 6-frame debounce allows double-tapping to jump two levels
- Fuel HUD: flow label + bar + percentage readout; shown only when `mode.hasFuel`

### Fuel Weight Model
- Full tank adds `FUEL_WEIGHT_FRACTION` (0.18) to car weight ratio
- Affects acceleration (`×invWeight`), grip in slide-assist (`×√invWeight`), top-speed cap (`×invWeight^0.4`)
- Push mode's accelMult (~1.175) roughly cancels the full-tank weight penalty — making fuel flow a weight management lever, not just instant power
- Burn is distance-based (`FUEL_BURN_RATE × burnMult × speed × dt`); ~10% per lap at balanced

### Pit Stop Zone
- Marked zone on track: curved belt following centerline points (not a rectangle), entry/exit gate lines, 4 intermediate tick marks — all drawn into `S.finishLine`
- Zone detection: rectangle approximation (`pitBox` with `fwdX/Y`, `perpX/Y`, `halfLen=160`, `halfWidth=TRACK_HALF`)
- `S.pitBox` computed in `rebuildTrack`; null when `!mode.hasPit`
- "PIT ZONE — PAUSE TO PIT" banner shown when player inside zone

### Pit Stop Menu & Flow
- Triggered by pressing Pause while inside pit zone (`_pitInvulTimer <= 0`, `!_pitActive`)
- Pit menu driven entirely by game controls: Steer Left/Right = fuel ±1%, Activate = confirm, Pause = cancel
- Touch/mouse click fallbacks on `−`/`+` buttons
- Menu shows action names ("Activate — Pit Stop", "Pause — Resume"), not raw key codes
- On confirm: `_pitActive = true`, car frozen (`vx=vy=0`), `lapDiv` shows countdown
- On completion: fuel applied, game re-pauses with "GO GO GO!" — player unpauses manually
- Invulnerability window (120 frames) after exit; during pit + invul, player is ghost (AI-AI collisions still resolve)

### Control System Hygiene
- `fuelFlowUp`/`fuelFlowDown` added to `commandNames`, `defaultKeyMap`, `defaultButtonMap`, `makeControlHandler`, `S.input`, `S._ctrlInput`
- Touch LU/RU fire `pendingFuelDown`/`pendingFuelUp` (same one-shot pattern as CD/CU)
- Pit menu previously had hardcoded `Space`/`Escape` key listeners — removed; all input now goes through `S.input` polling in game loop

## Files Touched

### Core Logic
- **`src/car.js`**: `createCar` adds `fuel`/`fuelFlow` fields; `updateCarPhysics` applies accelMult, weight model (invWeight), distance-based burn, fuel-depletion gas gate; `FUEL_BURN_RATE` and `FUEL_WEIGHT_FRACTION` constants
- **`src/state.js`**: Added `pitBox`, `_inPitZone`, `_pitActive`, `_pitStopTimer`, `_pitFuelToAdd`, `_pitInvulTimer`, `_fuelFlowCooldown`, `_pitMenuStepCooldown` fields; `fuelFlowUp`/`fuelFlowDown` in input objects
- **`src/controls.js`**: `fuelFlowUp`/`fuelFlowDown` added to all control maps and handler actions
- **`src/race.js`**: `resetCarsForNewRace` resets `fuel`, `fuelFlow`, and all pit state fields

### Track / AI
- **`src/trackManager.js`**: `rebuildTrack` computes `S.pitBox` and draws the curved pit zone belt with gate lines and tick marks; helper functions `perpAt`, `walkBack`, `walkForward` local to the block

### Game Loop
- **`src/gameLoop.js`**: Pit zone proximity detection each frame; pause intercept routes to pit menu or normal pause; pit stop timer freezes car and applies fuel on completion; re-pauses on stop end; collision block ghosts player during pit/invul; fuel flow cycling with cooldown; fuel/pit HUD updates; pit menu control routing (steerLeft/Right/activate/pause)

### UI
- **`src/hud.js`**: `fuelHud`, `fuelBarFill`, `fuelFlowLabel`, `fuelPctLabel` elements; `pitZoneDiv` banner; `pitMenuDiv` overlay; `showPitMenu`, `dismissPitMenu`, `confirmPitMenu`, `isPitMenuOpen`, `pitMenuStep`, `pitStopFrames` exports; menu state lifted to module level so game loop can drive it; `updateMinimap` has no pit dot
- **`src/touch.js`**: LU/RU touchstart fire `pendingFuelDown`/`pendingFuelUp`; discard path clears them
