// menu.js — mode and track selection overlays

import { generateTrack } from './track.js';
import { makeControlHandler } from './controls.js';
import { S } from './state.js';
import { MODES } from './modes.js';

const DIFFICULTIES = [0.2, 0.5, 0.8];
const DIFFICULTY_LABELS = ['Smooth', 'Technical', 'Chaotic'];
const DIFFICULTY_COLORS = ['#00FF88', '#FFD700', '#FF4444'];

function drawMinimap(canvas, points) {
    const ctx = canvas.getContext('2d');
    const W = canvas.width, H = canvas.height;
    const PAD = 10;

    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const p of points) {
        if (p.x < minX) minX = p.x; if (p.x > maxX) maxX = p.x;
        if (p.y < minY) minY = p.y; if (p.y > maxY) maxY = p.y;
    }
    const rangeX = maxX - minX || 1;
    const rangeY = maxY - minY || 1;
    const sc = Math.min((W - PAD * 2) / rangeX, (H - PAD * 2) / rangeY);
    const cx = (minX + maxX) / 2;
    const cy = (minY + maxY) / 2;

    ctx.fillStyle = '#020810';
    ctx.fillRect(0, 0, W, H);

    // Transform: map track bounding-box center → canvas center
    ctx.save();
    ctx.translate(W / 2, H / 2);
    ctx.scale(sc, sc);
    ctx.translate(-cx, -cy);

    // Glow
    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);
    for (let i = 1; i < points.length; i++) ctx.lineTo(points[i].x, points[i].y);
    ctx.closePath();
    ctx.globalAlpha = 0.25;
    ctx.strokeStyle = '#00FFFF';
    ctx.lineWidth = 14 / sc;
    ctx.lineJoin = 'round';
    ctx.stroke();

    // Line
    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);
    for (let i = 1; i < points.length; i++) ctx.lineTo(points[i].x, points[i].y);
    ctx.closePath();
    ctx.globalAlpha = 1;
    ctx.strokeStyle = '#00FFFF';
    ctx.lineWidth = 3 / sc;
    ctx.lineJoin = 'round';
    ctx.stroke();

    ctx.restore();
}

