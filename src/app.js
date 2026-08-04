import { Application, Container, Graphics } from 'pixi.js';
import GUI from 'lil-gui';
import { showSplash } from './splash.js';
import { createCar } from './car.js';
import { createCarSprite, initParticles, initSkids } from './renderer.js';
import { createWaypointAI, createSplineAI } from './ai.js';
import { createPowerupLayer } from './powerups.js';
import { initEngineSound } from './audio.js';
import { makeControlHandler } from './controls.js';
import { initTouchControls } from './touch.js';
import { showTrackSelect, showModeSelect } from './menu.js';
import { S } from './state.js';
import { rebuildTrack, warmUpAI, placeAllCars } from './trackManager.js';
import { initHud, initOrientationGuard, dismissControls, parseHash, decodeChallenge, setupPwaBanner, controlsDiv, debugDiv } from './hud.js';
import { startGameLoop } from './gameLoop.js';
import { createRng } from './track.js';

// --- 0. ORIENTATION GUARD + SPLASH ---
initOrientationGuard();
await showSplash();

// --- 0b. MODE SELECT ---
const selectedMode = await showModeSelect();
S.mode = selectedMode;
S.trackSamples = selectedMode.trackSamples;
S.arena.width = selectedMode.arenaSize;
S.arena.height = selectedMode.arenaSize;
S.raceConfig.totalLaps = selectedMode.totalLaps;
S.aiGapFactor = Math.pow(selectedMode.sizeMultiplier, -0.5);

// --- 1. PIXI SETUP ---
S.app = new Application();
await S.app.init({ resizeTo: window, backgroundColor: 0x050510, antialias: true, resolution: window.devicePixelRatio, autoDensity: true });
document.body.appendChild(S.app.canvas);
initEngineSound();

S.world = new Container();
S.app.stage.addChild(S.world);

S.finishLine = new Graphics();

// Arena visuals
const arenaBorder = new Graphics()
  .rect(S.arena.x, S.arena.y, S.arena.width, S.arena.height)
  .stroke({ color: 0xFF00FF, width: 2, alpha: 0.15 });
S.world.addChild(arenaBorder);

const arenaGrid = new Graphics();
for (let gx = S.arena.x + 100; gx < S.arena.x + S.arena.width; gx += 200) {
  for (let gy = S.arena.y + 100; gy < S.arena.y + S.arena.height; gy += 200) {
    arenaGrid.circle(gx, gy, 3.5);
    arenaGrid.fill({ color: 0x7777AA, alpha: 0.6 });
  }
}
S.world.addChild(arenaGrid);

// Skids layer
S.skids = initSkids();

// Track layers
S.trackKerb = new Graphics();
S.trackSurf = new Graphics();
S.trackGlow = new Graphics();
S.trackLine = new Graphics();
S.debugGfx  = new Graphics();
S.world.addChild(S.trackKerb);
S.world.addChild(S.trackSurf);
S.world.addChild(S.trackGlow);
S.world.addChild(S.trackLine);
S.world.addChild(S.debugGfx);
S.world.addChild(S.finishLine);
S.world.addChild(S.skids.graphics);

// Powerups
S.powerupLayer = createPowerupLayer(S.world);

// Minimap
S._isMobile = 'ontouchstart' in window || window.innerWidth < 768;
S.ZOOM = S._isMobile ? 0.5 : 1.0;
S.world.scale.set(S.ZOOM);
S.MAP_W = S._isMobile ? 130 : 220;
S.MINIMAP_SCALE = S.MAP_W / S.arena.width;

S.minimap = new Container();
S.app.stage.addChild(S.minimap);

S.minimapBg = new Graphics();
S.minimapBg.rect(0, 0, S.MAP_W, S.MAP_W);
S.minimapBg.fill({ color: 0x000000, alpha: 0.5 });
S.minimapBg.stroke({ color: 0x00FFFF, width: 1, alpha: 0.4 });
S.minimap.addChild(S.minimapBg);

S.minimapTrack = new Graphics();
S.minimap.addChild(S.minimapTrack);

S.minimapDots = new Graphics();
S.minimap.addChild(S.minimapDots);

