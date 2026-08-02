import { S } from './state.js';
import { isRemapping, rmap, keyMap, buttonMap, commandNames, presentKeyMap } from './controls.js';

// --- DOM element exports (updated per-frame by gameLoop.js) ---
export let orientationDiv = null;
export let controlsDiv = null;
export let lapDiv = null;
export let deltaDiv = null;
export let powerupHud = null;
export let speedHud = null;
export let finishedDiv = null;
export let announceDiv = null;
export let debugDiv = null;
export let labelDivs = [];
export let installBanner = null;
export let _deferredInstall = null;

// ------------------------------------------------------------------
// Init
// ------------------------------------------------------------------
export function initHud({ _isMobile, challengeTime, challengeLaps, onDismiss }) {
  S._isMobile = _isMobile;
  S.MAP_W = _isMobile ? 130 : 220;
  S.MINIMAP_SCALE = S.MAP_W / 4000;

  // Orientation lock
  orientationDiv = document.createElement('div');
  orientationDiv.style.cssText = `
    position:fixed;inset:0;z-index:99999;
    background:#050510;color:#00FFFF;
    font-family:monospace;font-size:20px;font-weight:bold;
    display:none;flex-direction:column;align-items:center;justify-content:center;gap:16px;
    text-align:center;
  `;
  orientationDiv.innerHTML = `<div style="font-size:48px">&#8635;</div><div>Rotate to landscape</div>`;
  document.body.appendChild(orientationDiv);
  checkOrientation();
  window.addEventListener('orientationchange', checkOrientation);
  window.addEventListener('resize', checkOrientation);

  // Controls overlay
  controlsDiv = document.createElement('div');
  controlsDiv.style.cssText = `
    position: fixed;
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

  document.getElementById('ctrl-ok').addEventListener('click', onDismiss);
  document.addEventListener('keydown', (e) => {
    if (!S.controlsAcknowledged && (e.key === 'Enter' || e.key === ' ')) onDismiss();
  });
  document.getElementById('ctrl-remap').addEventListener('click', () => {
    mainPanel.style.display = 'none';
    remapPanel.style.display = 'block';
    presentKeyMap(remapPanel, () => {
      remapPanel.style.display = 'none';
      remapPanel.innerHTML = '';
      mainPanel.style.display = 'block';
    });
  });

  // Lap / delta / powerup / speed HUDs
  lapDiv = document.createElement('div');
  lapDiv.style.cssText = `position:absolute;top:10px;left:10px;color:#00FFFF;font-family:monospace;font-size:${_isMobile ? '13px' : '18px'};z-index:1000;pointer-events:none;`;
  document.body.appendChild(lapDiv);

  deltaDiv = document.createElement('div');
  deltaDiv.style.cssText = 'position:absolute;top:34px;left:10px;font-family:monospace;font-size:15px;font-weight:bold;z-index:1000;pointer-events:none;display:none';
  document.body.appendChild(deltaDiv);

  powerupHud = document.createElement('div');
  powerupHud.style.cssText = 'position:absolute;top:10px;right:10px;font-family:monospace;font-size:20px;font-weight:bold;z-index:1000;pointer-events:none;display:none';
  document.body.appendChild(powerupHud);

  speedHud = document.createElement('div');
  speedHud.style.cssText = 'position:absolute;color:#FF8000;font-family:monospace;font-size:11px;z-index:1000;pointer-events:none;opacity:0.7;';
  document.body.appendChild(speedHud);

  // Finished overlay
  finishedDiv = document.createElement('div');
  finishedDiv.style.cssText = `
    position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);
    background:rgba(0,0,0,0.88);border:2px solid #00FFFF;border-radius:8px;
    padding:16px 20px;color:#00FFFF;font-family:monospace;font-size:clamp(12px,2.5vw,16px);
    text-align:center;z-index:5000;line-height:1.7;display:none;
    width:min(90vw,420px);max-height:85vh;overflow-y:auto;box-sizing:border-box;
  `;
  document.body.appendChild(finishedDiv);

  // Announcement
  announceDiv = document.createElement('div');
  announceDiv.style.cssText = `
    position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);
    color:#FFFFFF;font-family:monospace;font-size:36px;font-weight:bold;
    text-shadow:0 0 10px #00FFFF;z-index:2000;pointer-events:none;
    opacity:0;transition:opacity 0.3s;
  `;
  document.body.appendChild(announceDiv);

  // Debug panel
  debugDiv = document.createElement('div');
  debugDiv.style.cssText = `
    position:absolute;bottom:10px;left:10px;color:#00FF00;
    background:rgba(0,0,0,0.9);font-family:monospace;font-size:12px;
    z-index:99999;pointer-events:none;padding:8px;line-height:1.4;
  `;
  debugDiv.style.display = 'none';
  document.body.appendChild(debugDiv);

  // Position labels
  for (let i = 0; i < S.allCars.length; i++) {
    const div = document.createElement('div');
    div.style.cssText = `
      position:absolute;color:#FFFFFF;font-family:monospace;font-size:14px;font-weight:bold;
      text-align:center;width:30px;pointer-events:none;transition:opacity 1s;opacity:0;
    `;
    div.textContent = String(i + 1);
    document.body.appendChild(div);
    labelDivs.push(div);
  }

  // PWA banner
  installBanner = document.createElement('div');
  installBanner.style.cssText = `
    display:none;position:absolute;bottom:16px;left:50%;
    transform:translateX(-50%);background:rgba(0,0,0,0.85);color:#00FFFF;
    border:1px solid #00FFFF44;padding:8px 16px;font-family:monospace;font-size:13px;
    border-radius:6px;z-index:2000;text-align:center;white-space:nowrap;cursor:pointer;
  `;
  document.body.appendChild(installBanner);
}