export function showModeSelect() {
    return new Promise(resolve => {
        const overlay = document.createElement('div');
        overlay.style.cssText = `
            position:fixed;top:0;left:0;width:100%;height:100%;
            background:#00000f;z-index:6000;
            display:flex;flex-direction:column;align-items:center;justify-content:center;
            font-family:monospace;box-sizing:border-box;
        `;

        const title = document.createElement('h1');
        title.textContent = 'SELECT MODE';
        title.style.cssText = 'margin:0 0 6px 0;font-size:clamp(16px,4vw,26px);letter-spacing:4px;color:#fff;text-shadow:0 0 12px #00FFFF';
        overlay.appendChild(title);

        const sub = document.createElement('p');
        sub.textContent = 'Choose your race format';
        sub.style.cssText = 'margin:0 0 28px 0;font-size:11px;color:#00FFFF66;font-family:monospace';
        overlay.appendChild(sub);

        const cardsRow = document.createElement('div');
        cardsRow.style.cssText = 'display:flex;gap:20px;flex-wrap:wrap;justify-content:center;padding:0 16px';
        overlay.appendChild(cardsRow);

        let resolved = false;
        let inputReady = false;
        setTimeout(() => { inputReady = true; }, 400);
        const cards = [];
        let selectedIdx = 0;

        function setSelected(idx) {
            selectedIdx = (idx + cards.length) % cards.length;
            cards.forEach((c, i) => {
                c.style.borderColor = i === selectedIdx ? '#00FFFF' : '#00FFFF33';
                c.style.boxShadow   = i === selectedIdx ? '0 0 14px #00FFFF88' : 'none';
            });
        }

        function pickIdx(idx) {
            if (resolved) return;
            resolved = true;
            clearInterval(gpPoll);
            document.removeEventListener('keydown', onKey);
            document.body.removeChild(overlay);
            resolve(MODES[idx]);
        }

        let navCooldown = 0;
        function onKey(e) {
            if (!inputReady) return;
            if (navCooldown > 0) return;
            if (e.key === 'ArrowLeft'  || e.key === 'ArrowUp')    { e.preventDefault(); setSelected(selectedIdx - 1); navCooldown = 5; }
            if (e.key === 'ArrowRight' || e.key === 'ArrowDown')   { e.preventDefault(); setSelected(selectedIdx + 1); navCooldown = 5; }
            if (e.key === 'Enter' || e.key === ' ')                { e.preventDefault(); pickIdx(selectedIdx); }
        }
        document.addEventListener('keydown', onKey);

        const menuInput = { steerLeft: false, steerRight: false, gas: false, activate: false, pause: false };
        const pollControls = makeControlHandler(menuInput);
        const gpPoll = setInterval(() => {
            menuInput.steerLeft = menuInput.steerRight = menuInput.gas = menuInput.activate = false;
            pollControls();
            if (!inputReady || navCooldown > 0) { navCooldown = Math.max(0, navCooldown - 1); return; }
            if (menuInput.steerLeft)  { setSelected(selectedIdx - 1); navCooldown = 5; }
            if (menuInput.steerRight) { setSelected(selectedIdx + 1); navCooldown = 5; }
            if (menuInput.gas || menuInput.activate) { pickIdx(selectedIdx); }
        }, 80);

        MODES.forEach((mode, i) => {
            const card = document.createElement('div');
            card.style.cssText = `
                background:#070714;border:1px solid #00FFFF33;border-radius:8px;
                padding:24px 20px;cursor:pointer;text-align:center;
                width:clamp(150px,28vw,200px);
                transition:border-color 0.15s,box-shadow 0.15s;
            `;
            card.addEventListener('mouseover', () => { if (selectedIdx !== i) { card.style.borderColor = '#00FFFF'; card.style.boxShadow = '0 0 14px #00FFFF33'; } });
            card.addEventListener('mouseout',  () => { if (selectedIdx !== i) { card.style.borderColor = '#00FFFF33'; card.style.boxShadow = 'none'; } });
            card.addEventListener('click', () => pickIdx(i));

            const labelEl = document.createElement('div');
            labelEl.textContent = mode.label;
            labelEl.style.cssText = 'font-size:clamp(14px,3vw,18px);font-weight:bold;color:#00FFFF;letter-spacing:2px;margin-bottom:10px';
            card.appendChild(labelEl);

            const descEl = document.createElement('div');
            descEl.textContent = mode.description;
            descEl.style.cssText = 'font-size:11px;color:#aaa;margin-bottom:16px;line-height:1.5';
            card.appendChild(descEl);

            const statsEl = document.createElement('div');
            statsEl.style.cssText = 'font-size:10px;color:#00FFFF66;margin-bottom:18px;line-height:1.8';
            statsEl.innerHTML = `Map size: ×${mode.sizeMultiplier}<br>Laps: ${mode.totalLaps}`;
            card.appendChild(statsEl);

            const btn = document.createElement('button');
            btn.textContent = 'SELECT';
            btn.style.cssText = `
                background:#00FFFF;color:#000;border:none;padding:6px 0;width:100%;
                font-family:monospace;font-size:12px;cursor:pointer;border-radius:3px;
            `;
            btn.addEventListener('click', e => { e.stopPropagation(); pickIdx(i); });
            card.appendChild(btn);

            cards.push(card);
            cardsRow.appendChild(card);
        });

        setSelected(0);
        document.body.appendChild(overlay);
    });
}

