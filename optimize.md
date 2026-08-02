# Performance Optimization Plan — Mobile Overheating

## Verified findings

### Issue 1 — `isOnTrack` called once per skid segment every frame

**Evidence:** `renderer.js:162` inside `initSkids().draw()`:
```js
const onSeg = isOnTrackFn((s.x1 + s.x2) * 0.5, (s.y1 + s.y2) * 0.5);
const segAlpha = onSeg ? alpha * 0.25 : alpha * 0.15;
```
`isOnTrackFn` is `isOnTrack` from `track.js:188-195` — a brute-force O(1000) loop that calls
`Math.hypot` for every centerline point on every call. With up to 2000 segments:

> **2000 × 1000 = 2,000,000 `Math.hypot` calls per frame. At 45 fps: 90 million per second.**

The only effect of the result is a cosmetic alpha difference: `0.25` on asphalt vs `0.15` on grass —
a 40% dimming of an already-dim mark. This is the dominant CPU cost.

**Fix: bake `onTrack` at emit time.** `emitCarEffects` in `gameLoop.js:14-38` already receives
`state` (the return value of `updateCarPhysics`), which includes `state.onTrack`. Pass it to
`emitSeg`:

- `renderer.js` — `emitSeg(x1, y1, x2, y2)` → `emitSeg(x1, y1, x2, y2, onTrack = true)`, store
  `onTrack` on the segment object.
- `renderer.js` — `draw(isOnTrackFn, trackColor)` → `draw(trackColor)`. Use `s.onTrack`
  directly; remove the function parameter entirely.
- `gameLoop.js:25-26` — pass `state.onTrack` to both `emitSeg` calls inside `emitCarEffects`.
- `gameLoop.js:315` — `S.skids.draw((x, y) => isOnTrack(...), S.trackColor)` → `S.skids.draw(S.trackColor)`.

**Gameplay impact: none.** Purely cosmetic alpha distinction, computed identically — just at a
different moment.

---

### Issue 2 — 2000 individual `stroke()` calls per frame in the skid draw loop

**Evidence:** `renderer.js:160-167`:
```js
for (const s of segments) {
    const alpha = Math.max(0, 1 - s.age / 2400);
    ...
    graphics.moveTo(s.x1, s.y1);
    graphics.lineTo(s.x2, s.y2);
    graphics.stroke({ width: 2, color: skidColor, alpha: segAlpha });
}
```
In PixiJS 8, each `.stroke(style)` call commits the current path as a separate graphics
instruction with its own style object. Because `segAlpha` is continuous (derived from `s.age`
which is unique per segment), no two segments share the same style, so PixiJS cannot batch them.
Result: up to **2000 separate draw operations** submitted to the GPU every frame.

**Fix: alpha bucketing.** Group segments into N buckets by quantized alpha. All segments in a
bucket share one `moveTo/lineTo/stroke` sequence — a single PixiJS call covering potentially
hundreds of segments.

Concretely, use 8 buckets:
```js
const bucket = Math.min(7, Math.floor(alpha * 8));  // 0–7
```
With `onTrack` baked (from Issue 1), there are at most `2 × 8 = 16` groups — but in practice
segments mostly cluster in a narrow age range, so usually 2–6 strokes/frame, never more than 16.
That is a **125× reduction from 2000**.

Implementation in `initSkids().draw()`:
- Build two arrays of 8 empty buckets (on-track, off-track), reset each call.
- Classify each segment into its bucket; accumulate the path commands (moveTo/lineTo) into a
  flat array per bucket, or draw inline.
- After classification, iterate buckets: `graphics.moveTo/lineTo` for each segment in the bucket,
  then one `graphics.stroke({ width: 2, color: skidColor, alpha: bucketAlpha })`.

Bucket alpha can be computed once per bucket from the bucket midpoint:
```js
const bucketAlpha = ((bucket + 0.5) / 8);  // 0.0625, 0.1875, ... 0.9375
const segAlpha = bucketAlpha * (s.onTrack ? 0.25 : 0.15);
```

**Gameplay impact: none.** Imperceptible visual quantization of fade — the eye cannot distinguish
alpha steps finer than ~5%.

