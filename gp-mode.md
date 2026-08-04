# Grand Prix Mode — Implementation Plan

Covers: larger tracks, pit stop area/procedure, AI pit awareness, tire wear, fuel.
Written against the current source (`track.js`, `car.js`, `ai.js`, `trackManager.js`,
`state.js`, `race.js`, `powerups.js`).

---

## Status: Phase 1 complete, Phase 2 (pit/fuel) partially complete

The mode infrastructure, map scaling, and gameplay parity fixes are done and live.
Fuel system, pit box, and player pit procedure are implemented.
Remaining work: AI pit awareness, tire wear, AI fuel parity tuning.
**Last reviewed: 2026-08-04**

---

## What is implemented

### Mode selection screen — [x] Done
- Splash → **Mode Select** → Track Select → Race (flow change)
- `src/modes.js` is the single source of truth for mode config.
- **Quick Race**: 5 laps, GP features off.
- **Grand Prix**: 15 laps, GP features on.
- Mode select UI: card-based, keyboard/gamepad/touch navigable, 400 ms input dead zone after splash dismiss.

### Map scaling — [x] Done
- `generateTrack` accepts `sizeMultiplier` and `trackSamples`.
- `S.arena`, `S.trackSamples`, `S.raceConfig.totalLaps` set from mode before Pixi init.
- `S.MINIMAP_SCALE` computed correctly.
- All hardcoded sample counts replaced with `S.trackSamples` across the codebase.

### AI parity for longer tracks — [x] Done (revised)
- `S.aiGapFactor = 1 / √sizeMultiplier` — computed in `app.js` from mode.
- Applied in `createWaypointAI`, `createSplineAI`, and `rerollSplineParams`.
- **Decision**: Player `maxSpeed` raised to `9.2` (from `8.8`). AI baseline stays `8.8` but gets randomized `9.3–10.5` scaled by gap factor. This preserves AI challenge while giving the player a higher ceiling.

### Slipstream visual — [x] Done
- Two elongated yellow ellipses on front tires.
- Tilt angle computed from draft-source car position.
- Alpha fades with `_draftBoost`.
- Draft cone tightened to 25 world-unit lateral tolerance.

### Camera fix — [x] Done
- `updateCamera` rounds `world.x/y` to integers.

---

## 2. Pit lane: area & procedure — [x] Done (revised)

**Decision**: Kept the pit box approach (curved belt near start/finish) rather than building a parallel lane. Implemented as a rectangular detection zone centred just behind the start line, with visual gate lines and hatching.

