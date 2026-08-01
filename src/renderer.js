// renderer.js — particles, skid marks, camera, car visuals

import { Graphics, Container } from 'pixi.js';

function _createWheel(isRear) {
    const w = isRear ? 6 : 5;
    const h = isRear ? 12 : 10;
    const g = new Graphics();
    g.roundRect(-w / 2, -h / 2, w, h, 2);
    g.fill({ color: 0x1a1a1a, alpha: 0.95 });
    g.stroke({ color: 0x555555, width: 0.5 });
    return g;
}

export function createCarSprite(color = 0x00FFFF, isPlayer = false) {
    const container = new Container();

    // wheels under body
    const wfl = _createWheel(false); wfl.position.set(-10,  -9);
    const wfr = _createWheel(false); wfr.position.set( 10,  -9);
    const wrl = _createWheel(true);  wrl.position.set(-10,  10);
    const wrr = _createWheel(true);  wrr.position.set( 10,  10);
    container.addChild(wfl, wfr, wrl, wrr);
    container._frontWheels = [wfl, wfr];
    container._wheelAngle  = 0;

    // body on top
    const body = new Graphics()
        .moveTo(-10, -15)
        .lineTo( 10, -15)
        .lineTo( 10, -13)
        .lineTo(  2, -13)
        .lineTo(  5,  -1)
        .lineTo(  6,   9)
        .lineTo(  4,  16)
        .lineTo( 11,  16)
        .lineTo( 11,  18)
        .lineTo(-11,  18)
        .lineTo(-11,  16)
        .lineTo( -4,  16)
        .lineTo( -6,   9)
        .lineTo( -5,  -1)
        .lineTo( -2, -13)
        .lineTo(-10, -13)
        .lineTo(-10, -15);
    body.fill({ color, alpha: 0.4 });
    body.stroke({ color, width: 1.5 });
    if (isPlayer) {
        body.moveTo(0, -15).lineTo(0, 18);
        body.stroke({ color: 0x00FFFF, width: 1.5, alpha: 0.85 });
    }
    container.addChild(body);

    container.pivot.set(0, -10);
    return container;
}

export function updateCarSprite(sprite, car, slip, turnSign, movingForward, steerInput = 0) {
    sprite.position.set(
        car.x + 10 * Math.sin(car.rotation),
        car.y - 10 * Math.cos(car.rotation)
    );
    sprite.rotation = car.rotation;
    const scale = 1 + (car.z * 0.01);
    sprite.scale.set(scale);
    sprite.skew.x = movingForward ? slip * 0.12 * turnSign : 0;

    const MAX_WHEEL = 0.45;
    sprite._wheelAngle += (steerInput * MAX_WHEEL - sprite._wheelAngle) * 0.15;
    for (const w of sprite._frontWheels) w.rotation = sprite._wheelAngle;
}