Also fix two minor array allocations in `draw()`:
- `segments.forEach(s => s.age++)` → `for` loop (avoids function call overhead on 2000 items).
- `segments = segments.filter(s => s.age < 600)` → in-place splice-from-end loop (avoids
  allocating a new array every frame).

---

### Issue 3 — Particle system on a separate 2D canvas (full-screen compositor overhead)

**Evidence:** `renderer.js:73-81` creates a standalone `<canvas>` element, appended to
`document.body` above the PixiJS WebGL canvas (z-index 10). The browser must maintain two
full-screen GPU textures and composite them together every frame. On a mobile GPU, compositing
two 1080p+ surfaces (physical pixels at 2× or 3× DPR) is a substantial per-frame bandwidth cost
that runs continuously regardless of particle count.

Additional small cost: `draw()` at `renderer.js:128` sets `ctx.fillStyle` via a template
literal per particle per frame — a new string allocation each call.

**Fix: move particles into PixiJS world space.**

Replace `initParticles()` with an implementation that:
- Creates a PixiJS `Graphics` object instead of a DOM canvas.
- Returns `{ graphics, emit, draw }` where `graphics` is the PixiJS object (replacing `canvas`).
- Stores particle color as a hex integer (`0xFFFFFF`, `0x00FFFF`, `0xFF00FF`, `0xFF7800`) instead
  of a CSS string partial.
- In `draw()`: `graphics.clear()`, then for each live particle update position/alpha and call
  `graphics.circle(p.wx, p.wy, p.radius).fill({ color: p.color, alpha: p.alpha })`.
- Since particles are added to `S.world`, their positions are already in world space — no `camX`,
  `camY`, `zoom` camera math needed. `draw()` takes no parameters.

In `app.js`:
- After `S.particles = initParticles()`, add `S.world.addChild(S.particles.graphics)` (after car
  sprites so particles render on top).
- Remove the old `canvas` reference (it was only ever appended to `document.body`; nothing else
  held onto it).

In `gameLoop.js:316`: `S.particles.draw(cam.x, cam.y, S.ZOOM)` → `S.particles.draw()`.

**Gameplay impact: none.** Drift particles are purely cosmetic. Visual appearance is identical —
same colors, same positions, same physics. The only change is they now live in world space, which
is correct since they already used world coordinates internally.

**Note on per-particle draw count:** with typically 20–50 active particles at peak drift, even
50 individual PixiJS `fill()` calls is vastly cheaper than the compositor blending two full-screen
textures. If batching is ever needed, particles can be grouped by color (4 groups) with a single
`fill()` per group — but this is not needed now.

---

### Issue 4 — Debug panel built every frame unconditionally (quick fix, included for completeness)

**Evidence:** `gameLoop.js:319-327` builds a string with 6 `isOnTrack` calls and sets
`debugDiv.innerHTML` every frame regardless of `debugDiv.style.display`. Confirmed `display` is
`'none'` by default (`hud.js:189`). Setting `innerHTML` on a hidden element still parses the HTML.

**Fix:** wrap the entire block in `if (debugDiv.style.display !== 'none')`.

---

## Files changed and what changes

| File | Change |
|---|---|
| `src/renderer.js` | `emitSeg` gains `onTrack` param; `draw` loses `isOnTrackFn` param; skid draw loop rewritten to bucket-batch strokes; `initParticles` rewritten to use PixiJS Graphics |
| `src/gameLoop.js` | `emitCarEffects` passes `state.onTrack` to `emitSeg`; `skids.draw` loses the lambda arg; `particles.draw()` loses camera args; debug block guarded on display |
| `src/app.js` | After `initParticles()`, add `S.world.addChild(S.particles.graphics)` |

No other files touched. No gameplay, physics, AI, or HUD logic changes.

---

## Expected outcome

Issues 1 and 2 together eliminate ~2,000,000 float ops per frame from the hot path and reduce GPU
skid draw calls from ≤2000 to ≤16. Issue 3 removes a full-screen texture composite. These three
combined should drop mobile CPU and GPU temperature substantially. The game should feel and play
identically.