- [x] Pit box placement: curved belt following centerline near index 0, rendered in `S.finishLine` (yellow hatching + gate lines)
- [x] Detection: rectangle-based `along < halfLen && across < halfWidth` check using `fwdX/Y` and `perpX/Y`
- [x] `pitZoneDiv` HUD marker: shows "PIT ZONE" when player enters the zone
- [x] Stop timer: `pitStopFrames(fuelPct * 100)` — scales with fuel amount chosen (30–120 frames)
- [x] Fuel reset on exit: `player.fuel = min(1, current + chosenPct)`
- [x] Invulnerability on exit: `_pitInvulTimer = 120` frames (ghost mode, no collisions)
- [x] **Pit menu**: `showPitMenu` with fuel slider (0–100%) opened by pressing pause inside the zone
- [x] **Auto-pit on low fuel**: triggers on pit zone entry when `fuel <= 0.2`; opens the same menu with orange "AUTO PIT — LOW FUEL" announcement. **Decision**: always opens the menu, never unilaterally refuels.
- [ ] Tire reset on pit: not yet implemented (tire wear system doesn't exist)
- [ ] Speed cap on entry: not implemented — entry triggers purely on zone + pause button, not speed

---

## 3. AI pit awareness — [ ] Not started

- [ ] Decision to pit: threshold check at start/finish (`fuel < threshold || tireWear > threshold`)
- [ ] Random jitter per AI so they don't all pit together
- [ ] Navigation into box: override racing-line target with pit approach point when `_planPit` active
- [ ] Speed clamp before entry
- [ ] Stop procedure: freeze AI input, wait timer, reset fuel/tires, resume
- [ ] Retarget normal racing line after exit

**Blocker**: needs tire wear system (§4) first for the wear trigger to mean anything.

---

## 4. Tire wear — [ ] Not started

- [ ] `car.tireWear` field (0–1)
- [ ] Decay model: `tireWear += k * cornerSeverity * dt`
- [ ] Player effect: `car.grip` direct multiply
- [ ] AI effect: `car.grip` + `trackSpeedProfile` target speed scaling + `turnSpeed` reduction
- [ ] AI wear rate: 1.3–1.5× player rate
- [ ] Visual feedback: skid marks widen
- [ ] Reset to 0 on pit stop

**Only active when `S.mode.hasTireWear` is true.**

---

## 5. Fuel — [x] Done (revised)

- [x] `car.fuel` field (0–1)
- [x] Depletion: `FUEL_BURN_RATE * burnMult * speed * dt` per distance, not per gas input
- [x] Player: `fuelFlow` cycling (-1 conserve, 0 balanced, +1 push) affects accel and burn rate
- [x] **Decision**: Acceleration scales via `Math.pow(invWeight, 0.4)` for ALL cars (player + AI). Weight = `1 + fuel * FUEL_WEIGHT_FRACTION`.
- [x] **Decision**: AI fuel fixed at `0.8` in GP mode (weight parity — AI behaves as if carrying 80% fuel always). Quick Race: AI fuel = 0 (no weight).
- [x] Fuel == 0: `fuelDepleted` cuts gas entirely
- [x] HUD: `fuelHud` with bar, percentage, fuel flow label (`CON`/`BAL`/`PSH`)
- [x] Low fuel warning: `showAnnounce('⚠ LOW FUEL')` at 20%, once per race
- [x] Auto-pit triggers at 20% on pit zone entry (opens menu, see §2)

---

## Additional decisions made outside this plan

### Kerb zones
- [x] Added F1-style kerb with `KERB_EXTRA = 50` world-units beyond track edge
- [x] Kerb grip: 88% of normal, friction 0.982, no offTrackDecay
- [x] Visual: alternating red/white stripes at 50% alpha, 120-unit intervals
- Files: `src/track.js`, `src/car.js`, `src/trackManager.js`, `src/app.js`

### Magenta AI rework
- [x] Converted from broken `waypoint` to `spline` with `clonePlayer: true`
- [x] Copies player physics but worse spline tuning (`_steerSmooth=0.06`, `_lookAhead=20`, `_speedTolerance=0.1`)
- Keeps magenta as the worst AI without the old waypoint slalom behavior
- Files: `src/app.js`, `src/ai.js`

### Acceleration taper tuning
- [x] Changed from quadratic (`headroom²`) to linear (`headroom`) over 1.0-unit window
- [x] Launch stiction: 0.4 multiplier below 0.3 speed for all cars
- [x] Weight exponent changed from linear `invWeight` to `Math.pow(invWeight, 0.4)`
- File: `src/car.js`

### HUD improvements
- [x] Lap crossing: ordinal position flash ("2nd", "3rd") + laps remaining
- [x] Pit stop HUD: countdown timer + laps remaining
- [x] `announceDiv` moved from 50% to 65% vertical position
- [x] `showAnnounce` accepts optional color + HTML formatting
- File: `src/hud.js`, `src/gameLoop.js`

### Gamepad debounce
- [x] 2-frame debounce on gamepad `gas` button to prevent single-frame flicker
- [x] Untouched buttons default to unpressed (fixed auto-start bug)
- [x] Debounce bypassed for momentary inputs (`activate`, `pause`, steer)
- File: `libs/controlHandling.js`

---

## Suggested build order for remaining work (updated)

1. Tire wear on player only (grip multiply, decay model, visual feedback)
2. AI pit awareness + AI-specific wear application (speed profile + turnSpeed)
3. AI pit navigation into box and stop procedure
4. Tuning pass: wear rates, pit thresholds, burn rates, race length
5. Optional: true pit lane geometry (parallel path instead of box)

Steps 1–2 give you a fully playable GP loop for the player alone before AI pit
logic is even touched.