// --- 2. CONTROLS ---
S.pollControls = makeControlHandler(S.input);
S.pollTouch = initTouchControls(S.input);
S._ctrlPoll = makeControlHandler(S._ctrlInput);

// --- 3. PARSE HASH ---
const _initialHash = parseHash(window.location.hash);
const hashTrack = _initialHash.track ? [null, _initialHash.track] : null;
const _showTuningOnLoad = 'tuning' in _initialHash;

const _initChallenge = _initialHash.challenge ? decodeChallenge(_initialHash.challenge) : null;
S.challengeTime = _initChallenge ? _initChallenge.frames : null;
S.challengeLaps = _initChallenge ? _initChallenge.laps : null;
S.challengeSplits = _initChallenge ? _initChallenge.splits : null;
if (S.challengeLaps) S.raceConfig.totalLaps = S.challengeLaps;

// --- 4. INITIAL TRACK (dummy, thrown away if user selects via menu) ---
rebuildTrack(0.6, hashTrack ? hashTrack[1] : null, !!hashTrack);

// --- 5. CARS ---
S.player = createCar(S.startPt.x, S.startPt.y, S.tangent + Math.PI / 2, 0x00FFFF);
S.player.invertControls = false;
S.player.trackDifficulty = 0.6;
S.player.isPlayer = true;
S.player.maxSpeed = 9.2;
S.player.acceleration = 0.14;
S.player.grip = 0.025;

S.playerSprite = createCarSprite(0x00FFFF, true);
S.world.addChild(S.playerSprite);
S.player.sprite = S.playerSprite;

const aiDefs = [
  { color: 0xFF00FF, name: 'Magenta', type: 'spline', clonePlayer: true },
  { color: 0x00FF00, name: 'Green',   type: 'spline', ace: true },
  { color: 0xFF8000, name: 'Orange',  type: 'spline' },
  { color: 0xFFFF00, name: 'Yellow',  type: 'spline' },
  { color: 0x8000FF, name: 'Purple',  type: 'spline' },
];

for (let i = 0; i < aiDefs.length; i++) {
  const def = aiDefs[i];
  const aiRng = createRng(S.trackSeed + i);
  const ai = def.type === 'spline'
    ? createSplineAI(S.trackRacingLine, def.color, S.trackSpeedProfile, def.ace, aiRng)
    : createWaypointAI(S.trackRacingLine, def.color);
  const sprite = createCarSprite(def.color, false);
  S.world.addChild(sprite);
  ai.sprite = sprite;
  ai.def = def;
  ai.lap = 0;
  ai.prevPos = 0;
  ai._trackIdx = 0;
  if (def.clonePlayer) {
    ai._clonePlayer = true;
    ai.maxSpeed = S.player.maxSpeed;
    ai.acceleration = S.player.acceleration;
    ai.grip = S.player.grip;
    ai.turnSpeed = S.player.turnSpeed;
    ai.offTrackGrip = S.player.offTrackGrip || 1.0;
    ai.offTrackDecay = S.player.offTrackDecay || 0.965;
    ai._steerSmooth = 0.06;
    ai._lookAhead = 20;
    ai._speedTolerance = 0.1;
  }
  S.aiCars.push(ai);
  S.aiSprites.push(sprite);
}

S.allCars = [S.player, ...S.aiCars];
placeAllCars();

S.player.lap = 0; S.player.prevPos = 0; S.player._trackIdx = 0; S.player._lapDelta = 0;
for (const ai of S.aiCars) { ai.prevPos = 0; ai._trackIdx = 0; ai._lapDelta = 0; }

// --- 6. HUD ---
initHud({
  _isMobile: S._isMobile,
  challengeTime: S.challengeTime,
  challengeLaps: S.challengeLaps,
  onDismiss: dismissControls,
});

// --- 7. AI WARMUP (hash track only) ---
if (hashTrack) await warmUpAI();

// --- 8. INITIAL TRACK SELECT (no hash) ---
if (!hashTrack) {
  const initSel = await showTrackSelect(false, controlsDiv);
  S.player.trackDifficulty = initSel.difficulty;
  rebuildTrack(initSel.difficulty, initSel.seed);
  await warmUpAI();
  placeAllCars();
  for (const ai of S.aiCars) { ai.lap = 0; ai.prevPos = 0; ai._trackIdx = 0; ai.vx = 0; ai.vy = 0; }
  S.player.lap = 0; S.player.prevPos = 0; S.player._trackIdx = 0; S.player.vx = 0; S.player.vy = 0;
}

