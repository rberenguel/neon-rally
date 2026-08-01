import { Application, Container, Graphics } from 'pixi.js';
import GUI from 'lil-gui';
import { TRACK_WIDTH, TRACK_HALF, generateTrack, drawTrackPath, isOnTrack, getTrackProgress, seedToTrackId, trackIdToSeed, computeSpeedProfile, createRng } from './track.js';
import { createCar, updateCarPhysics } from './car.js';
import { createCarSprite, updateCarSprite, initParticles, initSkids, updateCamera, shakeOnBump, updateShake } from './renderer.js';
import { createWaypointAI, updateWaypointAI, createSplineAI, updateSplineAI, pretrainAI, recordOffTrackEpisode, resolveCollisions, computeDraftBoost, rerollSplineParams } from './ai.js';
import { initEngineSound, updateEngineSound, updateDriftSound } from './audio.js';
import { makeControlHandler, presentKeyMap, commandNames, keyMap, buttonMap, rmap, isRemapping } from './controls.js';
import { createPowerupLayer, spawnPowerup, clearPowerups, updatePowerups, activatePowerup, tickBoosts, resetPowerupRng } from './powerups.js';
import { initTouchControls } from './touch.js';
import { showSplash } from './splash.js';
import { showTrackSelect } from './menu.js';
import { showSessionSummary } from './session.js';

// --- 0. SPLASH ---
await showSplash();

// --- 1. SETUP ---
const app = new Application();
await app.init({ resizeTo: window, backgroundColor: 0x050510, antialias: true });
document.body.appendChild(app.canvas);
initEngineSound();

const input = { steerLeft: false, steerRight: false, gas: false, brake: false, activate: false, pause: false };
const pollControls = makeControlHandler(input);
const pollTouch = initTouchControls(input);
let _pauseCooldown = 0;
let _activateCooldown = 0;

