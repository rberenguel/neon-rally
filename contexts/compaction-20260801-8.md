# Session Compaction Summary

## User Intent
- Reorganise the monolithic `app.js` into focused modules
- Bump track difficulty tiers so the easiest tier is actually interesting
- Add performance safeguards against skid-mark overload on smooth tracks
- Polish the README and ensure `next.md` is fully resolved
- Add an installable-app update banner with dismiss option

## Contextual Work Summary

### Code Organisation
- Extracted `app.js` (~1235 lines) into five new modules:
  - `state.js` — central mutable state object
  - `hud.js` — all DOM overlays, minimap, challenge helpers, PWA banner
  - `trackManager.js` — track rebuild, grid placement, AI warmup
  - `race.js` — race state machine, session flow
  - `gameLoop.js` — per-frame ticker
- `app.js` is now ~240 lines of pure bootstrap
- Moved all game modules into `src/`; 3rd-party code stays in `libs/`

### Track Difficulty Rebalance
- Removed the old "Smooth" tier (ellipse/k=2, essentially a circle)
- Shifted all tiers up: Smooth = old Technical, Technical = old Chaotic, Chaotic = new wilder tier (7–9 harmonics, larger amplitude)
- `menu.js` labels unchanged but each slot now generates harder geometry

### Performance Safeguards
- Skid mark segments capped at 2000 in `renderer.js` — drops oldest when exceeded
- Game loop capped at 45 fps via `app.ticker.maxFPS`

### README & Documentation
- Added icon and session summary screenshot to README
- Applied prose-orchestrator frameworks (Zinsser/Clark/STE) for tighter prose
- Rewrote AI Learning section to be honest about its limitations (waypoint-only, simple caution memory)
- Fixed play-it link to `mostlymaths.net/neon-racer`
- `next.md` marked complete; user deleted it afterward

### SW Update Banner
- Added `update-banner` to `index.html` with neon-styled CSS
- Detects `updatefound` → `activated` with existing controller, then shows banner
- Includes subtle `×` close button on the right (dim, brightens on hover)
- Removed naive SW registration from `app.js`; proper lifecycle lives in `index.html`

### Version Bump
- `manifest.json`: added `"version": "0.9.0"`
- `sw.js`: cache renamed to `neon-rally-v0.9.0`

## Files Touched

### New modules
- **`src/state.js`**: Central state object holding all shared mutable state
- **`src/hud.js`**: All DOM overlay creation and updates extracted from `app.js`
- **`src/trackManager.js`**: Track rebuild, car placement, AI warmup logic
- **`src/race.js`**: Race progress, ranking, `advanceToNextTrack`, `endSession`
- **`src/gameLoop.js`**: Full `app.ticker.add` callback moved out of `app.js`

### Modified
- **`src/app.js`**: Stripped down to splash → init → setup → bootstrap flow
- **`src/renderer.js`**: Added `MAX_SEGMENTS = 2000` cap to skid marks
- **`src/controls.js`**: `../libs/controlHandling.js` path fix after `src/` move
- **`track.js`**: Rebalanced harmonic generation across three tiers
- **`index.html``: Added update banner DOM + SW lifecycle script, `src/app.js` entry point
- **`sw.js`**: Added all `src/*.js` paths, bumped cache version
- **`manifest.json`**: Added version field `0.9.0`
- **`README.md`**: Full rewrite with icon, screenshot, honest AI description, architecture table
