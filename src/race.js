import { S } from './state.js';
import { placeOnGrid, warmUpAI, rebuildTrack } from './trackManager.js';
import { controlsDiv, finishedDiv, deltaDiv, showLabels } from './hud.js';
import { showTrackSelect } from './menu.js';
import { showSessionSummary } from './session.js';
import { createRng } from './track.js';
import { rerollSplineParams } from './ai.js';
import { START_FUEL } from './car.js';

export function getRaceProgress(car) {
  if (car.lap >= S.raceConfig.totalLaps) {
    return S.raceConfig.totalLaps + 1.0 - (car._finishOrder || 999) * 0.001;
  }
  return car.lap + car._trackIdx / S.trackSamples;
}

export function getLeader() {
  let best = -1, leader = S.player;
  for (const c of S.allCars) {
    const prog = getRaceProgress(c);
    if (prog > best) { best = prog; leader = c; }
  }
  return leader;
}

export function getColorName(hex) {
  if (hex === 0x00FFFF) return 'Cyan';
  if (hex === 0xFF00FF) return 'Magenta';
  if (hex === 0x00FF00) return 'Green';
  if (hex === 0xFF8000) return 'Orange';
  if (hex === 0xFFFF00) return 'Yellow';
  if (hex === 0x8000FF) return 'Purple';
  return 'Unknown';
}

export function resetCarsForNewRace() {
  for (let i = 0; i < S.aiCars.length; i++) {
    placeOnGrid(S.aiCars[i], i);
    S.aiCars[i].lap = 0; S.aiCars[i].prevPos = 0; S.aiCars[i]._trackIdx = 0;
    S.aiCars[i].vx = 0; S.aiCars[i].vy = 0; S.aiCars[i]._steerInertia = 0;
    S.aiCars[i]._lapDelta = 0; S.aiCars[i]._draftBoost = 0;
    S.aiCars[i]._offTrackSince = 0; S.aiCars[i]._finishOrder = 0; S.aiCars[i]._stuckFrames = 0;
    S.aiCars[i]._inPitZone = false; S.aiCars[i]._pitActive = false;
    S.aiCars[i]._pitStopTimer = 0; S.aiCars[i]._pitInvulTimer = 0;
    S.aiCars[i]._pitZoneFrames = 0;
    if (S.aiCars[i]._trackMemory) S.aiCars[i].aiType = 'waypoint';
    const aiRng = createRng(S.trackSeed + i);
    rerollSplineParams(S.aiCars[i], aiRng);
  }
  placeOnGrid(S.player, 5);
  S.player.lap = 0; S.player.prevPos = 0; S.player._trackIdx = 0;
  S.player.vx = 0; S.player.vy = 0;
  S.player._lapDelta = 0; S.player._finishOrder = 0;
  S.player.fuel = START_FUEL; S.player.fuelFlow = 0; S._fuelWarningShown = false;
  S.player.tireWear = 0;
  S.player._physicsLogFrame = undefined; S.player._logAccel = false;
  S._pitZoneFrames = 0;
  for (const ai of S.aiCars) { ai._physicsLogFrame = undefined; ai._logAccel = false; }
  S._inPitZone = false; S._pitActive = false; S._pitStopTimer = 0; S._pitFuelToAdd = 0; S._pitInvulTimer = 0;
  S._finishCounter = 0;
  S.raceStarted = false;
  S.raceFinished = false;
  S.raceFrame = 0;
  S.playerFinishFrame = 0;
  S._splitFrames = [null, null, null];
  S.challengeTime = null;
  S.challengeLaps = null;
  S.challengeSplits = null;
  finishedDiv.style.display = 'none';
  deltaDiv.style.display = 'none';
  S._waitForGasRelease = true;
  showLabels();
}

export async function advanceToNextTrack() {
  if (S._advancingTrack) return;
  S._advancingTrack = true;
  finishedDiv.style.display = 'none';
  deltaDiv.style.display = 'none';
  S.controlsAcknowledged = false;
  controlsDiv.style.display = '';

  const sel = await showTrackSelect(S.sessionRaces.length > 0, controlsDiv);
  if (sel.endSession) {
    S._advancingTrack = false;
    await endSession();
    return;
  }

  S.raceStarted = false;
  S.player.trackDifficulty = sel.difficulty;
  rebuildTrack(sel.difficulty, sel.seed);
  await warmUpAI();
  resetCarsForNewRace();
  S._advancingTrack = false;
}

export async function endSession() {
  if (S._advancingTrack) return;
  S._advancingTrack = true;
  finishedDiv.style.display = 'none';
  deltaDiv.style.display = 'none';
  await showSessionSummary(S.sessionRaces);

  S.raceStarted = false;
  S.sessionRaces = [];
  S.controlsAcknowledged = false;
  controlsDiv.style.display = '';

  const sel = await showTrackSelect(false, controlsDiv);
  S.player.trackDifficulty = sel.difficulty;
  rebuildTrack(sel.difficulty, sel.seed);
  await warmUpAI();
  resetCarsForNewRace();
  S._advancingTrack = false;
}
