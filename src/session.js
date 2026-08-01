// session.js — session summary canvas and overlay

const DIFF_MAP = {
    0.2: { label: 'Smooth', color: '#00FF88' },
    0.5: { label: 'Technical', color: '#FFD700' },
    0.8: { label: 'Chaotic', color: '#FF4444' },
};

function getDiff(difficulty) {
    return DIFF_MAP[difficulty] ?? { label: 'Custom', color: '#AAAAAA' };
}

function formatTime(frames) {
    const ms = Math.round(frames * 1000 / 60);
    const m = Math.floor(ms / 60000);
    const s = Math.floor((ms % 60000) / 1000);
    const cs = Math.floor((ms % 1000) / 10);
    return `${m}:${String(s).padStart(2, '0')}.${String(cs).padStart(2, '0')}`;
}

function ordinal(n) {
    return n === 1 ? '1st' : n === 2 ? '2nd' : n === 3 ? '3rd' : `${n}th`;
}

function drawTrackLine(ctx, points, x, y, w, h) {
    if (!points?.length) return;
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const p of points) {
        if (p.x < minX) minX = p.x; if (p.x > maxX) maxX = p.x;
        if (p.y < minY) minY = p.y; if (p.y > maxY) maxY = p.y;
    }
    const PAD = 8;
    const rangeX = maxX - minX || 1;
    const rangeY = maxY - minY || 1;
    const sc = Math.min((w - PAD * 2) / rangeX, (h - PAD * 2) / rangeY);
    const cx = (minX + maxX) / 2;
    const cy = (minY + maxY) / 2;

    ctx.save();
    ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip();

    // Map bounding-box center → cell center
    ctx.translate(x + w / 2, y + h / 2);
    ctx.scale(sc, sc);
    ctx.translate(-cx, -cy);

    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);
    for (let i = 1; i < points.length; i++) ctx.lineTo(points[i].x, points[i].y);
    ctx.closePath();
    ctx.globalAlpha = 0.22;
    ctx.strokeStyle = '#00FFFF';
    ctx.lineWidth = 10 / sc;
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);
    for (let i = 1; i < points.length; i++) ctx.lineTo(points[i].x, points[i].y);
    ctx.closePath();
    ctx.globalAlpha = 1;
    ctx.strokeStyle = '#00FFFF';
    ctx.lineWidth = 3 / sc;
    ctx.stroke();

    ctx.restore();
}

