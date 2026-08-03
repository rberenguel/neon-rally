import { TRACK_WIDTH, TRACK_HALF, generateTrack, drawTrackPath, isOnTrack, computeSpeedProfile } from './track.js';
import { pretrainAI } from './ai.js';
import { clearPowerups } from './powerups.js';
import { S } from './state.js';

const TRACK_PALETTE = [0x00FFFF, 0xFF00FF, 0x00FF00, 0xFF8000, 0xFFFF00, 0x8000FF];

const ARROW_LOOKAHEAD = 350;  // world units upstream of apex to place the group
const ARROW_SPACING   = 32;   // world units between chevrons in the group (centred)
const CURV_GENTLE     = 0.013; // 1 chevron
const CURV_MEDIUM     = 0.029; // 2 chevrons  (midpoint between gentle and hairpin)
const CURV_HAIRPIN    = 0.045; // 3 chevrons

function drawTurnArrows(gfx, pts, color) {
  const N = pts.length;

  // Signed curvature: sin of heading change per step
  const raw = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    const a = pts[(i - 1 + N) % N], b = pts[i], c = pts[(i + 1) % N];
    const dx1 = b.x - a.x, dy1 = b.y - a.y;
    const dx2 = c.x - b.x, dy2 = c.y - b.y;
    const len = Math.hypot(dx1, dy1) * Math.hypot(dx2, dy2);
    raw[i] = len > 0.001 ? (dx1 * dy2 - dy1 * dx2) / len : 0;
  }

  // Smooth over ±3 points
  const curv = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    let sum = 0;
    for (let k = -3; k <= 3; k++) sum += raw[(i + k + N) % N];
    curv[i] = sum / 7;
  }

  // Find local maxima above CURV_GENTLE with minimum separation
  const apexes = [];
  for (let i = 0; i < N; i++) {
    const abs = Math.abs(curv[i]);
    if (abs < CURV_GENTLE) continue;
    let isMax = true;
    for (let k = -8; k <= 8; k++) {
      if (k !== 0 && Math.abs(curv[(i + k + N) % N]) > abs) { isMax = false; break; }
    }
    if (!isMax) continue;
    let tooClose = false;
    for (const a of apexes) {
      if (Math.min(Math.abs(i - a.idx), N - Math.abs(i - a.idx)) < 60) { tooClose = true; break; }
    }
    if (!tooClose) apexes.push({ idx: i, curv: curv[i] });
  }

  for (const apex of apexes) {
    const abs   = Math.abs(apex.curv);
    const count = abs >= CURV_HAIRPIN ? 3 : abs >= CURV_MEDIUM ? 2 : 1;
    // positive cross = CW = right turn in screen space (Y-down)
    const sign  = apex.curv > 0 ? 1 : -1;

    // Walk upstream from apex to find placement point
    let dist = 0, placeIdx = apex.idx;
    for (let step = 1; step < N / 2; step++) {
      const i = (apex.idx - step + N) % N;
      const j = (i + 1) % N;
      dist += Math.hypot(pts[j].x - pts[i].x, pts[j].y - pts[i].y);
      if (dist >= ARROW_LOOKAHEAD) { placeIdx = i; break; }
    }

    // Chevrons point FORWARD (travel direction), arms span ACROSS the track.
    // Group is centred around placeIdx, spread along the travel direction.
    // e.g. count=3 → offsets [−S, 0, +S], count=2 → [−S/2, +S/2], count=1 → [0]
    const p0  = pts[placeIdx];
    const pn0 = pts[(placeIdx + 1) % N];
    const hl0 = Math.hypot(pn0.x - p0.x, pn0.y - p0.y);
    if (hl0 < 0.001) continue;
    const fx0 = (pn0.x - p0.x) / hl0, fy0 = (pn0.y - p0.y) / hl0; // forward
    const rpx = -fy0, rpy = fx0;                                      // right across track

    const TIP = 22, BACK = 10, SPAN = 55;
    const shift = sign * 50;  // shift group toward the turn
    const half = (count - 1) * 0.5;
    for (let c = 0; c < count; c++) {
      const offset = (c - half) * ARROW_SPACING;
      const cx = p0.x + rpx * (offset + shift), cy = p0.y + rpy * (offset + shift);

      // tip points toward the turn, arms spread forward/back along track
      const tipX = cx + sign * rpx * TIP,            tipY = cy + sign * rpy * TIP;
      const a1x  = cx - sign * rpx * BACK + fx0 * SPAN, a1y = cy - sign * rpy * BACK + fy0 * SPAN;
      const a2x  = cx - sign * rpx * BACK - fx0 * SPAN, a2y = cy - sign * rpy * BACK - fy0 * SPAN;

      gfx.moveTo(a1x, a1y).lineTo(tipX, tipY).lineTo(a2x, a2y);
    }
    const alpha = count === 3 ? 0.5 : count === 2 ? 0.35 : 0.2;
    gfx.stroke({ width: 8, color, alpha });
  }
}

export function rebuildTrack(difficulty, seedOrId = null, updateUrl = true) {
  const sm = S.mode ? S.mode.sizeMultiplier : 1.0;
  const ts = S.mode ? S.mode.trackSamples : 1000;
  const data = generateTrack(difficulty, 0, seedOrId, sm, ts);
  S.trackCenterline = data.points;
  S.trackRacingLine = data.racingLine;
  S.trackSpeedProfile = computeSpeedProfile(S.trackRacingLine);
  S.trackSpikiness = data.spikiness;
  S.trackSeed = data.seed;
  S.trackColor = TRACK_PALETTE[data.seed % TRACK_PALETTE.length];
  S.trackIdDisplay.current = data.trackId;
  if (S.trackIdController) S.trackIdController.updateDisplay();
  if (updateUrl) history.replaceState(null, '', '#track=' + data.trackId);

  S.trackSurf.clear();
  S.trackGlow.clear();
  S.trackLine.clear();
  drawTrackPath(S.trackSurf, S.trackCenterline, TRACK_WIDTH, 0x001122);
  drawTrackPath(S.trackGlow, S.trackCenterline, TRACK_WIDTH + 4, S.trackColor, 0.15);
  drawTrackPath(S.trackLine, S.trackCenterline, 2, S.trackColor, 0.6);
  drawTurnArrows(S.trackGlow, S.trackCenterline, S.trackColor);
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
      ai._trackMemory = new Float32Array(S.trackSamples);
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
