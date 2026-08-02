# Session Compaction Summary

## User Intent
- Diagnose why Neon Rally causes phone overheating (investigate only, no code changes)
- Verify the top findings thoroughly and produce a concrete implementation plan

## Contextual Work Summary

### Context Loading
- Read all 13 context files from `contexts/` and README to restore full project state
- Project is at v0.9.0; codebase split into `src/` modules after a major refactor

### Performance Investigation
- Identified 8 per-frame cost sources, ranked by impact
- Found that virtually all the overheating comes from three root causes in the rendering path

### Claim Verification — Issue 1 (isOnTrack per skid segment)
- Confirmed `renderer.js:162` calls `isOnTrackFn` once per skid segment in the draw loop
- `isOnTrack` is O(1000) brute force; with 2000 segments this is 2M `Math.hypot` calls/frame (~90M/sec at 45fps)
- Sole effect is cosmetic alpha: 0.25 on asphalt vs 0.15 on grass — 40% dimming
- Fix: bake `onTrack` at emit time using `state.onTrack` already available in `emitCarEffects`; remove `isOnTrackFn` param from `draw()` entirely

### Claim Verification — Issue 2 (2000 individual stroke() calls)
- Confirmed the skid draw loop calls `graphics.moveTo/lineTo/stroke()` per segment
- Each `stroke()` in PixiJS 8 commits a separate path instruction; because `segAlpha` is continuous (derived from unique `s.age`), no batching occurs → 2000 GPU draw ops/frame
- Fix: alpha bucketing (8 buckets × 2 on/off-track = ≤16 strokes/frame); also fix per-frame array allocations in the age/filter loop

### Claim Verification — Issue 3 (second canvas compositing)
- Confirmed `renderer.js:73-81` creates a standalone `<canvas>` appended to DOM above the PixiJS WebGL canvas
- Browser must composite two full-screen GPU textures every frame — mobile GPU bandwidth cost continuous regardless of particle count
- Per-particle `ctx.fillStyle` template literal also creates a new string allocation each call
- Fix: replace with PixiJS `Graphics` added to `S.world`; particles are already in world space so camera math disappears; `draw()` takes no args

### Claim Verification — Issue 4 (debug panel always built)
- Confirmed `gameLoop.js:319-327` builds string + 6 `isOnTrack` calls + sets `innerHTML` unconditionally even when `debugDiv.style.display === 'none'`
- Easy fix: guard entire block on display state; user confirmed debug is almost always off

### Plan Document
- Wrote `optimize.md` at project root with full verified findings, exact file/line references, implementation steps, and expected outcome for each issue
- No code changed this session

## Files Touched

### New Files
- **`optimize.md`**: Full optimization plan — verified findings, implementation steps, files/lines to change for issues 1–4

### Unmodified (read only)
- **`src/renderer.js`**, **`src/gameLoop.js`**, **`src/ai.js`**, **`src/hud.js`**, **`src/track.js`**, **`src/car.js`**, **`src/app.js`**, **`src/state.js`**, **`src/race.js`**: read for analysis only