export function generateSessionCanvas(races) {
    const CARD_W = 180, MAP_H = 118, STATS_H = 95, CARD_H = MAP_H + STATS_H;
    const GAP = 14, PAD = 22;
    const HEADER_H = 76, FOOTER_H = 50;
    const COLS = Math.min(3, races.length);
    const ROWS = Math.ceil(races.length / COLS);
    const W = COLS * (CARD_W + GAP) - GAP + PAD * 2;
    const H = HEADER_H + ROWS * (CARD_H + GAP) - GAP + PAD + FOOTER_H;

    const canvas = document.createElement('canvas');
    canvas.width = W; canvas.height = H;
    const ctx = canvas.getContext('2d');

    ctx.fillStyle = '#080810';
    ctx.fillRect(0, 0, W, H);

    ctx.textAlign = 'center';
    ctx.font = 'bold 22px monospace';
    ctx.fillStyle = '#FFFFFF';
    ctx.fillText('NEON RALLY', W / 2, 32);

    ctx.font = '11px monospace';
    ctx.fillStyle = '#00FFFF';
    ctx.fillText(`SESSION COMPLETE  ·  ${new Date().toLocaleDateString()}`, W / 2, 52);

    ctx.beginPath();
    ctx.moveTo(PAD, 63); ctx.lineTo(W - PAD, 63);
    ctx.strokeStyle = '#00FFFF33'; ctx.lineWidth = 1; ctx.stroke();

    races.forEach((race, idx) => {
        const col = idx % COLS;
        const row = Math.floor(idx / COLS);
        const cx = PAD + col * (CARD_W + GAP);
        const cy = HEADER_H + row * (CARD_H + GAP);
        const di = getDiff(race.difficulty);

        ctx.fillStyle = '#0d0d1c';
        ctx.strokeStyle = '#00FFFF22';
        ctx.lineWidth = 1;
        ctx.beginPath();
        if (ctx.roundRect) ctx.roundRect(cx, cy, CARD_W, CARD_H, 6);
        else ctx.rect(cx, cy, CARD_W, CARD_H);
        ctx.fill(); ctx.stroke();

        drawTrackLine(ctx, race.points, cx + 6, cy + 6, CARD_W - 12, MAP_H - 6);

        ctx.textAlign = 'left';
        const tx = cx + 8;
        let ty = cy + MAP_H + 14;

        ctx.font = '9px monospace';
        ctx.fillStyle = '#333';
        ctx.fillText(race.trackId, tx, ty); ty += 15;

        ctx.font = 'bold 12px monospace';
        ctx.fillStyle = di.color;
        ctx.fillText(di.label, tx, ty); ty += 17;

        ctx.font = 'bold 14px monospace';
        ctx.fillStyle = '#FFD700';
        ctx.fillText(formatTime(race.timeFrames), tx, ty); ty += 17;

        ctx.font = '12px monospace';
        ctx.fillStyle = race.rank === 1 ? '#00FF88' : '#AAAAAA';
        ctx.fillText(ordinal(race.rank) + ' place', tx, ty); ty += 14;

        ctx.font = '10px monospace';
        ctx.fillStyle = '#444';
        ctx.fillText(`${race.laps} lap${race.laps !== 1 ? 's' : ''}`, tx, ty);
    });

    const footerY = H - FOOTER_H + 14;
    ctx.beginPath();
    ctx.moveTo(PAD, footerY - 4); ctx.lineTo(W - PAD, footerY - 4);
    ctx.strokeStyle = '#00FFFF22'; ctx.lineWidth = 1; ctx.stroke();

    const best = races.reduce((b, r) => r.timeFrames < b.timeFrames ? r : b, races[0]);
    ctx.textAlign = 'center';
    ctx.font = '10px monospace';
    ctx.fillStyle = '#666';
    const wins = races.filter(r => r.rank === 1).length;
    ctx.fillText(
        `${races.length} race${races.length !== 1 ? 's' : ''}  ·  Best: ${formatTime(best.timeFrames)}  ·  Wins: ${wins}`,
        W / 2, footerY + 14
    );

    return canvas;
}

export function showSessionSummary(races) {
    return new Promise(resolve => {
        const canvas = generateSessionCanvas(races);
        const dataUrl = canvas.toDataURL('image/png');

        const overlay = document.createElement('div');
        overlay.style.cssText = `
            position:fixed;top:0;left:0;width:100%;height:100%;
            background:rgba(0,0,10,0.97);z-index:7000;
            display:flex;flex-direction:column;align-items:center;justify-content:center;
            font-family:monospace;padding:16px;box-sizing:border-box;gap:16px;
        `;

        const img = document.createElement('img');
        img.src = dataUrl;
        img.style.cssText = 'max-width:min(95vw,700px);max-height:62vh;object-fit:contain;border-radius:6px;border:1px solid #00FFFF33';
        overlay.appendChild(img);

        const btns = document.createElement('div');
        btns.style.cssText = 'display:flex;gap:12px;flex-wrap:wrap;justify-content:center';

        const shareBtn = document.createElement('button');
        shareBtn.textContent = 'Share / Download';
        shareBtn.style.cssText = `
            background:#00FFFF;color:#000;border:none;padding:8px 22px;
            font-family:monospace;font-size:14px;cursor:pointer;border-radius:4px;
        `;
        shareBtn.addEventListener('click', () => {
            canvas.toBlob(async blob => {
                const file = new File([blob], 'neon-rally-session.png', { type: 'image/png' });
                if (navigator.share && navigator.canShare?.({ files: [file] })) {
                    try { await navigator.share({ files: [file], title: 'Neon Rally Session' }); return; } catch {}
                }
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url; a.download = 'neon-rally-session.png'; a.click();
                setTimeout(() => URL.revokeObjectURL(url), 1000);
            });
        });
        btns.appendChild(shareBtn);

        const againBtn = document.createElement('button');
        againBtn.textContent = 'Play Again';
        againBtn.style.cssText = `
            background:transparent;color:#00FFFF;border:1px solid #00FFFF;padding:8px 22px;
            font-family:monospace;font-size:14px;cursor:pointer;border-radius:4px;
        `;
        againBtn.addEventListener('click', () => {
            document.body.removeChild(overlay);
            resolve();
        });
        btns.appendChild(againBtn);

        overlay.appendChild(btns);
        document.body.appendChild(overlay);
    });
}
