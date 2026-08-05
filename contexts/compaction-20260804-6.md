# Session Compaction Summary

## User Intent
- Fix massive player acceleration deficit at race start in GP mode
- Polish mobile UX (controls dismissal, pit menu accidental taps)
- Reduce fuel consumption and AI speed gap for better GP pacing
- Convert Magenta AI from broken waypoint to player-cloned spline
- Enable high-DPI rendering for crisp visuals on mobile

## Contextual Work Summary

### Critical Bug Fix: Player Acceleration
- Root cause was gamepad button flicker — single-frame `pressed = false` drops from `navigator.getGamepads()` caused `gas` to be `false` on ~35% of frames
- Added 2-frame debounce on gamepad `gas` only in `controlHandling.js`
- Fixed edge case where untouched buttons defaulted to `pressed = true` on first poll (caused race auto-start on page load)
- Momentary inputs (`activate`, `pause`, steer) bypass debounce so menus work correctly

### Auto-Pit Fix
- Auto-pit on low fuel now pauses and opens the fuel-choice menu instead of silently refueling
- Player can choose fuel amount or cancel and drive away

### Mobile Controls Dismissal
- Fixed tap on button text not registering due to `e.target.tagName` checking only the exact element touched (not parent button)
- Fixed `pollTouch` being gated on `controlsAcknowledged` — now always polls but zeroes non-activate inputs while modal is open
- Pit menu on mobile: `activate`/`pause` touch zones suppressed so tapping CU/CD doesn't accidentally confirm/cancel

### Rendering
- Enabled Pixi `resolution: window.devicePixelRatio` + `autoDensity: true` for crisp 1:1 pixel rendering on mobile
- Kept `S.ZOOM = 0.5` on mobile for viewport size; now rendered at native resolution

### Balance Tuning
- Fuel burn reduced ~30% (`0.000013` → `0.000009`) — stretches tank from ~5 to ~7 laps, making a 15-lap GP viable with 1 pit stop
- AI raw maxSpeed range tightened (`9.5 + rand*1.0` → `9.0 + rand*0.8`) — much closer to player baseline of 9.2

### Magenta AI Rework
- Converted from `waypoint` to `spline` with `clonePlayer: true`
- Copies player physics but worse spline tuning (sluggish steering, late reactions, early braking)
- Eliminates old waypoint slalom behavior while keeping magenta as the worst car

### Documentation
- `gp-mode.md` updated with checkbox status and revised build order

## Files Touched

### Core Physics / Input
- **libs/controlHandling.js**: Gamepad gas debounce (2 frames), untouched-button fix
- **src/car.js**: Fuel burn rate reduced; per-frame physics logging added then retained
- **src/touch.js**: Interactive element detection via `.closest()`; pit menu zone suppression

### AI
- **src/ai.js**: `createWaypointAI`, `createSplineAI`, `rerollSplineParams` — tightened maxSpeed range
- **src/app.js**: Magenta def changed to `spline` + `clonePlayer`; clone override applied post-creation

### Game Loop / HUD
- **src/gameLoop.js**: Auto-pit opens menu; `pollTouch` always active with input gating

### Rendering
- **src/app.js**: Pixi `resolution` and `autoDensity` enabled

### Metadata
- **manifest.json**: `0.10.0` → `0.10.4` across session
- **sw.js**: Cache names bumped to match
- **gp-mode.md**: Status updated with decisions and revised build order