// Parse URL hash for shared track / challenge BEFORE first rebuild
function parseHash(hash) {
    const params = {};
    for (const part of hash.replace(/^#/, '').split('&')) {
        const eq = part.indexOf('=');
        if (!part) continue;
        if (eq === -1) params[part] = true;
        else params[part.slice(0, eq)] = part.slice(eq + 1);
    }
    return params;
}
const _initialHash = parseHash(window.location.hash);
const hashTrack = _initialHash.track ? [null, _initialHash.track] : null;
const _showTuningOnLoad = 'tuning' in _initialHash;

// Splits stored as frames at 25%, 50%, 75%, 100% race progress.
// Encoding: btoa("laps:t25:t50:t75:t100") — falls back to btoa("laps:t100") for old URLs.
function encodeChallenge(laps, frames, splits) {
    const s = splits ? `${laps}:${splits[0]}:${splits[1]}:${splits[2]}:${frames}` : `${laps}:${frames}`;
    return btoa(s);
}
function decodeChallenge(s) {
    try {
        const parts = atob(s).split(':').map(Number);
        if (parts.length === 5) return { laps: parts[0], splits: [parts[1], parts[2], parts[3]], frames: parts[4] };
        if (parts.length === 2) return { laps: parts[0], splits: null, frames: parts[1] };
        return null;
    } catch { return null; }
}
// Piecewise-linear delta: interpolates between known split times for an accurate pace estimate.
function challengeDelta(raceFrame, progress, splits, totalFrames) {
    const pts = [0, 0.25, 0.5, 0.75, 1.0];
    const times = splits ? [0, splits[0], splits[1], splits[2], totalFrames] : [0, totalFrames * 0.25, totalFrames * 0.5, totalFrames * 0.75, totalFrames];
    let i = pts.findIndex((p, j) => j > 0 && progress <= p);
    if (i < 1) i = pts.length - 1;
    const t = (progress - pts[i - 1]) / (pts[i] - pts[i - 1]);
    return raceFrame - (times[i - 1] + t * (times[i] - times[i - 1]));
}
const _initChallenge = _initialHash.challenge ? decodeChallenge(_initialHash.challenge) : null;
let challengeTime = _initChallenge ? _initChallenge.frames : null;
let challengeLaps = _initChallenge ? _initChallenge.laps : null;
let challengeSplits = _initChallenge ? _initChallenge.splits : null;

function formatTime(frames) {
    const totalCs = Math.round(frames / 60 * 100);
    const cs = totalCs % 100;
    const totalS = Math.floor(totalCs / 100);
    const s = totalS % 60;
    const m = Math.floor(totalS / 60);
    return `${m}:${String(s).padStart(2, '0')}.${String(cs).padStart(2, '0')}`;
}

window.addEventListener('hashchange', async () => {
    const p = parseHash(window.location.hash);
    if (p.track) {
        const ch = p.challenge ? decodeChallenge(p.challenge) : null;
        challengeTime = ch ? ch.frames : null;
        challengeLaps = ch ? ch.laps : null;
        challengeSplits = ch ? ch.splits : null;
        if (challengeLaps) raceConfig.totalLaps = challengeLaps;
        rebuildTrack(player.trackDifficulty, p.track);
        await warmUpAI();
        positionAllCars();
    }
});

const arena = { x: 0, y: 0, width: 4000, height: 4000 };

const world = new Container();
app.stage.addChild(world);
const finishLine = new Graphics();

// Arena visuals
const arenaBorder = new Graphics()
    .rect(arena.x, arena.y, arena.width, arena.height)
    .stroke({ color: 0xFF00FF, width: 2, alpha: 0.15 });
world.addChild(arenaBorder);

const arenaGrid = new Graphics();
for (let gx = arena.x + 100; gx < arena.x + arena.width; gx += 200) {
    for (let gy = arena.y + 100; gy < arena.y + arena.height; gy += 200) {
        arenaGrid.circle(gx, gy, 3.5);
        arenaGrid.fill({ color: 0x7777AA, alpha: 0.6 });
    }
}
world.addChild(arenaGrid);

// Skids layer
const skids = initSkids();

// Track layers
const trackSurf = new Graphics();
const trackGlow = new Graphics();
const trackLine = new Graphics();
const debugGfx  = new Graphics();
world.addChild(trackSurf);
world.addChild(trackGlow);
world.addChild(trackLine);
world.addChild(debugGfx);
world.addChild(finishLine);
world.addChild(skids.graphics);

const powerupLayer = createPowerupLayer(world);
let _powerupSpawnTimer = 0;
const POWERUP_SPAWN_INTERVAL = 600; // frames (~10s)

// --- MINIMAP ---
const _isMobile = 'ontouchstart' in window || window.innerWidth < 768;
const ZOOM = _isMobile ? 0.5 : 1.0;
world.scale.set(ZOOM);
const MAP_W = _isMobile ? 130 : 220;
const MAP_H = MAP_W;
const MINIMAP_SCALE = MAP_W / 4000;
const minimap = new Container();
app.stage.addChild(minimap);

const minimapBg = new Graphics();
minimapBg.rect(0, 0, MAP_W, MAP_H);
minimapBg.fill({ color: 0x000000, alpha: 0.5 });
minimapBg.stroke({ color: 0x00FFFF, width: 1, alpha: 0.4 });
minimap.addChild(minimapBg);

const minimapTrack = new Graphics();
minimap.addChild(minimapTrack);

const minimapDots = new Graphics();
minimap.addChild(minimapDots);

function updateMinimap() {
    // Top-right on mobile (away from bottom touch zones), bottom-right on desktop
    minimap.x = app.screen.width - MAP_W - 16;
    minimap.y = _isMobile ? 16 : app.screen.height - MAP_H - 16;
    minimapDots.clear();
    for (const p of powerupLayer.powerups) {
        minimapDots.circle(p.x * MINIMAP_SCALE, p.y * MINIMAP_SCALE, 2);
        minimapDots.fill({ color: p.type === 'S' ? 0x00FF88 : 0xFF8800, alpha: 0.8 });
    }
    for (const c of allCars) {
        const mx = c.x * MINIMAP_SCALE;
        const my = c.y * MINIMAP_SCALE;
        const color = c === player ? 0x00FFFF : c.color;
        minimapDots.circle(mx, my, c === player ? 3.5 : 2.5);
        minimapDots.fill({ color, alpha: 0.9 });
    }
}

const TRACK_PALETTE = [0x00FFFF, 0xFF00FF, 0x00FF00, 0xFF8000, 0xFFFF00, 0x8000FF];
let trackColor = 0x00FFFF;
let trackCenterline = [];
let trackRacingLine = [];
let trackSpeedProfile = null;
let trackSpikiness = 0;
let trackSeed = null;
let startPt, nextPt, tangent, perpAngle, perpX, perpY, backX, backY;
const trackIdDisplay = { current: '-' };
let trackIdController;

function rebuildTrack(difficulty, seedOrId = null, updateUrl = true) {
    trackColor = TRACK_PALETTE[Math.floor(Math.random() * TRACK_PALETTE.length)];
    const data = generateTrack(difficulty, 0, seedOrId);
    trackCenterline = data.points;
    trackRacingLine = data.racingLine;
    trackSpeedProfile = computeSpeedProfile(trackRacingLine);
    trackSpikiness = data.spikiness;
    trackSeed = data.seed;
    trackIdDisplay.current = data.trackId;
    if (trackIdController) trackIdController.updateDisplay();
    if (updateUrl) history.replaceState(null, '', '#track=' + data.trackId);
    trackSurf.clear();
    trackGlow.clear();
    trackLine.clear();
    drawTrackPath(trackSurf, trackCenterline, TRACK_WIDTH, 0x001122);
    drawTrackPath(trackGlow, trackCenterline, TRACK_WIDTH + 4, trackColor, 0.15);
    drawTrackPath(trackLine, trackCenterline, 2, trackColor, 0.6);
    skids.clear();
    clearPowerups(powerupLayer);

    // Draw minimap track
    minimapTrack.clear();
    if (trackCenterline.length > 0) {
        minimapTrack.moveTo(trackCenterline[0].x * MINIMAP_SCALE, trackCenterline[0].y * MINIMAP_SCALE);
        for (let i = 1; i < trackCenterline.length; i++) {
            minimapTrack.lineTo(trackCenterline[i].x * MINIMAP_SCALE, trackCenterline[i].y * MINIMAP_SCALE);
        }
        minimapTrack.lineTo(trackCenterline[0].x * MINIMAP_SCALE, trackCenterline[0].y * MINIMAP_SCALE);
        minimapTrack.stroke({ width: 1.5, color: trackColor, alpha: 0.5 });
    }

    // Recalculate start line & grid
    startPt = trackCenterline[0];
    nextPt = trackCenterline[1];
    tangent = Math.atan2(nextPt.y - startPt.y, nextPt.x - startPt.x);
    perpAngle = tangent + Math.PI / 2;
    perpX = Math.cos(perpAngle);
    perpY = Math.sin(perpAngle);
    backX = -Math.cos(tangent);
    backY = -Math.sin(tangent);

    // Redraw finish line
    finishLine.clear();
    finishLine.moveTo(startPt.x - perpX * TRACK_HALF, startPt.y - perpY * TRACK_HALF);
    finishLine.lineTo(startPt.x + perpX * TRACK_HALF, startPt.y + perpY * TRACK_HALF);
    finishLine.stroke({ width: 3, color: 0xFFFFFF, alpha: 0.7 });

}

function positionAllCars() {
    for (let i = 0; i < aiCars.length; i++) placeOnGrid(aiCars[i], i);
    placeOnGrid(player, 5);
}

rebuildTrack(0.6, hashTrack ? hashTrack[1] : null, !!hashTrack);

// --- 2. CARS ---
startPt = trackCenterline[0];
nextPt = trackCenterline[1];
tangent = Math.atan2(nextPt.y - startPt.y, nextPt.x - startPt.x);

const player = createCar(startPt.x, startPt.y, tangent + Math.PI / 2, 0x00FFFF);
player.invertControls = false;
player.trackDifficulty = 0.6;
player.isPlayer = true;
player.maxSpeed = 8.8;
player.acceleration = 0.14;
player.grip = 0.025;

const playerSprite = createCarSprite(0x00FFFF, true);
world.addChild(playerSprite);
player.sprite = playerSprite;

// --- STARTING GRID ---
perpAngle = tangent + Math.PI / 2;
perpX = Math.cos(perpAngle);
perpY = Math.sin(perpAngle);
backX = -Math.cos(tangent);
backY = -Math.sin(tangent);

function placeOnGrid(car, index) {
    const row = Math.floor(index / 2);
    const side = (index % 2 === 0) ? -1 : 1;
    car.x = startPt.x + perpX * side * 35 + backX * row * 50;
    car.y = startPt.y + perpY * side * 35 + backY * row * 50;
    car.rotation = tangent + Math.PI / 2;
}

// AI opponents (5 cars). type 'waypoint' = curvature-reasoning learning AI; 'spline' =
// old-school line-follower with a baked-in per-corner speed profile, no live reasoning,
// can't slalom. Useful as a stable baseline/comparison and a reliable easier tier.
const aiDefs = [
    { color: 0xFF00FF, name: 'Magenta', type: 'waypoint' },
    { color: 0x00FF00, name: 'Green',   type: 'spline',   ace: true },
    { color: 0xFF8000, name: 'Orange',  type: 'spline'   },
    { color: 0xFFFF00, name: 'Yellow',  type: 'spline'   },
    { color: 0x8000FF, name: 'Purple',  type: 'spline'   },
];

const aiCars = [];
const aiSprites = [];
for (let i = 0; i < aiDefs.length; i++) {
    const def = aiDefs[i];
    const aiRng = createRng(trackSeed + i);
    const ai = def.type === 'spline'
        ? createSplineAI(trackRacingLine, def.color, trackSpeedProfile, def.ace, aiRng)
        : createWaypointAI(trackRacingLine, def.color);
    placeOnGrid(ai, i);          // AI occupy grid positions 0–4 (rows 0–2)
    const sprite = createCarSprite(def.color, false);
    world.addChild(sprite);
    ai.sprite = sprite;
    ai.def = def;
    ai.lap = 0;
    ai.prevPos = 0;
    ai._trackIdx = 0;
    aiCars.push(ai);
    aiSprites.push(sprite);
}

// Warm-start the waypoint AIs' caution memory against the current track before the
// race starts, and refresh the spline AIs' speed profile reference. Call again any
// time the track is rebuilt (new track ID, difficulty change, next-track advance).
async function warmUpAI() {
    const overlay = document.createElement('div');
    overlay.style.cssText = `position:fixed;inset:0;background:rgba(0,0,10,0.82);z-index:8000;
        display:flex;align-items:center;justify-content:center;font-family:monospace;`;
    overlay.innerHTML = `<div style="color:#00FFFF;font-size:18px;letter-spacing:3px;text-shadow:0 0 12px #00FFFF">
        LOADING&hellip;</div>`;
    document.body.appendChild(overlay);
    await new Promise(r => setTimeout(r, 30)); // let browser paint the overlay
    for (const ai of aiCars) {
        if (ai.aiType === 'spline') {
            ai._speedProfile = trackSpeedProfile;
            ai._trackCenterline = trackRacingLine;
        } else {
            ai._trackMemory = new Float32Array(1000);
            ai._trackCenterline = trackRacingLine;
            pretrainAI(ai, trackRacingLine, (x, y) => isOnTrack(x, y, trackCenterline), arena);
        }
    }
    positionAllCars();
    document.body.removeChild(overlay);
}
if (hashTrack) warmUpAI(); // only pre-train if loading a specific track from URL; otherwise done after track select

placeOnGrid(player, 5);          // player starts 6th (back of grid)

// Initial positioning done via rebuildTrack, but player/aiCars now exist
positionAllCars();

player.lap = 0;
player.prevPos = 0;
player._trackIdx = 0;
player._lapDelta = 0;
for (const ai of aiCars) { ai.prevPos = 0; ai._trackIdx = 0; ai._lapDelta = 0; }


// --- ORIENTATION LOCK (mobile only) ---
const orientationDiv = document.createElement('div');
orientationDiv.style.cssText = `
    position:fixed;inset:0;z-index:99999;
    background:#050510;color:#00FFFF;
    font-family:monospace;font-size:20px;font-weight:bold;
    display:none;flex-direction:column;align-items:center;justify-content:center;gap:16px;
    text-align:center;
`;
orientationDiv.innerHTML = `<div style="font-size:48px">&#8635;</div><div>Rotate to landscape</div>`;
document.body.appendChild(orientationDiv);

function checkOrientation() {
    if (!_isMobile) return;
    const portrait = window.screen.orientation
        ? window.screen.orientation.type.startsWith('portrait')
        : window.innerHeight > window.innerWidth;
    orientationDiv.style.display = portrait ? 'flex' : 'none';
}
checkOrientation();
window.addEventListener('orientationchange', checkOrientation);
window.addEventListener('resize', checkOrientation);

// --- CONTROLS OVERLAY ---
let controlsAcknowledged = false;
const controlsDiv = document.createElement('div');
controlsDiv.style.cssText = `
    position: absolute;
    top: 50%; left: 50%;
    transform: translate(-50%, -50%);
    background: rgba(0,0,0,0.88);
    border: 2px solid #00FFFF;
    border-radius: 8px;
    padding: 16px 20px;
    color: #00FFFF;
    font-family: monospace;
    font-size: clamp(12px, 2.5vw, 16px);
    text-align: center;
    z-index: 5000;
    line-height: 1.6;
    max-width: min(90vw, 480px);
    max-height: 85vh;
    overflow-y: auto;
    box-sizing: border-box;
`;
const mainPanel = document.createElement('div');
{
    const h = document.createElement('h2');
    h.textContent = 'Controls';
    h.style.cssText = 'margin:0 0 10px 0;color:#fff';
    mainPanel.appendChild(h);

    // OK button first so it's always visible without scrolling
    const btns = document.createElement('div');
    btns.style.cssText = 'margin-bottom:12px';
    btns.innerHTML = `
        <button id="ctrl-ok" style="background:#00FFFF;color:#000;border:none;padding:6px 18px;font-family:monospace;font-size:14px;cursor:pointer;border-radius:4px;">OK — Press 'Use powerup' to continue</button>
    `;
    mainPanel.appendChild(btns);

    if (_isMobile) {
        const touch = document.createElement('div');
        touch.style.cssText = 'margin:0 0 10px 0;padding:8px 12px;border:1px solid #00FFFF44;border-radius:6px;font-size:13px;text-align:left;line-height:1.8;color:#aaa';
        touch.innerHTML = `
            <div style="color:#fff;margin-bottom:4px">Touch (landscape)</div>
            <div><span style="color:#0FF">Hold bottom left / right</span> — steer</div>
            <div><span style="color:#0FF">Gas auto</span> — hold reverse top half to lift</div>
            <div><span style="color:#0FF">Both top halves</span> — brake</div>
            <div><span style="color:#0FF">Both lower halves</span> — powerup · start race</div>
        `;
        mainPanel.appendChild(touch);
    }

    const rkeymap = rmap(keyMap);
    const rbuttonmap = rmap(buttonMap);
    const table = document.createElement('table');
    table.style.cssText = 'border-collapse:collapse;margin:0 auto 12px auto;text-align:left';
    for (const action in commandNames) {
        const tr = document.createElement('tr');
        const tdName = document.createElement('td');
        tdName.textContent = commandNames[action];
        tdName.style.cssText = 'padding:2px 12px 2px 0;color:#aaa';
        const tdKey = document.createElement('td');
        tdKey.textContent = rkeymap[action] ?? '—';
        tdKey.style.cssText = 'padding:2px 8px;color:#0FF';
        const tdBtn = document.createElement('td');
        tdBtn.textContent = rbuttonmap[action] ?? '—';
        tdBtn.style.cssText = 'padding:2px 0;color:#0FF';
        tr.append(tdName, tdKey, tdBtn);
        table.appendChild(tr);
    }
    mainPanel.appendChild(table);

    const remapBtn = document.createElement('div');
    remapBtn.style.cssText = 'margin-bottom:12px';
    remapBtn.innerHTML = `<button id="ctrl-remap" style="background:transparent;color:#00FFFF;border:1px solid #00FFFF;padding:4px 14px;font-family:monospace;font-size:13px;cursor:pointer;border-radius:4px;">Remap Controls</button>`;
    mainPanel.appendChild(remapBtn);

    if (challengeTime) {
        const cb = document.createElement('div');
        cb.style.cssText = 'margin-top:16px;padding:10px 16px;border:1px solid #FFD700;border-radius:6px;color:#FFD700;font-size:15px';
        cb.innerHTML = `&#9654; Challenge: beat <b>${formatTime(challengeTime)}</b> over ${challengeLaps} lap${challengeLaps !== 1 ? 's' : ''}`;
        mainPanel.appendChild(cb);
    }
}
controlsDiv.appendChild(mainPanel);

const remapPanel = document.createElement('div');
remapPanel.style.display = 'none';
controlsDiv.appendChild(remapPanel);

document.body.appendChild(controlsDiv);

function dismissControls() {
    if (controlsAcknowledged) return;
    if (controlsDiv.style.display === 'none') return;
    if (isRemapping()) return;
    controlsDiv.style.display = 'none';
    controlsAcknowledged = true;
}
document.getElementById('ctrl-ok').addEventListener('click', dismissControls);
document.addEventListener('keydown', (e) => {
    if (!controlsAcknowledged && (e.key === 'Enter' || e.key === ' ')) dismissControls();
});
const _ctrlInput = { steerLeft: false, steerRight: false, gas: false, brake: false, activate: false, pause: false };
const _ctrlPoll = makeControlHandler(_ctrlInput);
document.getElementById('ctrl-remap').addEventListener('click', () => {
    mainPanel.style.display = 'none';
    remapPanel.style.display = 'block';
    presentKeyMap(remapPanel, () => {
        remapPanel.style.display = 'none';
        remapPanel.innerHTML = '';
        mainPanel.style.display = 'block';
    });
});

// --- LAP UI ---
const lapDiv = document.createElement('div');
lapDiv.style.position = 'absolute';
lapDiv.style.top = '10px';
lapDiv.style.left = '10px';
lapDiv.style.color = '#00FFFF';
lapDiv.style.fontFamily = 'monospace';
lapDiv.style.fontSize = '18px';
lapDiv.style.zIndex = '1000';
lapDiv.style.pointerEvents = 'none';
document.body.appendChild(lapDiv);

const deltaDiv = document.createElement('div');
deltaDiv.style.cssText = 'position:absolute;top:34px;left:10px;font-family:monospace;font-size:15px;font-weight:bold;z-index:1000;pointer-events:none;display:none';
document.body.appendChild(deltaDiv);

const powerupHud = document.createElement('div');
powerupHud.style.cssText = 'position:absolute;top:10px;right:10px;font-family:monospace;font-size:20px;font-weight:bold;z-index:1000;pointer-events:none;display:none';
document.body.appendChild(powerupHud);

const speedHud = document.createElement('div');
speedHud.style.position = 'absolute';
speedHud.style.color = '#FF8000';
speedHud.style.fontFamily = 'monospace';
speedHud.style.fontSize = '11px';
speedHud.style.zIndex = '1000';
speedHud.style.pointerEvents = 'none';
speedHud.style.opacity = '0.7';
document.body.appendChild(speedHud);

// --- RACE FINISHED OVERLAY ---
const finishedDiv = document.createElement('div');
finishedDiv.style.cssText = `
    position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);
    background:rgba(0,0,0,0.88);border:2px solid #00FFFF;border-radius:8px;
    padding:16px 20px;color:#00FFFF;font-family:monospace;font-size:clamp(12px,2.5vw,16px);
    text-align:center;z-index:5000;line-height:1.7;display:none;
    width:min(90vw,420px);max-height:85vh;overflow-y:auto;box-sizing:border-box;
`;
document.body.appendChild(finishedDiv);

function showFinishedOverlay(rank, timeStr, challengeStr, shareUrl) {
    const place = `${rank}${rank===1?'st':rank===2?'nd':rank===3?'rd':'th'}`;
    const challengeBlock = challengeStr
        ? `<div style="margin:6px 0;font-size:15px">${challengeStr}</div>` : '';
    const sessionCount = sessionRaces.length;
    finishedDiv.innerHTML = `
        <h2 style="margin:0 0 10px 0;color:#fff;font-size:22px;letter-spacing:2px">RACE FINISHED</h2>
        <div style="font-size:11px;color:#00FFFF88;margin-bottom:6px">Race ${sessionCount} of session</div>
        <div style="font-size:28px;font-weight:bold;color:#FFD700;margin:4px 0">${place} Place</div>
        <div style="font-size:22px;color:#FFD700;margin:4px 0">${timeStr}</div>
        ${challengeBlock}
        <hr style="border:none;border-top:1px solid #00FFFF44;margin:14px 0">
        <div style="font-size:13px;color:#aaa;margin-bottom:6px">Challenge a friend — share this run:</div>
        <div style="display:flex;gap:6px;justify-content:center;align-items:center;margin-bottom:14px">
            <input id="share-url" readonly value="${shareUrl}"
                style="background:#111;color:#0FF;border:1px solid #00FFFF55;border-radius:4px;
                       padding:4px 8px;font-family:monospace;font-size:12px;width:240px;outline:none">
            <button id="share-copy"
                style="background:transparent;color:#0FF;border:1px solid #0FF;padding:4px 12px;
                       font-family:monospace;font-size:13px;cursor:pointer;border-radius:4px">Copy</button>
        </div>
        <div style="display:flex;gap:10px;justify-content:center;flex-wrap:wrap">
            <button id="finished-next"
                style="background:#00FFFF;color:#000;border:none;padding:8px 22px;
                       font-family:monospace;font-size:15px;cursor:pointer;border-radius:4px">
                Next Race  (${rmap(keyMap)['activate'] ?? 'Z'} / ${rmap(buttonMap)['activate'] ?? 'b:2'})
            </button>
            <button id="finished-end"
                style="background:transparent;color:#FF00FF;border:1px solid #FF00FF;padding:8px 22px;
                       font-family:monospace;font-size:15px;cursor:pointer;border-radius:4px">
                End Session
            </button>
        </div>
    `;
    finishedDiv.style.display = 'block';
    document.getElementById('share-copy').addEventListener('click', () => {
        const btn = document.getElementById('share-copy');
        const flash = () => { if (btn) { btn.textContent = 'Copied!'; setTimeout(() => { if (btn) btn.textContent = 'Copy'; }, 1500); } };
        if (navigator.clipboard) {
            navigator.clipboard.writeText(shareUrl).then(flash);
        } else {
            const inp = document.getElementById('share-url');
            inp.select();
            document.execCommand('copy');
            flash();
        }
    });
    document.getElementById('finished-next').addEventListener('click', () => {
        finishedDiv.style.display = 'none';
        advanceToNextTrack();
    });
    document.getElementById('finished-end').addEventListener('click', () => {
        finishedDiv.style.display = 'none';
        endSession();
    });
}

// --- LAP ANNOUNCEMENT ---
const announceDiv = document.createElement('div');
announceDiv.style.position = 'absolute';
announceDiv.style.top = '50%';
announceDiv.style.left = '50%';
announceDiv.style.transform = 'translate(-50%, -50%)';
announceDiv.style.color = '#FFFFFF';
announceDiv.style.fontFamily = 'monospace';
announceDiv.style.fontSize = '36px';
announceDiv.style.fontWeight = 'bold';
announceDiv.style.textShadow = '0 0 10px #00FFFF';
announceDiv.style.zIndex = '2000';
announceDiv.style.pointerEvents = 'none';
announceDiv.style.opacity = '0';
announceDiv.style.transition = 'opacity 0.3s';
document.body.appendChild(announceDiv);

function showAnnounce(text) {
    announceDiv.textContent = text;
    announceDiv.style.opacity = '1';
    setTimeout(() => { announceDiv.style.opacity = '0'; }, 2000);
}

const allCars = [player, ...aiCars];
let raceStarted = false;
let raceFinished = false;
let _finishCounter = 0;
let raceFrame = 0;
let sessionRaces = [];
let _advancingTrack = false;
let paused = false;
let _waitForGasRelease = false;
const raceConfig = { totalLaps: challengeLaps || 5 };
let playerFinishFrame = 0;
let _splitFrames = [null, null, null]; // recorded at 25%, 50%, 75% race progress

window.addEventListener('keydown', (e) => {
    if (e.code === 'Escape') { paused = !paused; e.preventDefault(); }
});

// --- DEBUG PANEL ---
const debugDiv = document.createElement('div');
debugDiv.style.position = 'absolute';
debugDiv.style.bottom = '10px';
debugDiv.style.left = '10px';
debugDiv.style.color = '#00FF00';
debugDiv.style.background = 'rgba(0,0,0,0.9)';
debugDiv.style.fontFamily = 'monospace';
debugDiv.style.fontSize = '12px';
debugDiv.style.zIndex = '99999';
debugDiv.style.pointerEvents = 'none';
debugDiv.style.padding = '8px';
debugDiv.style.lineHeight = '1.4';
document.body.appendChild(debugDiv);
debugDiv.style.display = 'none'; // off by default

// Debug toggle
window.addEventListener('keydown', (e) => {
    if (e.code === 'KeyD') {
        debugDiv.style.display = debugDiv.style.display === 'none' ? 'block' : 'none';
        e.preventDefault();
    }
});

// --- POSITION LABELS ---
const labelDivs = [];
for (let i = 0; i < allCars.length; i++) {
    const div = document.createElement('div');
    div.style.position = 'absolute';
    div.style.color = '#FFFFFF';
    div.style.fontFamily = 'monospace';
    div.style.fontSize = '14px';
    div.style.fontWeight = 'bold';
    div.style.textAlign = 'center';
    div.style.width = '30px';
    div.style.pointerEvents = 'none';
    div.style.transition = 'opacity 1s';
    div.style.opacity = '0';
    div.textContent = String(i + 1);
    document.body.appendChild(div);
    labelDivs.push(div);
}

function showLabels() {
    labelDivs.forEach(d => { d.style.opacity = '1'; });
    setTimeout(() => {
        labelDivs.forEach(d => { d.style.opacity = '0'; });
    }, 4000);
}
showLabels();

function getRaceProgress(car) {
    if (car.lap >= raceConfig.totalLaps) return raceConfig.totalLaps + 1.0 - (car._finishOrder || 999) * 0.001;
    return car.lap + car._trackIdx / 1000;
}

function getLeader() {
    let best = -1, leader = player;
    for (const c of allCars) {
        const prog = getRaceProgress(c);
        if (prog > best) { best = prog; leader = c; }
    }
    return leader;
}

function getColorName(hex) {
    if (hex === 0x00FFFF) return 'Cyan';
    if (hex === 0xFF00FF) return 'Magenta';
    if (hex === 0x00FF00) return 'Green';
    if (hex === 0xFF8000) return 'Orange';
    if (hex === 0xFFFF00) return 'Yellow';
    if (hex === 0x8000FF) return 'Purple';
    return 'Unknown';
}

// --- 3. OVERLAYS ---
const particles = initParticles();

// --- 4. GUI ---
// Hidden by default. Activate via console (showTuning()) or URL hash flag (&tuning).
window.showTuning = () => {
    const gui = new GUI({ title: 'Parameter Tuning' });
    gui.add(player, 'acceleration', 0.01, 2.0);
    gui.add(player, 'maxSpeed', 1, 40);
    gui.add(player, 'turnSpeed', 0.01, 0.5);
    gui.add(player, 'friction', 0.9, 0.999);
    gui.add(player, 'grip', 0.001, 1.0);
    gui.add(player, 'invertControls').name('Invert Controls');
    gui.add(player, 'trackDifficulty', 0.1, 1.0).name('Track Difficulty').onChange(v => { rebuildTrack(v); warmUpAI(); positionAllCars(); });
    gui.add(raceConfig, 'totalLaps', 1, 10, 1).name('Total Laps');

    const trackInput = { id: '' };
    gui.add(trackInput, 'id').name('Track ID').onFinishChange(v => {
        if (v.trim()) {
            rebuildTrack(player.trackDifficulty, v.trim());
            warmUpAI();
            positionAllCars();
        }
    });
    trackIdController = gui.add(trackIdDisplay, 'current').name('Current Track').disable();

    const debugToggle = { showDebug: false };
    gui.add(debugToggle, 'showDebug').name('Show Debug').onChange(v => {
        debugDiv.style.display = v ? 'block' : 'none';
    });
};
if (_showTuningOnLoad) window.showTuning();

// --- INITIAL TRACK SELECT ---
if (!hashTrack) {
    const initSel = await showTrackSelect(false, controlsDiv);
    player.trackDifficulty = initSel.difficulty;
    rebuildTrack(initSel.difficulty, initSel.seed);
    await warmUpAI();
    positionAllCars();
    for (const ai of aiCars) { ai.lap = 0; ai.prevPos = 0; ai._trackIdx = 0; ai.vx = 0; ai.vy = 0; }
    player.lap = 0; player.prevPos = 0; player._trackIdx = 0; player.vx = 0; player.vy = 0;
}

// --- 5. GAME LOOP ---
app.ticker.add((ticker) => {
    const dt = ticker.deltaTime;

    if (paused) return;

    // --- CONTROLS ---
    input.steerLeft = false; input.steerRight = false; input.gas = false; input.brake = false; input.activate = false; input.pause = false;

    // Poll touch first so it can dismiss the overlay (bothDown = activate)
    pollTouch(raceStarted && !raceFinished);

    if (!controlsAcknowledged) {
        if (isRemapping()) {
            // Don't dismiss overlay while remapping; still poll so device input is captured
            _ctrlPoll();
            pollControls();
        } else {
            _ctrlInput.activate = false;
            _ctrlPoll();
            if (_ctrlInput.activate || input.activate) {
                dismissControls();
                // Prevent the same touch/key from also firing in-game actions this frame
                input.activate = false;
                _activateCooldown = 10;
            }
        }
    } else {
        pollControls();
    }
    if (_pauseCooldown > 0) _pauseCooldown--;
    if (input.pause && _pauseCooldown === 0) { paused = !paused; _pauseCooldown = 20; }
    if (_activateCooldown > 0) _activateCooldown--;
    if (input.activate && _activateCooldown === 0) {
        if (raceFinished) { advanceToNextTrack(); }
        else if (player._heldPowerup) { activatePowerup(player); _activateCooldown = 10; }
    }
    const gas   = player.invertControls ? input.brake : input.gas;
    const brake = player.invertControls ? input.gas   : input.brake;

    // --- RACE START ---
    if (!raceStarted && gas && controlsAcknowledged) {
        raceStarted = true;
        raceFrame = 0;
        _splitFrames = [null, null, null];
        resetPowerupRng(trackSeed ?? 0);
        showLabels();
    }
    if (raceStarted) raceFrame++;

    if (!raceFinished) {
        // --- CAUTION MEMORY DECAY (slow fade so old mistakes are forgotten) ---
        for (const ai of aiCars) {
            if (ai._trackMemory) {
                for (let i = 0; i < 1000; i++) ai._trackMemory[i] *= 0.998;
            }
        }

        // --- DRAFTING / SLIPSTREAM ---
        // Only player ↔ AI draft. AI cars never draft each other (preserves personality spread).
        for (const c of allCars) {
            const candidates = c === player ? aiCars : (c.isPlayer ? allCars : [player]);
            const desired = computeDraftBoost(c, candidates);
            if (desired > 0) {
                // Ramp up slowly — takes ~1s of sustained drafting to hit full bonus
                c._draftBoost = Math.min(desired, (c._draftBoost || 0) + 0.02 * dt);
            } else {
                c._draftBoost = Math.max(0, (c._draftBoost || 0) - 0.05 * dt);
            }
        }

        // --- PLAYER ---
        const steer = (input.steerLeft ? -1 : 0) + (input.steerRight ? 1 : 0);
        const pState = updateCarPhysics(player, dt, steer, gas, brake,
            (x, y) => isOnTrack(x, y, trackCenterline), arena);

        // --- AI ---
        const aiStates = [];
        for (const ai of aiCars) {
            let aiInput, aiState;
            if (raceStarted && ai.lap < raceConfig.totalLaps) {
                aiInput = ai.aiType === 'spline'
                    ? updateSplineAI(ai, dt, trackRacingLine)
                    : updateWaypointAI(ai, dt, trackRacingLine);
                aiState = updateCarPhysics(ai, dt, aiInput.steer, aiInput.gas, aiInput.brake,
                    (x, y) => isOnTrack(x, y, trackCenterline), arena);
                // Learn from mistakes: record episode when going off-track, apply on recovery.
                // Spline AI has no _trackMemory, so recordOffTrackEpisode is a no-op for it.
                // Stuck rescue: near-zero speed for 0.2s anywhere → hand off to spline
                if (ai.aiType === 'waypoint' && aiState.speed < 1.0) {
                    ai._stuckFrames = (ai._stuckFrames || 0) + 1;
                    if (ai._stuckFrames > 12) {
                        ai.aiType = 'spline';
                        ai._speedProfile = trackSpeedProfile;
                        ai._stuckFrames = 0;
                    }
                } else {
                    ai._stuckFrames = 0;
                }
                if (!aiState.onTrack) {
                    if (!ai._offTrackSince) {
                        ai._offTrackSince = raceFrame;
                        ai._offTrackStartIdx = aiInput.nearestIdx || 0;
                    }
                } else if (ai._offTrackSince) {
                    recordOffTrackEpisode(ai, ai._offTrackStartIdx, raceFrame - ai._offTrackSince);
                    ai._offTrackSince = 0;
                    ai._stuckFrames = 0;
                    // Return rescued car to waypoint mode once back on track
                    if (ai.aiType === 'spline' && ai._trackMemory) {
                        ai.aiType = 'waypoint';
                        ai._recovering = false;
                    }
                }
            } else if (ai.lap >= raceConfig.totalLaps) {
                // Finished: hard brake to stop
                aiState = updateCarPhysics(ai, dt, 0, false, true,
                    (x, y) => isOnTrack(x, y, trackCenterline), arena);
            } else {
                // Race not started: frozen, zero velocity
                aiState = { speed: 0, speedFactor: 0, onTrack: true, forwardX: 0, forwardY: 1, dot: 0, cross: 0, slip: 0, turnSign: 0, movingForward: true };
            }
            aiStates.push(aiState);
            updateCarSprite(ai.sprite, ai, aiState.slip, aiState.turnSign, aiState.movingForward, aiState.steerInput);
        }

        // --- SPLIT RECORDING ---
        if (raceStarted && !raceFinished) {
            const progress = Math.min(1, (player.lap + (player._trackIdx || 0) / 1000) / raceConfig.totalLaps);
            if (_splitFrames[0] === null && progress >= 0.25) _splitFrames[0] = raceFrame;
            if (_splitFrames[1] === null && progress >= 0.50) _splitFrames[1] = raceFrame;
            if (_splitFrames[2] === null && progress >= 0.75) _splitFrames[2] = raceFrame;
        }

        // --- LAPS ---
        // Gate lap counting for 2 seconds so cars clear the start zone and establish correct indices
        if (raceStarted && raceFrame > 120) {
            for (const c of allCars) {
                const idx = Math.floor(getTrackProgress(c.x, c.y, trackCenterline) * 1000);
                const raw = idx - (c._trackIdx ?? idx);
                if (raw > 0 && raw < 500) c._lapDelta = (c._lapDelta ?? 0) + raw;
                if (c._trackIdx !== undefined && c._trackIdx > 800 && idx < 200 && c.lap < raceConfig.totalLaps && (c._lapDelta ?? 0) >= 800) {
                    c.lap++;
                    c._lapDelta = 0;
                    if (c.lap >= raceConfig.totalLaps) c._finishOrder = ++_finishCounter;
                    if (c === player && c.lap < raceConfig.totalLaps) {
                        const remaining = raceConfig.totalLaps - c.lap;
                        showAnnounce(remaining === 1 ? 'Final lap!' : `${remaining} laps to go!`);
                    }
                }
                c._trackIdx = idx;
            }
            const leaderCar = getLeader();
            const leaderName = getColorName(leaderCar.color);
            if (!raceFinished && player.lap >= raceConfig.totalLaps) {
                raceFinished = true;
                playerFinishFrame = raceFrame;
                const rank = allCars.filter(c => getRaceProgress(c) > getRaceProgress(player)).length + 1;
                const timeStr = formatTime(playerFinishFrame);
                let challengeStr = '';
                if (challengeTime) {
                    const diff = playerFinishFrame - challengeTime;
                    if (diff < 0) challengeStr = `<span style="color:#00FF88">Beat challenge by ${formatTime(-diff)}!</span>`;
                    else challengeStr = `<span style="color:#FF4444">Missed by ${formatTime(diff)}</span>`;
                }
                const trackId = trackSeed !== null ? seedToTrackId(trackSeed) : '';
                const splits = _splitFrames.every(v => v !== null) ? _splitFrames : null;
                const challenge = encodeChallenge(raceConfig.totalLaps, playerFinishFrame, splits);
                const shareUrl = trackId
                    ? `${location.origin}${location.pathname}#track=${trackId}&challenge=${challenge}`
                    : location.href;
                if (trackId) history.replaceState(null, '', `#track=${trackId}&challenge=${challenge}`);
                sessionRaces.push({
                    trackId,
                    difficulty: player.trackDifficulty,
                    laps: raceConfig.totalLaps,
                    timeFrames: playerFinishFrame,
                    rank,
                    points: trackCenterline.map(p => ({ x: p.x, y: p.y })),
                });
                showFinishedOverlay(rank, timeStr, challengeStr, shareUrl);
                lapDiv.textContent = '';
                deltaDiv.style.display = 'none';
            } else {
                const trackId = trackSeed !== null ? seedToTrackId(trackSeed) : '?';
                lapDiv.textContent = `Lap ${Math.min(player.lap + 1, raceConfig.totalLaps)}/${raceConfig.totalLaps}  |  ${formatTime(raceFrame)}  |  Leader: ${leaderName}  |  Track: ${trackId}`;
                if (challengeTime) {
                    const progress = Math.min(1, (player.lap + (player._trackIdx || 0) / 1000) / raceConfig.totalLaps);
                    const delta = challengeDelta(raceFrame, progress, challengeSplits, challengeTime);
                    const ahead = delta < 0;
                    deltaDiv.style.display = 'block';
                    deltaDiv.style.color = ahead ? '#00FF88' : '#FF4444';
                    deltaDiv.textContent = `${ahead ? '▲' : '▼'} ${ahead ? '-' : '+'}${formatTime(Math.abs(delta))} vs challenge`;
                } else {
                    deltaDiv.style.display = 'none';
                }
            }
        } else if (controlsAcknowledged) {
            const preRaceMsg = challengeTime
                ? `Challenge: beat ${formatTime(challengeTime)} (${challengeLaps} laps) — Press gas to start`
                : 'Press gas to start race';
            if (lapDiv.textContent !== preRaceMsg) lapDiv.textContent = preRaceMsg;
            deltaDiv.style.display = 'none';
        } else {
            if (lapDiv.textContent !== '') lapDiv.textContent = '';
            deltaDiv.style.display = 'none';
        }

        // --- POSITION TRACKING ---
        if (raceStarted && raceFrame > 60) {
            const scores = allCars.map((c, i) => ({
                index: i,
                score: getRaceProgress(c)
            }));
            scores.sort((a, b) => b.score - a.score);
            for (let rank = 0; rank < scores.length; rank++) {
                const carIdx = scores[rank].index;
                const car = allCars[carIdx];
                const newPos = rank + 1;
                const div = labelDivs[carIdx];
                if (car.prevPos !== 0 && car.prevPos !== newPos) {
                    div.style.opacity = '1';
                    div.textContent = String(newPos);
                    div.style.fontSize = car.isPlayer ? '22px' : '16px';
                    div.style.color = car.isPlayer ? '#00FFFF' : '#FFFFFF';
                    div._flashTimer = 120;
                }
                car.prevPos = newPos;
            }
        }

        // --- POWERUPS ---
        if (raceStarted) {
            _powerupSpawnTimer++;
            if (_powerupSpawnTimer >= POWERUP_SPAWN_INTERVAL) {
                spawnPowerup(powerupLayer, trackCenterline);
                _powerupSpawnTimer = 0;
            }
            updatePowerups(powerupLayer, allCars, player);
            tickBoosts(allCars);
        }

        // --- COLLISIONS ---
        const BUMP_DIST = 16; // radius * 2
        for (const ai of aiCars) {
            if (Math.hypot(ai.x - player.x, ai.y - player.y) < BUMP_DIST) {
                shakeOnBump();
                break;
            }
        }
        resolveCollisions(allCars);

        // --- ENGINE SOUND ---
        // TODO: needs tweaking
        // if (gas) updateEngineSound();

        // --- CAMERA ---
        const cam = updateCamera(world, player.x * ZOOM, player.y * ZOOM, app.screen.width, app.screen.height);
        updateShake(app.canvas, (!pState.onTrack && gas) ? 1 : 0);

        // Update floating labels
        const dpr = window.devicePixelRatio;
        for (let i = 0; i < allCars.length; i++) {
            const c = allCars[i];
            const screenX = (c.x + cam.x) * dpr;
            const screenY = (c.y + cam.y - 25) * dpr;
            const div = labelDivs[i];
            div.style.left = (screenX / dpr - 15) + 'px';
            div.style.top = (screenY / dpr) + 'px';
            if (div._flashTimer > 0) {
                div._flashTimer--;
                if (div._flashTimer <= 0) {
                    div.style.opacity = '0';
                    div.style.fontSize = '14px';
                }
            }
        }
        // Speed HUD floats near player sprite
        const pScreenX = (player.x + cam.x) * dpr;
        const pScreenY = (player.y + cam.y + 20) * dpr;
        speedHud.style.left = (pScreenX / dpr - 15) + 'px';
        speedHud.style.top = (pScreenY / dpr) + 'px';

        // --- SPRITES ---
        updateCarSprite(playerSprite, player, pState.slip, pState.turnSign, pState.movingForward, pState.steerInput);

        // --- SKID MARKS & PARTICLES (all cars) ---
        function emitCarEffects(car, state, slipThreshold = 0.4) {
            const rearX = -state.forwardX;
            const rearY = -state.forwardY;
            const rightX = Math.cos(car.rotation);
            const rightY = Math.sin(car.rotation);
            const lrx = car.x + rearX * 10 - rightX * 8;
            const lry = car.y + rearY * 10 - rightY * 8;
            const rrx = car.x + rearX * 10 + rightX * 8;
            const rry = car.y + rearY * 10 + rightY * 8;

            if (state.speed > 2 && state.slip > slipThreshold && car._prevLrx !== undefined) {
                skids.emitSeg(car._prevLrx, car._prevLry, lrx, lry);
                skids.emitSeg(car._prevRrx, car._prevRry, rrx, rry);
            }
            car._prevLrx = lrx; car._prevLry = lry;
            car._prevRrx = rrx; car._prevRry = rry;

            if (state.speed > 3 && state.slip > 0.5 && state.slip < Math.PI - 0.5) {
                const intensity = Math.min(Math.floor((state.slip - 0.5) * 4), 4);
                for (let i = 0; i < intensity; i++) {
                    particles.emit(lrx, lry, car.vx, car.vy);
                    particles.emit(rrx, rry, car.vx, car.vy);
                }
                // TODO: needs tweaking
                // const driftVel = car.isPlayer ? 1 : Math.max(0, 1 - Math.hypot(car.x - player.x, car.y - player.y) / 300);
                // if (driftVel > 0) updateDriftSound(driftVel);
            }
        }
        emitCarEffects(player, pState, 0.5);    // only real drifts leave marks
        for (let i = 0; i < aiCars.length; i++) {
            emitCarEffects(aiCars[i], aiStates[i], 0.5); // AI marks when they oversteer
        }
        skids.draw((x, y) => isOnTrack(x, y, trackCenterline), trackColor);
        particles.draw(cam.x, cam.y, ZOOM);

        // --- DEBUG LOG ---
    let dbg = '<b>RACE DEBUG</b><br>';
    for (const c of allCars) {
        const name = c === player ? 'PLAYER' : getColorName(c.color);
        const on = isOnTrack(c.x, c.y, trackCenterline) ? 'ON' : 'OFF';
        const idx = c._trackIdx !== undefined ? c._trackIdx : '?';
        const prog = (c.lap + (c._trackIdx || 0) / 1000).toFixed(3);
        dbg += `${name}: lap=${c.lap} idx=${idx} prog=${prog} ${on}<br>`;
    }
    debugDiv.innerHTML = dbg;
    speedHud.textContent = `${pState.speed.toFixed(1)}`;
    if (player._heldPowerup) {
        powerupHud.style.display = 'block';
        powerupHud.style.color = player._heldPowerup === 'S' ? '#00FF88' : '#FF8800';
        powerupHud.textContent = player._speedBoost ? '▶▶' : `[${player._heldPowerup}] Z / b:2`;
    } else if (player._speedBoost) {
        powerupHud.style.display = 'block';
        powerupHud.style.color = '#FFFFFF';
        powerupHud.textContent = '▶▶';
    } else {
        powerupHud.style.display = 'none';
    }
    updateMinimap();
    }
});


function resetCarsForNewRace() {
    for (let i = 0; i < aiCars.length; i++) {
        placeOnGrid(aiCars[i], i);
        aiCars[i].lap = 0; aiCars[i].prevPos = 0; aiCars[i]._trackIdx = 0;
        aiCars[i].vx = 0; aiCars[i].vy = 0; aiCars[i]._steerInertia = 0;
        aiCars[i]._lapDelta = 0; aiCars[i]._draftBoost = 0;
        aiCars[i]._offTrackSince = 0; aiCars[i]._finishOrder = 0; aiCars[i]._stuckFrames = 0;
        if (aiCars[i]._trackMemory) aiCars[i].aiType = 'waypoint';
        // Re-roll spline params per track so shared track IDs give identical AI behaviour
        const aiRng = createRng(trackSeed + i);
        rerollSplineParams(aiCars[i], aiRng);
    }
    placeOnGrid(player, 5);
    player.lap = 0; player.prevPos = 0; player._trackIdx = 0;
    player.vx = 0; player.vy = 0;
    player._lapDelta = 0; player._finishOrder = 0;
    _finishCounter = 0;
    raceStarted = false;
    raceFinished = false;
    raceFrame = 0;
    playerFinishFrame = 0;
    _splitFrames = [null, null, null];
    challengeTime = null;
    challengeLaps = null;
    challengeSplits = null;
    finishedDiv.style.display = 'none';
    deltaDiv.style.display = 'none';
    _waitForGasRelease = true;
    showLabels();
}

async function advanceToNextTrack() {
    if (_advancingTrack) return;
    _advancingTrack = true;
    finishedDiv.style.display = 'none';
    deltaDiv.style.display = 'none';

    // Reset controls state for the new race
    controlsAcknowledged = false;
    controlsDiv.style.display = '';

    const sel = await showTrackSelect(sessionRaces.length > 0, controlsDiv);
    if (sel.endSession) {
        _advancingTrack = false;
        await endSession();
        return;
    }

    raceStarted = false;
    player.trackDifficulty = sel.difficulty;
    rebuildTrack(sel.difficulty, sel.seed);
    await warmUpAI();
    resetCarsForNewRace();
    _advancingTrack = false;
}

async function endSession() {
    if (_advancingTrack) return;
    _advancingTrack = true;
    finishedDiv.style.display = 'none';
    deltaDiv.style.display = 'none';

    await showSessionSummary(sessionRaces);

    raceStarted = false;
    sessionRaces = [];

    // Reset controls state for the new session
    controlsAcknowledged = false;
    controlsDiv.style.display = '';

    const sel = await showTrackSelect(false, controlsDiv);
    player.trackDifficulty = sel.difficulty;
    rebuildTrack(sel.difficulty, sel.seed);
    await warmUpAI();
    resetCarsForNewRace();
    _advancingTrack = false;
}

// --- PWA ---
if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js');
}

