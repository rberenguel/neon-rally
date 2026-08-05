// Central mutable state — populated during app.js init, read by race.js / gameLoop.js / hud.js.
export const S = {
  // Pixi / rendering
  app: null,
  world: null,
  finishLine: null,
  trackSurf: null,
  trackGlow: null,
  trackLine: null,
  debugGfx: null,
  skids: null,
  particles: null,
  powerupLayer: null,
  minimap: null,
  minimapBg: null,
  minimapTrack: null,
  minimapDots: null,
  playerSprite: null,
  aiSprites: [],

  // Cars
  player: null,
  aiCars: [],
  allCars: [],

  // Track
  trackCenterline: [],
  trackRacingLine: [],
  trackSpeedProfile: null,
  trackSpikiness: 0,
  trackSeed: null,
  trackColor: 0x00FFFF,
  trackIdDisplay: { current: '-' },
  trackIdController: null,
  startPt: null,
  nextPt: null,
  tangent: 0,
  perpAngle: 0,
  perpX: 0,
  perpY: 0,
  backX: 0,
  backY: 0,
  arena: { x: 0, y: 0, width: 4000, height: 4000 },

  // Display
  ZOOM: 1,
  _isMobile: false,
  MAP_W: 220,
  MINIMAP_SCALE: 0.055,

  // Mode
  mode: null,
  trackSamples: 1000,
  aiGapFactor: 1.0,

  // Race state
  raceConfig: { totalLaps: 5 },
  raceStarted: false,
  raceFinished: false,
  _finishCounter: 0,
  raceFrame: 0,
  sessionRaces: [],
  _advancingTrack: false,
  playerFinishFrame: 0,
  _splitFrames: [null, null, null],
  challengeTime: null,
  challengeLaps: null,
  challengeSplits: null,

  // Pit stop
  pitBox: null,
  _inPitZone: false,
  _pitActive: false,
  _pitStopTimer: 0,
  _pitFuelToAdd: 0,
  _pitChangeTires: false,
  _pitInvulTimer: 0,

  // Powerups
  _powerupSpawnTimer: 0,
  POWERUP_SPAWN_INTERVAL: 600,

  // Controls / flow
  paused: false,
  _pauseCooldown: 0,
  _activateCooldown: 0,
  _fuelFlowCooldown: 0,
  _pitMenuStepCooldown: 0,
  controlsAcknowledged: false,
  _waitForGasRelease: false,
  input: { steerLeft: false, steerRight: false, gas: false, activate: false, pause: false, fuelFlowUp: false, fuelFlowDown: false },
  _ctrlInput: { steerLeft: false, steerRight: false, gas: false, activate: false, pause: false, fuelFlowUp: false, fuelFlowDown: false },
  pollControls: null,
  pollTouch: null,
  _ctrlPoll: null,
};