// ------------------------------------------------------------------
// Orientation
// ------------------------------------------------------------------
export function checkOrientation() {
  if (!S._isMobile) return;
  const portrait = window.screen.orientation
    ? window.screen.orientation.type.startsWith('portrait')
    : window.innerHeight > window.innerWidth;
  orientationDiv.style.display = portrait ? 'flex' : 'none';
}

// ------------------------------------------------------------------
// Overlay helpers
// ------------------------------------------------------------------
export function dismissControls() {
  if (S.controlsAcknowledged) return;
  if (controlsDiv.style.display === 'none') return;
  if (isRemapping()) return;
  controlsDiv.style.display = 'none';
  S.controlsAcknowledged = true;
}

export function showFinishedOverlay(rank, timeStr, challengeStr, shareUrl, sessionCount, onNext, onEnd) {
  const place = `${rank}${rank === 1 ? 'st' : rank === 2 ? 'nd' : rank === 3 ? 'rd' : 'th'}`;
  const challengeBlock = challengeStr ? `<div style="margin:6px 0;font-size:15px">${challengeStr}</div>` : '';
  const kAct = rmap(keyMap)['activate'] ?? 'Z';
  const bAct = rmap(buttonMap)['activate'] ?? 'b:2';
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
        Next Race  (${kAct} / ${bAct})
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
  document.getElementById('finished-next').addEventListener('click', () => { finishedDiv.style.display = 'none'; onNext(); });
  document.getElementById('finished-end').addEventListener('click', () => { finishedDiv.style.display = 'none'; onEnd(); });
}

export function showAnnounce(text) {
  announceDiv.textContent = text;
  announceDiv.style.opacity = '1';
  setTimeout(() => { announceDiv.style.opacity = '0'; }, 2000);
}

export function showLabels() {
  labelDivs.forEach(d => { d.style.opacity = '1'; });
  setTimeout(() => { labelDivs.forEach(d => { d.style.opacity = '0'; }); }, 4000);
}

// ------------------------------------------------------------------
// Minimap
// ------------------------------------------------------------------
export function updateMinimap() {
  S.minimap.x = S.app.screen.width - S.MAP_W - 16;
  S.minimap.y = S._isMobile ? 16 : S.app.screen.height - S.MAP_W - 16;
  S.minimapDots.clear();
  for (const p of S.powerupLayer.powerups) {
    S.minimapDots.circle(p.x * S.MINIMAP_SCALE, p.y * S.MINIMAP_SCALE, 2);
    S.minimapDots.fill({ color: p.type === 'S' ? 0x00FF88 : 0xFF8800, alpha: 0.8 });
  }
  for (const c of S.allCars) {
    const mx = c.x * S.MINIMAP_SCALE;
    const my = c.y * S.MINIMAP_SCALE;
    const color = c === S.player ? 0x00FFFF : c.color;
    S.minimapDots.circle(mx, my, c === S.player ? 3.5 : 2.5);
    S.minimapDots.fill({ color, alpha: 0.9 });
  }
}

// ------------------------------------------------------------------
// Challenge helpers
// ------------------------------------------------------------------
export function parseHash(hash) {
  const params = {};
  for (const part of hash.replace(/^#/, '').split('&')) {
    const eq = part.indexOf('=');
    if (!part) continue;
    if (eq === -1) params[part] = true;
    else params[part.slice(0, eq)] = part.slice(eq + 1);
  }
  return params;
}

export function encodeChallenge(laps, frames, splits) {
  const s = splits ? `${laps}:${splits[0]}:${splits[1]}:${splits[2]}:${frames}` : `${laps}:${frames}`;
  return btoa(s);
}

export function decodeChallenge(s) {
  try {
    const parts = atob(s).split(':').map(Number);
    if (parts.length === 5) return { laps: parts[0], splits: [parts[1], parts[2], parts[3]], frames: parts[4] };
    if (parts.length === 2) return { laps: parts[0], splits: null, frames: parts[1] };
    return null;
  } catch { return null; }
}

export function challengeDelta(raceFrame, progress, splits, totalFrames) {
  const pts = [0, 0.25, 0.5, 0.75, 1.0];
  const times = splits
    ? [0, splits[0], splits[1], splits[2], totalFrames]
    : [0, totalFrames * 0.25, totalFrames * 0.5, totalFrames * 0.75, totalFrames];
  let i = pts.findIndex((p, j) => j > 0 && progress <= p);
  if (i < 1) i = pts.length - 1;
  const t = (progress - pts[i - 1]) / (pts[i] - pts[i - 1]);
  return raceFrame - (times[i - 1] + t * (times[i] - times[i - 1]));
}

export function formatTime(frames) {
  const totalCs = Math.round(frames / 60 * 100);
  const cs = totalCs % 100;
  const totalS = Math.floor(totalCs / 100);
  const s = totalS % 60;
  const m = Math.floor(totalS / 60);
  return `${m}:${String(s).padStart(2, '0')}.${String(cs).padStart(2, '0')}`;
}

// ------------------------------------------------------------------
// PWA banner
// ------------------------------------------------------------------
export function setupPwaBanner() {
  const _isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent) && !window.navigator.standalone;
  const _isStandalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone;
  if (_isStandalone) return;

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

  if (_isIOS) {
    setTimeout(() => {
      installBanner.textContent = 'Tap Share → Add to Home Screen to install';
      installBanner.style.display = 'block';
      setTimeout(() => { installBanner.style.display = 'none'; }, 6000);
    }, 2000);
  }

  window.addEventListener('appinstalled', () => { installBanner.style.display = 'none'; });
}
