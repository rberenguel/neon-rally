# Grand Prix Mode — Implementation Plan

Covers: larger tracks, pit stop area/procedure, AI pit awareness, tire wear, fuel.
Written against the current source (`track.js`, `car.js`, `ai.js`, `trackManager.js`,
`state.js`, `race.js`, `powerups.js`).

---

## 1. Map size

**Constants to change together** (currently all implicitly coupled to `4000`):

| File | Constant | Now | Change |
|---|---|---|---|
| `track.js` | `baseR` | 920 | scale by `sizeMultiplier` (e.g. 1.5–2x for GP mode) |
| `track.js` | `TRACK_SAMPLES` | 1000 | raise proportionally (e.g. 1500–2000) to keep sample density sane |
| `state.js` | `arena.width/height` | 4000 | raise so track radius + `TRACK_HALF` stays well inside the box |
| `state.js` | `MINIMAP_SCALE` | `0.055` (≈`MAP_W/4000`) | recompute as `MAP_W / arena.width` |

**Things that scale automatically, no change needed:**
- `isOnTrack` / `getTrackProgress` — O(`TRACK_SAMPLES`), cost tracks the constant not the radius, negligible either way (verified: even at 2000 samples × 6 cars × 2 lookups/frame, well under 1M ops/sec).
- Skid marks, zoom, physics — size-agnostic.

**Things that need re-tuning, not just resizing:**
- `computeRacingLine`'s `look = 20` and `computeSpeedProfile`'s `sampleWindow = 8` are in *index* space. If `TRACK_SAMPLES` goes up proportionally with radius, these stay correctly calibrated in *distance* space automatically — so raising samples alongside `baseR` is what keeps racing-line/corner-braking quality from degrading. Don't resize the track without resizing sample count.
- `pretrainAI`'s `maxSteps = 30000` cap in `ai.js` — dropping AI warm-up (per your plan) makes this moot; skip.

**Target:** ~2x radius, 10–20 lap Grand Prix mode → roughly 4–12 min races (see prior lap-time table), long enough for tire/fuel strategy to matter without dragging.

---

## 2. Pit lane: area & procedure

The track is a single closed polar loop (no branching geometry) — building a true
parallel pit lane means extending `generateTrack` to carve a second path. Simpler
and lower-risk: a **pit box**, not a pit lane — a marked zone just off the racing
line near the start/finish index (index `0` in the centerline, same point
`startPt`/`nextPt` already mark).

**Placement** — reuse the offset pattern already used for powerup placement in
`powerups.js` (perpendicular offset from centerline using the tangent to the next
point):
- Pick a short run of indices near `0` (e.g. `-30..+10`), offset consistently to
  one side by `TRACK_HALF * 0.9` so the box sits just outside the racing line but
  still touches the track surface.
- Render as a distinct rectangle (different color/hatching) in `renderer.js`,
  alongside the existing `trackSurf`/`trackGlow`/`trackLine` graphics.

**Entry/procedure:**
1. **Trigger zone**: a proximity check (`x/y` within the pit box, squared-distance
   test like `PICKUP_RADIUS_SQ` in `powerups.js`) combined with a speed cap — only
   count as "entering the pit" if speed is below some threshold (e.g. `< 0.4 *
   maxSpeed`) to avoid accidental drive-through triggers at race pace.
2. **Stop timer**: once in the box under the speed threshold, freeze the car's
   effective input (or heavily dampen `acceleration`) for a fixed duration (e.g.
   90–150 frames), during which:
   - `car.fuel` resets to full (or a chosen partial refill amount, if you want a
     "how much to take on" strategy layer later)
   - `car.tireWear` resets to 0 (or `grip` resets to base)
3. **Exit**: release the input dampening, let the car accelerate out of the box
   back toward the racing line. A brief invulnerability-from-draft or no-collision
   window on exit avoids AI cars stacking into a stopped car.

**HUD**: pit box needs a visible marker approaching it (distance countdown or an
icon, similar to how `hud.js` already surfaces lap/position) so the player isn't
guessing where it is at speed.

---

## 3. AI pit awareness

The AI already runs on a precomputed `trackSpeedProfile` + racing line (`ai.js`),
not live decision-making, so pit-stop logic needs to be a new, separate layer on
top rather than something the profile can express by itself.

