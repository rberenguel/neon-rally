# Session Compaction Summary

## User Intent
- Build a browser-based top-down racing game with PixiJS, inspired by Gene Rally's savage drift physics
- Create a kinematic car model where momentum fights steering, making drift feel "painful" and mass-like
- Iterate physics via live tuning sliders (lil-gui) to find the right feel before building game layers

## Contextual Work Summary

### Rendering & World
- Full-window PixiJS 8 canvas with a 4000×4000 arena and centered camera following the car
- Neon visual style: dark background, bright cyan car triangle, magenta arena border, dot-grid reference
- Rounded-rect racetrack centered in the arena with asphalt surface, glow aura, and center line
- Track width bumped to 150px; car starts on the top straight facing right

### Input
- Arrow keys with inverted mapping: `ArrowDown` accelerates, `ArrowUp` brakes (documented as user preference)
- Live lil-gui panel for tuning: acceleration, maxSpeed, turnSpeed, friction, grip

### Physics Evolution
- Started with simple velocity-rotation lerp (grip coefficient)
- Added speed-dependent steering reduction (high speed = less front-wheel bite)
- Added speed-dependent lateral grip falloff (grip drops to ~15% at max speed)
- Added slip-angle traction reduction (acceleration crippled when sideways)
- Replaced "rotate velocity toward heading" with pure sideways-velocity subtraction (preserves momentum direction)
- Added track vs off-track surface detection; grass has 0.2× grip and higher friction drag

### Current State
- Car physics is functional but not yet matching the Gene Rally "mass/inertia" feel
- User reports: car still takes corners too cleanly, lacks the sensation of weight and savage drift
- Likely need to revisit the core velocity integration model or add angular momentum/inertia concepts

## Files Touched

### Core Game
- **app.js**: All car physics, rendering, camera, track geometry, surface checks, and game loop
- **index.html**: Entry point with PixiJS 8 CDN import map and lil-gui ESM import

### Context
- **contexts/compaction-20260730-1.md**: This summary document