export function initParticles() {
    const canvas = document.createElement('canvas');
    canvas.style.position = 'absolute';
    canvas.style.top = '0';
    canvas.style.left = '0';
    canvas.style.pointerEvents = 'none';
    canvas.style.zIndex = '10';
    document.body.appendChild(canvas);
    const ctx = canvas.getContext('2d');

    function resize() {
        const dpr = window.devicePixelRatio;
        canvas.width = window.innerWidth * dpr;
        canvas.height = window.innerHeight * dpr;
        canvas.style.width = window.innerWidth + 'px';
        canvas.style.height = window.innerHeight + 'px';
    }
    resize();
    window.addEventListener('resize', resize);

    let particles = [];

    function emit(wx, wy, carVx, carVy) {
        const angle = Math.atan2(carVy, carVx) + Math.PI + (Math.random() - 0.5) * 1.5;
        const spd = 1 + Math.random() * 3;
        const colors = ['255,255,255,', '0,255,255,', '255,0,255,', '255,120,0,'];
        particles.push({
            wx, wy,
            vx: Math.cos(angle) * spd,
            vy: Math.sin(angle) * spd,
            alpha: 0.6 + Math.random() * 0.4,
            decay: 0.02 + Math.random() * 0.03,
            radius: 1 + Math.random() * 3,
            color: colors[Math.floor(Math.random() * colors.length)],
        });
    }

    function draw(camX, camY, zoom = 1) {
        const dpr = window.devicePixelRatio;
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        for (let i = particles.length - 1; i >= 0; i--) {
            const p = particles[i];
            p.wx += p.vx;
            p.wy += p.vy;
            p.vx *= 0.94;
            p.vy *= 0.94;
            p.alpha -= p.decay;
            if (p.alpha <= 0) {
                particles.splice(i, 1);
                continue;
            }
            const sx = (p.wx * zoom + camX) * dpr;
            const sy = (p.wy * zoom + camY) * dpr;
            ctx.beginPath();
            ctx.arc(sx, sy, p.radius * zoom * dpr, 0, Math.PI * 2);
            ctx.fillStyle = `rgba(${p.color} ${p.alpha})`;
            ctx.fill();
        }
    }

    return { canvas, emit, draw };
}

export function initSkids() {
    const graphics = new Graphics();
    let segments = [];
    const MAX_SEGMENTS = 2000;

    function emitSeg(x1, y1, x2, y2) {
        segments.push({ x1, y1, x2, y2, age: 0 });
    }

    function clear() {
        graphics.clear();
        segments = [];
    }

    const PALETTE = [0x00FFFF, 0xFF00FF, 0x00FF00, 0xFF8000, 0xFFFF00, 0x8000FF];
    function draw(isOnTrackFn, trackColor = 0x00FFFF) {
        const idx = PALETTE.indexOf(trackColor);
        const skidColor = PALETTE[(idx + 3) % PALETTE.length];
        segments.forEach(s => s.age++);
        segments = segments.filter(s => s.age < 600);
        if (segments.length > MAX_SEGMENTS) {
            segments = segments.slice(segments.length - MAX_SEGMENTS);
        }
        graphics.clear();
        for (const s of segments) {
            const alpha = Math.max(0, 1 - s.age / 2400);
            const onSeg = isOnTrackFn((s.x1 + s.x2) * 0.5, (s.y1 + s.y2) * 0.5);
            const segAlpha = onSeg ? alpha * 0.25 : alpha * 0.15;
            graphics.moveTo(s.x1, s.y1);
            graphics.lineTo(s.x2, s.y2);
            graphics.stroke({ width: 2, color: skidColor, alpha: segAlpha });
        }
    }

    return { graphics, emitSeg, clear, draw };
}

export function updateCamera(world, targetX, targetY, screenW, screenH) {
    world.x = screenW / 2 - targetX;
    world.y = screenH / 2 - targetY;
    return { x: world.x, y: world.y };
}

// --- SCREEN SHAKE ---

let _shakePx = 0;
let _shakeFrames = 0;

export function shakeOnBump() {
    _shakePx = Math.max(_shakePx, 5);
    _shakeFrames = Math.max(_shakeFrames, 12);
}

// ambientPx: per-frame constant noise (e.g. off-track rumble); applied on top of
// any decaying one-shot shake so it doesn't get attenuated by the decay factor.
export function updateShake(canvas, ambientPx = 0) {
    let rx = 0, ry = 0;
    if (_shakeFrames > 0) {
        const amt = _shakePx * (_shakeFrames / 12);
        rx += (Math.random() * 2 - 1) * amt;
        ry += (Math.random() * 2 - 1) * amt;
        _shakeFrames--;
        if (_shakeFrames <= 0) _shakePx = 0;
    }
    if (ambientPx > 0) {
        rx += (Math.random() * 2 - 1) * ambientPx;
        ry += (Math.random() * 2 - 1) * ambientPx;
    }
    canvas.style.translate = `${rx.toFixed(1)}px ${ry.toFixed(1)}px`;
}