**Decision to pit** — simple threshold check per AI car, evaluated once per lap
(at index `0`, i.e. when they cross start/finish) rather than every frame:
- `if (car.fuel < FUEL_PIT_THRESHOLD || car.tireWear > WEAR_PIT_THRESHOLD) car._planPit = true`
- Add a small random jitter per AI car (seeded, like `rerollSplineParams` already
  does) so AI cars don't all pit on the same lap — otherwise every AI car pits in
  lockstep and it reads as scripted rather than strategic.

**Navigation into the box** — cheapest approach: when `_planPit` is true and the
car's `_trackIdx` is within the pit-entry range, temporarily override the AI's
steering target from the racing line to the pit box's approach point, and clamp
its throttle to hit the speed threshold before entry. This is a target-swap, not
new physics — reuses the same steer-toward-point logic the AI already uses to
follow the racing line, just pointed at a different `(x, y)` for a short stretch.

**During/after the stop**: AI just sits like the player does (frozen/dampened
input) for the same fixed timer, then re-targets the normal racing line as it
exits — no special-casing needed once it's back on the centerline.

**Tuning note**: because AI corners cleaner than the player by construction (see
§4), give AI a *harder* pit trigger — either a lower `WEAR_PIT_THRESHOLD` or a
faster underlying wear rate (below) — so AI cars are forced into the pits on a
comparable cadence to the player, rather than the player being the only one who
ever needs to stop.

---

## 4. Tire wear

**Where it hooks in** — `car.grip` in `car.js`, plus (new) a wear-scaled multiplier
on `computeSpeedProfile`'s target speeds for AI specifically, because AI never
triggers the player-only `steerFactor` understeer penalty in `updateCarPhysics`.
That asymmetry is the actual reason AI currently "feels" smoother — it's not
tuning, it's a missing mechanic — so tire wear has to compensate for it rather
than apply identically to both:

| Car | Wear affects | Rationale |
|---|---|---|
| Player | `car.grip` (existing field, direct multiply) | Already loses grip via `steerFactor` on top of this — wear compounds naturally with driving mistakes. |
| AI | `car.grip` **and** target speeds from `trackSpeedProfile` (scaled down, non-linearly, e.g. `^1.5`) **and** `turnSpeed` | AI has no steer-slip mechanism, so wear needs to hit the racing line itself (earlier braking, can't hold the apex) to be visible at all. |

**Decay model**: linear-ish per lap or per-corner-g-load is fine to start —
`car.tireWear += k * cornerSeverity * dt`, reset to 0 on pit stop. Don't
over-engineer the curve on the first pass; the asymmetric *application* above
matters more than the decay shape.

**Visual feedback** (already sketched in your notes): skid marks widen as
`tireWear` rises — cheap, and gives the player a legible signal without reading a
HUD number.

**AI wear rate**: per your call — make it faster than the player's by default
(e.g. 1.3–1.5x), since a default-tuned AI slips far less than a human on a
default track and would otherwise rarely feel the effect until it's tuned to an
extreme.

---

## 5. Fuel

**Where it hooks in** — new `car.fuel` field (0–1 or literal units), depletes with
throttle use (`car.fuel -= burnRate * gasInput * dt`). Effects on `car.js` fields:

- `car.acceleration` scales down as fuel drops (heavier car / leaner mixture)
- `car.maxSpeed` optionally scales down slightly near empty
- At `fuel <= 0`: cut `gas` entirely regardless of input — car coasts on
  `friction`/`offTrackDecay` alone until it stops. No special state needed, just
  gate the `if (gas)` branch in `updateCarPhysics`.

Fuel is naturally symmetric between player and AI (it's a straight-line effect,
not corner-slip-dependent), so it doesn't need the asymmetric treatment tire wear
does — same burn rate and same effect curve for both is fine as a first pass.

**HUD**: numeric or bar readout (`hud.js` already has a pattern for this kind of
persistent readout).

---

## Suggested build order

1. Map size + sample-count scaling (isolated, testable alone, no gameplay systems depend on it)
2. Fuel (simplest system, symmetric, good smoke test for the pit-stop procedure)
3. Pit box placement + player-only stop procedure
4. Tire wear on player only (grip multiply)
5. AI pit awareness + AI-specific wear application (speed profile + turnSpeed)
6. Tuning pass: wear rates, pit thresholds, burn rates, race length

Steps 1–4 give you a fully playable loop for the player alone before AI pit logic
is even touched, which makes it much easier to feel whether the wear/fuel effects
are "meaningful" (your word) before layering in the harder AI-navigation piece.