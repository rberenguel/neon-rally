# Future improvements

## Proper menu
Replace the current overlay with a real menu that has controls enabled (gamepad/keyboard navigable). Should handle track selection, race settings, and credits from one place.

## Mobile / touch ✓
Zone-based touch controls (LD = steer left, RD = steer right, gas auto, both-top = brake, both-bottom = powerup/start). No visual overlay. Mobile layout: viewport-fit cover, minimap top-right, clamp font sizes, zoom-out at 0.5× world scale so more of the track is visible.

## Time attack & shareable challenges ✓
Race time (frame-accurate, shown as m:ss.cc) displayed live in the HUD. On finish a centered overlay (matching the main menu style) shows place, time, challenge result (green beat / red miss), a copyable challenge URL, and a Next Race button. URL encodes `track`, `laps`, and `best` — loading it sets the lap count and shows the challenge target live in the HUD.

## Splash screen ✓
Animated intro (`splash.js`) using a separate PixiJS app (destroyed before game initialises). Two cars (cyan player, magenta AI) shown diagonally at 135°, gently bobbing, wheels wiggling, with particle trails rendered below the cars via PixiJS Graphics. "NEON RALLY" title in Sixtyfour font with cyan glow. Dismissed on any key/tap.

## PWA / installable ✓
`manifest.json`, `sw.js` (cache-first service worker), manifest link + theme-color in `index.html`. Install prompt: Android/Chrome intercepts `beforeinstallprompt` and shows a banner; iOS shows "Tap Share → Add to Home Screen" instructions for 6 s on first load.

## Better splash screen
The current splash shows two static cars with particles. A more cinematic version could animate the cars driving across the screen, or render the actual track in the background.

## Hide the parameter tuning GUI ✓
Gated behind `window.showTuning()` in the browser console, or append `&tuning` to any URL hash to auto-open it on load.

## Bug: waypoint AI stuck after sharp-curve failure ✓
If a waypoint AI car has near-zero speed off-track for 2 s, it is temporarily rescued by switching to spline mode (reliable centerline follower). Once it returns on-track, it hands back to waypoint mode.

## Code organisation
The game logic, rendering, and UI wiring are all tangled in `app.js`. Worth splitting into clearer modules — e.g. `race.js` for race state machine, `hud.js` for all DOM overlays, keeping `app.js` as thin bootstrap only.
