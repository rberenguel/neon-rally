# Session Compaction Summary

## User Intent
- Fix AI bugs introduced by a previous Claude session that broke waypoint tracking and caused cars to drive off-track
- Rebalance player vs AI difficulty after fixing the AI to be functional again
- Add shareable track IDs, minimap, and a learning system for AI cars

## Contextual Work Summary

### AI Restoration & Bug Fixes
- Reverted Claude's broken "personality" changes (noise, aggression, steering wobble) that made AI spin out
- Fixed root cause: `createWaypointAI` used `startIndex` for placement but `placeOnGrid` overrode it — created mismatch between car position and waypoint target
- Replaced broken waypoint system with dynamic lookahead based on nearest track point + curvature detection
- Added off-track recovery: AI searches ahead along its heading for a shallow rejoin angle instead of aiming at the nearest point
- Removed rubber-band AI entirely as requested

### Track System Overhaul
- Replaced radial Fourier noise with Catmull-Rom spline through random control points
- Tracks now have distinguishable straights and corners instead of perturbed circles
- Added deterministic seeded PRNG so tracks are shareable via 6-char alphanumeric IDs
- URL hash updates to `#track=ABC123` for easy sharing; `hashchange` listener reloads the track
- Added minimap (lower right) showing track shape and live car positions

### AI Learning System
- Each AI car has a `Float32Array(1000)` memory map recording caution per track point
- Caution raises when off-track or stuck; decays slowly over time
- On subsequent laps, high-caution segments trigger earlier braking and shorter lookahead
- Logs learning events to console for debugging

### Player vs AI Rebalancing
- Player `maxSpeed` tuned down to 8.8 (AI ceiling 10.5) with quadratic taper on last ~1.0 speed
- Player starts 6th on grid; launch stiction makes race starts bunched and competitive
- Draft/slipstream mechanic: +1.5 boost only for player↔AI (AI never drafts each other)
- Player-only understeer penalty on hard steering at speed; AI retains full grip for predictable cornering
- AI gets better grass recovery (`offTrackGrip` 2.0, `offTrackDecay` 0.99)

### UI Improvements
- Controls overlay on first load (must click OK before race starts)
- Debug panel hidden by default, toggle with `D` key or GUI checkbox
- `Total Laps` slider in GUI (default 5)
- Track ID input field + read-only current track display
- Speed HUD floats near player sprite (orange, subtle)
- `Parameter Tuning` panel starts collapsed
- Race finish stops and waits for ENTER; ESC stays to watch AI finish

## Files Touched

### Core Logic
- **ai.js**: Complete rewrite of `updateWaypointAI` with curvature braking, stable nearest-point search, off-track recovery, learning memory, per-car risk factor
- **car.js**: Player-only acceleration taper, player-only understeer on hard steer, launch stiction, off-track grip/decay per-car properties
- **track.js**: Catmull-Rom spline generation, Mulberry32 seeded PRNG, `seedToTrackId` / `trackIdToSeed` round-trip encoding
- **app.js**: Shareable track hash routing, minimap, controls overlay, speed HUD, lap announcements, finish prompt, grid positioning (player 6th)
