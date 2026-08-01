import { TRACK_WIDTH, TRACK_HALF, generateTrack, drawTrackPath, isOnTrack, computeSpeedProfile } from './track.js';
import { pretrainAI } from './ai.js';
import { clearPowerups } from './powerups.js';
import { S } from './state.js';

const TRACK_PALETTE = [0x00FFFF, 0xFF00FF, 0x00FF00, 0xFF8000, 0xFFFF00, 0x8000FF];

export function rebuildTrack(difficulty, seedOrId = null, updateUrl = true) {
  S.trackColor = TRACK_PALETTE[Math.floor(Math.random() * TRACK_PALETTE.length)];
  const data = generateTrack(difficulty, 0, seedOrId);
  S.trackCenterline = data.points;
  S.trackRacingLine = data.racingLine;
  S.trackSpeedProfile = computeSpeedProfile(S.trackRacingLine);
  S.trackSpikiness = data.spikiness;
  S.trackSeed = data.seed;
  S.trackIdDisplay.current = data.trackId;
  if (S.trackIdController) S.trackIdController.updateDisplay();
  if (updateUrl) history.replaceState(null, '', '#track=' + data.trackId);

  S.trackSurf.clear();
  S.trackGlow.clear();
  S.trackLine.clear();
  drawTrackPath(S.trackSurf, S.trackCenterline, TRACK_WIDTH, 0x001122);
  drawTrackPath(S.trackGlow, S.trackCenterline, TRACK_WIDTH + 4, S.trackColor, 0.15);
  drawTrackPath(S.trackLine, S.trackCenterline, 2, S.trackColor, 0.6);
  S.skids.clear();
  clearPowerups(S.powerupLayer);

  // Draw minimap track
  S.minimapTrack.clear();
  if (S.trackCenterline.length > 0) {
    S.minimapTrack.moveTo(S.trackCenterline[0].x * S.MINIMAP_SCALE, S.trackCenterline[0].y * S.MINIMAP_SCALE);
    for (let i = 1; i < S.trackCenterline.length; i++) {
      S.minimapTrack.lineTo(S.trackCenterline[i].x * S.MINIMAP_SCALE, S.trackCenterline[i].y * S.MINIMAP_SCALE);
    }
    S.minimapTrack.lineTo(S.trackCenterline[0].x * S.MINIMAP_SCALE, S.trackCenterline[0].y * S.MINIMAP_SCALE);
    S.minimapTrack.stroke({ width: 1.5, color: S.trackColor, alpha: 0.5 });
  }

  // Recalculate start line & grid
  S.startPt = S.trackCenterline[0];
  S.nextPt = S.trackCenterline[1];
  S.tangent = Math.atan2(S.nextPt.y - S.startPt.y, S.nextPt.x - S.startPt.x);
  S.perpAngle = S.tangent + Math.PI / 2;
  S.perpX = Math.cos(S.perpAngle);
  S.perpY = Math.sin(S.perpAngle);
  S.backX = -Math.cos(S.tangent);
  S.backY = -Math.sin(S.tangent);

  // Redraw finish line
  S.finishLine.clear();
  S.finishLine.moveTo(S.startPt.x - S.perpX * TRACK_HALF, S.startPt.y - S.perpY * TRACK_HALF);
  S.finishLine.lineTo(S.startPt.x + S.perpX * TRACK_HALF, S.startPt.y + S.perpY * TRACK_HALF);
  S.finishLine.stroke({ width: 3, color: 0xFFFFFF, alpha: 0.7 });
}

export function placeOnGrid(car, index) {
  const row = Math.floor(index / 2);
  const side = (index % 2 === 0) ? -1 : 1;
  car.x = S.startPt.x + S.perpX * side * 35 + S.backX * row * 50;
  car.y = S.startPt.y + S.perpY * side * 35 + S.backY * row * 50;
  car.rotation = S.tangent + Math.PI / 2;
}

export async function warmUpAI() {
  const overlay = document.createElement('div');
  overlay.style.cssText = `position:fixed;inset:0;background:rgba(0,0,10,0.82);z-index:8000;
    display:flex;align-items:center;justify-content:center;font-family:monospace;`;
  overlay.innerHTML = `<div style="color:#00FFFF;font-size:18px;letter-spacing:3px;text-shadow:0 0 12px #00FFFF">
    LOADING&hellip;</div>`;
  document.body.appendChild(overlay);
  await new Promise(r => setTimeout(r, 30)); // let browser paint the overlay
  for (const ai of S.aiCars) {
    if (ai.aiType === 'spline') {
      ai._speedProfile = S.trackSpeedProfile;
      ai._trackCenterline = S.trackRacingLine;
    } else {
      ai._trackMemory = new Float32Array(1000);
      ai._trackCenterline = S.trackRacingLine;
      pretrainAI(ai, S.trackRacingLine, (x, y) => isOnTrack(x, y, S.trackCenterline), S.arena);
    }
  }
  placeAllCars();
  document.body.removeChild(overlay);
}

export function placeAllCars() {
  for (let i = 0; i < S.aiCars.length; i++) placeOnGrid(S.aiCars[i], i);
  placeOnGrid(S.player, 5);
}