const _isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent) && !window.navigator.standalone;
const _isStandalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone;

const installBanner = document.createElement('div');
installBanner.style.cssText = `
    display:none;
    position:absolute;
    bottom:16px;left:50%;
    transform:translateX(-50%);
    background:rgba(0,0,0,0.85);
    color:#00FFFF;
    border:1px solid #00FFFF44;
    padding:8px 16px;
    font-family:monospace;font-size:13px;
    border-radius:6px;
    z-index:2000;
    text-align:center;
    white-space:nowrap;
    cursor:pointer;
`;
document.body.appendChild(installBanner);

let _deferredInstall = null;

if (!_isStandalone) {
    window.addEventListener('beforeinstallprompt', e => {
        e.preventDefault();
        _deferredInstall = e;
        installBanner.textContent = 'Install App';
        installBanner.style.display = 'block';
    });

    installBanner.addEventListener('click', async () => {
        if (_isIOS) { installBanner.style.display = 'none'; return; }
        if (!_deferredInstall) return;
        _deferredInstall.prompt();
        const { outcome } = await _deferredInstall.userChoice;
        installBanner.style.display = 'none';
        _deferredInstall = null;
    });

    // iOS: no beforeinstallprompt — show manual instructions after a short delay
    if (_isIOS) {
        setTimeout(() => {
            installBanner.textContent = 'Tap Share → Add to Home Screen to install';
            installBanner.style.display = 'block';
            setTimeout(() => { installBanner.style.display = 'none'; }, 6000);
        }, 2000);
    }

    window.addEventListener('appinstalled', () => { installBanner.style.display = 'none'; });

    window.drawRacingLine = function(color = 0x00FF00, alpha = 0.7) {
        debugGfx.clear();
        if (!trackRacingLine.length) { console.log('No racing line available'); return; }
        debugGfx.moveTo(trackRacingLine[0].x, trackRacingLine[0].y);
        for (let i = 1; i < trackRacingLine.length; i++)
            debugGfx.lineTo(trackRacingLine[i].x, trackRacingLine[i].y);
        debugGfx.closePath();
        debugGfx.stroke({ width: 6, color, alpha, join: 'round', cap: 'round' });
        const maxDev = Math.max(...trackRacingLine.map((p, i) => Math.hypot(p.x - trackCenterline[i].x, p.y - trackCenterline[i].y)));
        console.log(`Racing line drawn. Max deviation from centerline: ${maxDev.toFixed(1)} (track half-width: ${130}). Call clearRacingLine() to remove.`);
    };
    window.clearRacingLine = function() { debugGfx.clear(); };
}