// --- 9. GLOBAL LISTENERS ---
window.addEventListener('hashchange', async () => {
  const p = parseHash(window.location.hash);
  if (p.track) {
    const ch = p.challenge ? decodeChallenge(p.challenge) : null;
    S.challengeTime = ch ? ch.frames : null;
    S.challengeLaps = ch ? ch.laps : null;
    S.challengeSplits = ch ? ch.splits : null;
    if (S.challengeLaps) S.raceConfig.totalLaps = S.challengeLaps;
    rebuildTrack(S.player.trackDifficulty, p.track);
    await warmUpAI();
    placeAllCars();
  }
});

window.addEventListener('keydown', (e) => {
  if (e.code === 'Escape') { S.paused = !S.paused; e.preventDefault(); }
});
window.addEventListener('keydown', (e) => {
  if (e.code === 'KeyD') {
    debugDiv.style.display = debugDiv.style.display === 'none' ? 'block' : 'none';
    e.preventDefault();
  }
});

// --- 10. TUNING GUI ---
window.showTuning = () => {
  const gui = new GUI({ title: 'Parameter Tuning' });
  gui.add(S.player, 'acceleration', 0.01, 2.0);
  gui.add(S.player, 'maxSpeed', 1, 40);
  gui.add(S.player, 'turnSpeed', 0.01, 0.5);
  gui.add(S.player, 'friction', 0.9, 0.999);
  gui.add(S.player, 'grip', 0.001, 1.0);
  gui.add(S.player, 'invertControls').name('Invert Controls');
  gui.add(S.player, 'trackDifficulty', 0.1, 1.0).name('Track Difficulty').onChange(v => {
    rebuildTrack(v);
    warmUpAI();
    placeAllCars();
  });
  gui.add(S.raceConfig, 'totalLaps', 1, 30, 1).name('Total Laps');

  const trackInput = { id: '' };
  gui.add(trackInput, 'id').name('Track ID').onFinishChange(v => {
    if (v.trim()) {
      rebuildTrack(S.player.trackDifficulty, v.trim());
      warmUpAI();
      placeAllCars();
    }
  });
  S.trackIdController = gui.add(S.trackIdDisplay, 'current').name('Current Track').disable();

  const debugToggle = { showDebug: false };
  gui.add(debugToggle, 'showDebug').name('Show Debug').onChange(v => {
    debugDiv.style.display = v ? 'block' : 'none';
  });
};
if (_showTuningOnLoad) window.showTuning();

// --- 11. RACING LINE DEBUG API ---
window.drawRacingLine = function(color = 0x00FF00, alpha = 0.7) {
  S.debugGfx.clear();
  if (!S.trackRacingLine.length) { console.log('No racing line available'); return; }
  S.debugGfx.moveTo(S.trackRacingLine[0].x, S.trackRacingLine[0].y);
  for (let i = 1; i < S.trackRacingLine.length; i++) {
    S.debugGfx.lineTo(S.trackRacingLine[i].x, S.trackRacingLine[i].y);
  }
  S.debugGfx.closePath();
  S.debugGfx.stroke({ width: 6, color, alpha, join: 'round', cap: 'round' });
  const maxDev = Math.max(...S.trackRacingLine.map((p, i) => Math.hypot(p.x - S.trackCenterline[i].x, p.y - S.trackCenterline[i].y)));
  console.log(`Racing line drawn. Max deviation from centerline: ${maxDev.toFixed(1)} (track half-width: ${130}). Call clearRacingLine() to remove.`);
};
window.clearRacingLine = function() { S.debugGfx.clear(); };

// --- 12. PWA ---
setupPwaBanner();

// --- 13. PARTICLES ---
S.particles = initParticles();
S.world.addChild(S.particles.graphics);

// --- 14. FPS CAP ---
S.app.ticker.maxFPS = 45;

// --- 15. START LOOP ---
startGameLoop();