export function showTrackSelect(canEndSession, hideEl = null) {
    return new Promise(resolve => {
        const prevDisplay = hideEl ? hideEl.style.display : null;
        if (hideEl) hideEl.style.display = 'none';
        const sm = S.mode ? S.mode.sizeMultiplier : 1.0;
        const ts = S.mode ? S.mode.trackSamples : 1000;
        const options = DIFFICULTIES.map((diff, i) => {
            const data = generateTrack(diff, 0, null, sm, ts);
            return { ...data, difficulty: diff, label: DIFFICULTY_LABELS[i], color: DIFFICULTY_COLORS[i] };
        });

        const overlay = document.createElement('div');
        overlay.style.cssText = `
            position:fixed;top:0;left:0;width:100%;height:100%;
            background:#00000f;z-index:6000;
            display:flex;flex-direction:column;align-items:center;justify-content:center;
            font-family:monospace;box-sizing:border-box;
        `;

        const title = document.createElement('h1');
        title.textContent = 'SELECT YOUR TRACK';
        title.style.cssText = 'margin:0 0 6px 0;font-size:clamp(16px,4vw,26px);letter-spacing:4px;color:#fff;text-shadow:0 0 12px #00FFFF';
        overlay.appendChild(title);

        const sub = document.createElement('p');
        sub.textContent = 'Choose one — the others disappear';
        sub.style.cssText = 'margin:0 0 18px 0;font-size:11px;color:#00FFFF66;font-family:monospace';
        overlay.appendChild(sub);

        const cardsRow = document.createElement('div');
        cardsRow.style.cssText = 'display:flex;gap:12px;flex-wrap:wrap;justify-content:center;padding:0 16px';
        overlay.appendChild(cardsRow);

        let resolved = false;
        // All selectable items: track options + optional "end session"
        // cards array filled after DOM build; selectedIdx drives keyboard/gamepad highlight
        const cards = [];
        let selectedIdx = 0;

        function setSelected(idx) {
            selectedIdx = (idx + cards.length) % cards.length;
            cards.forEach((c, i) => {
                c.style.borderColor = i === selectedIdx ? '#00FFFF' : '#00FFFF33';
                c.style.boxShadow   = i === selectedIdx ? '0 0 14px #00FFFF88' : 'none';
            });
        }

        function pickIdx(idx) {
            if (resolved) return;
            resolved = true;
            clearInterval(gpPoll);
            document.removeEventListener('keydown', onKey);
            document.body.removeChild(overlay);
            if (hideEl) hideEl.style.display = prevDisplay;
            if (idx < options.length) resolve({ seed: options[idx].seed, difficulty: options[idx].difficulty });
            else resolve({ endSession: true });
        }

        let navCooldown = 0;
        function onKey(e) {
            if (navCooldown > 0) return;
            if (e.key === 'ArrowLeft'  || e.key === 'ArrowUp')    { e.preventDefault(); setSelected(selectedIdx - 1); navCooldown = 5; }
            if (e.key === 'ArrowRight' || e.key === 'ArrowDown')   { e.preventDefault(); setSelected(selectedIdx + 1); navCooldown = 5; }
            if (e.key === 'Enter' || e.key === ' ')                { e.preventDefault(); pickIdx(selectedIdx); }
        }
        document.addEventListener('keydown', onKey);

        // Use the game's own control handler
        const menuInput = { steerLeft: false, steerRight: false, gas: false, activate: false, pause: false };
        const pollControls = makeControlHandler(menuInput);
        const gpPoll = setInterval(() => {
            menuInput.steerLeft = menuInput.steerRight = menuInput.gas = menuInput.activate = false;
            pollControls();
            if (navCooldown > 0) { navCooldown--; return; }
            if (menuInput.steerLeft)  { setSelected(selectedIdx - 1); navCooldown = 5; }
            if (menuInput.steerRight) { setSelected(selectedIdx + 1); navCooldown = 5; }
            if (menuInput.gas) { pickIdx(selectedIdx); }
        }, 80);

        function pick(opt) {
            const idx = options.indexOf(opt);
            pickIdx(idx);
        }

        options.forEach((opt, oi) => {
            const card = document.createElement('div');
            card.style.cssText = `
                background:#070714;border:1px solid #00FFFF33;border-radius:8px;
                padding:10px;cursor:pointer;text-align:center;
                width:clamp(140px,26vw,175px);
                transition:border-color 0.15s,box-shadow 0.15s;
            `;
            card.addEventListener('mouseover', () => { if (selectedIdx !== oi) { card.style.borderColor = '#00FFFF'; card.style.boxShadow = '0 0 14px #00FFFF33'; } });
            card.addEventListener('mouseout',  () => { if (selectedIdx !== oi) { card.style.borderColor = '#00FFFF33'; card.style.boxShadow = 'none'; } });
            card.addEventListener('click', () => pick(opt));

            const cvs = document.createElement('canvas');
            cvs.width = 160;
            cvs.height = 110;
            cvs.style.cssText = 'display:block;position:static;width:160px;height:110px;max-width:100%;border-radius:4px;pointer-events:none';
            drawMinimap(cvs, opt.points);
            card.appendChild(cvs);

            const idEl = document.createElement('div');
            idEl.textContent = opt.trackId;
            idEl.style.cssText = 'margin-top:7px;font-size:10px;color:#444;letter-spacing:1px';
            card.appendChild(idEl);

            const labelEl = document.createElement('div');
            labelEl.textContent = opt.label;
            labelEl.style.cssText = `margin:3px 0 8px 0;font-size:13px;font-weight:bold;color:${opt.color}`;
            card.appendChild(labelEl);

            const btn = document.createElement('button');
            btn.textContent = 'SELECT';
            btn.style.cssText = `
                background:#00FFFF;color:#000;border:none;padding:5px 0;width:100%;
                font-family:monospace;font-size:12px;cursor:pointer;border-radius:3px;
            `;
            btn.addEventListener('click', e => { e.stopPropagation(); pick(opt); });
            card.appendChild(btn);

            cards.push(card);
            cardsRow.appendChild(card);
        });

        if (canEndSession) {
            const endRow = document.createElement('div');
            endRow.style.cssText = 'margin-top:20px';
            const endBtn = document.createElement('button');
            endBtn.textContent = 'End Session & View Results';
            endBtn.style.cssText = `
                background:transparent;color:#FF00FF;border:1px solid #FF00FF;
                padding:7px 22px;font-family:monospace;font-size:13px;cursor:pointer;border-radius:4px;
            `;
            endBtn.addEventListener('click', () => pickIdx(options.length));
            endRow.appendChild(endBtn);
            overlay.appendChild(endRow);
            cards.push(endBtn); // navigable via gamepad/keyboard
        }

        setSelected(0);
        document.body.appendChild(overlay);
    });
}
