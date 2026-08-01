# Session Compaction Summary

## User Intent
- Fix the car physics to match Gene Rally's arcade feel: heavy momentum that redirects rather than scrubs speed
- Add visual feedback for drifting so the player can feel and see the slide
- Make control inversion a runtime toggle for easier A/B testing

## Contextual Work Summary

### Physics Pivot (post-Gemini review)
- Restored Slide Assist as momentum redirection: velocity vector rotates toward the car's heading without losing total speed
- Removed slip-angle traction penalty: full engine power is available even when completely sideways
- Replaced lateral-velocity-subtraction (which scrubbed kinetic energy) with a lerp toward the ideal forward-aligned velocity
- Added track vs off-track surface detection; grass has 0.2× grip and higher drag

### Visual Feedback
- Added a canvas-overlay particle system inspired by the destrier fireworks sketch
- Particles spawn from both rear tires when the car is sliding sideways (slip angle > 0.5 rad, speed > 3)
- Neon color palette: white, cyan, magenta, orange; intensity scales with drift severity
- Canvas is DPR-aware, pointer-events-none, and synced to the same camera transform as PixiJS

### Tuning UX
- Added `invertControls` boolean to the car state object
- Exposed it as a checkbox in the lil-gui panel
- Input loop reads `car.invertControls` live: unchecked = normal racing controls, checked = inverted (weird mode)

### Outstanding Issue
- Control feel is still "not right"; user wants time to think about exactly what is missing
- Likely need further iteration on steering response, grip curve, or acceleration profile

## Files Touched

### Core Game
- **app.js**: Complete physics rewrite (momentum redirection, surface checks, particle overlay, invertControls toggle)
- **index.html**: Already had lil-gui import map from prior session; no changes this round

### Context
- **contexts/compaction-20260730-2.md**: This summary document
