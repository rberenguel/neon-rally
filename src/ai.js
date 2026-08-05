// ai.js — opponents, collision detection

import { createCar, updateCarPhysics } from './car.js';
import { S } from './state.js';

// Baselines — AI stats are interpolated toward these by aiGapFactor (easier = closer to baseline).
const AI_SPEED_BASELINE = 9.0;
const AI_GRIP_BASELINE  = 0.025;

export function createWaypointAI(trackCenterline, color) {
    const pt = trackCenterline[0];
    const next = trackCenterline[1];
    const tangent = Math.atan2(next.y - pt.y, next.x - pt.x);
    const ai = createCar(pt.x, pt.y, tangent + Math.PI / 2, color);
    ai.aiType = 'waypoint';
    const gf = S.aiGapFactor ?? 1.0;
    const rawMaxSpeed = 9.2 + Math.random() * 0.8;
    ai.maxSpeed = AI_SPEED_BASELINE + (rawMaxSpeed - AI_SPEED_BASELINE) * gf;
    ai.acceleration = 0.14;
    ai.fuel = S.mode?.hasFuel ? 0.8 : 0;
    ai.turnSpeed = 0.07;
    ai.offTrackGrip = 2.0;
    ai.offTrackDecay = 0.99;
    const rawGrip = 0.03 + Math.random() * 0.02;
    ai.grip = AI_GRIP_BASELINE + (rawGrip - AI_GRIP_BASELINE) * gf;
    ai._steerInertia = 0;
    ai._lookAhead = 25 + Math.floor(Math.random() * 25); // 25–50 track points ahead
    ai._lineOffset = (Math.random() - 0.5) * 50;        // -25 to +25: inside ↔ outside line
    ai._brakeAngle = Math.PI / 2 + (Math.random() - 0.5) * 0.35; // 80°–100° brake threshold
    ai._riskFactor = 0.2 + Math.random() * 0.8;         // 0.2 = cautious, 1.0 = aggressive
    ai._trackMemory = new Float32Array(S.trackSamples);  // per-point caution: 0 = fearless, 1 = terrified
    ai._lastTrackIdx = 0;
    ai._smoothLook = ai._lookAhead;                    // smoothed lookahead, prevents jitter
    ai._recovering = false;                            // true while running the locked-target off-track recovery
    ai._recoveryTargetIdx = 0;
    return ai;
}

export function updateWaypointAI(ai, dt, trackCenterline) {
    const speed = Math.hypot(ai.vx, ai.vy);

    // Find nearest point on track (pure distance — the old correct way)
    let start = ai._lastTrackIdx || 0;
    let nearestIdx = start, nearestDist = Infinity;
    const win = 60;
    for (let i = -win; i <= win; i++) {
        const idx = (start + i + trackCenterline.length) % trackCenterline.length;
        const d = Math.hypot(trackCenterline[idx].x - ai.x, trackCenterline[idx].y - ai.y);
        if (d < nearestDist) { nearestDist = d; nearestIdx = idx; }
    }
    ai._lastTrackIdx = nearestIdx;

    // Off-track: don't use nearest point as base — pick a rejoin point ahead on the track.
    // Crucially, pick it ONCE and lock onto it. Re-deriving "nearest point" or "best rejoin
    // angle" every frame from the car's own erratic off-track position is what caused the
    // slalom loop: the target flips sides as the car overshoots, so the correction itself
    // becomes unstable. A dumb, stable recovery target beats a smart, twitchy one.
    const offTrack = nearestDist > 120; // generous threshold
    if (offTrack) {
        if (!ai._recovering) {
            const forwardX = Math.cos(ai.rotation - Math.PI / 2);
            const forwardY = Math.sin(ai.rotation - Math.PI / 2);
            // Scan ahead from nearest point for a shallow rejoin angle — computed once
            let bestIdx = nearestIdx, bestDot = -Infinity;
            for (let i = 8; i <= 70; i++) {
                const idx = (nearestIdx + i) % trackCenterline.length;
                const dx = trackCenterline[idx].x - ai.x;
                const dy = trackCenterline[idx].y - ai.y;
                const dot = dx * forwardX + dy * forwardY;
                if (dot > bestDot) { bestDot = dot; bestIdx = idx; }
            }
            ai._recovering = true;
            ai._recoveryTargetIdx = bestIdx;
        }
        nearestIdx = ai._recoveryTargetIdx;
    } else if (ai._recovering) {
        // Stay locked onto the recovery target until heading is actually realigned with the
        // track direction there — don't hand back to live curvature reasoning mid-correction.
        const tIdx = ai._recoveryTargetIdx;
        const aheadIdx = (tIdx + 5) % trackCenterline.length;
        const tangentAngle = Math.atan2(
            trackCenterline[aheadIdx].y - trackCenterline[tIdx].y,
            trackCenterline[aheadIdx].x - trackCenterline[tIdx].x
        );
        let headingDiff = (ai.rotation - Math.PI / 2) - tangentAngle;
        while (headingDiff > Math.PI) headingDiff -= Math.PI * 2;
        while (headingDiff < -Math.PI) headingDiff += Math.PI * 2;
        if (Math.abs(headingDiff) < 0.6) {
            ai._recovering = false;
        } else {
            nearestIdx = ai._recoveryTargetIdx;
        }
    }

    // Speed-dependent base lookahead
    const baseLook = Math.max(ai._lookAhead, Math.floor(speed * 2.5));

    // Measure curvature of upcoming path
    let curvature = 0;
    const sampleWindow = Math.min(baseLook, 35);
    for (let i = 0; i < sampleWindow; i++) {
        const i1 = (nearestIdx + i) % trackCenterline.length;
        const i2 = (nearestIdx + i + 1) % trackCenterline.length;
        const i3 = (nearestIdx + i + 2) % trackCenterline.length;
        const a1 = Math.atan2(trackCenterline[i2].y - trackCenterline[i1].y, trackCenterline[i2].x - trackCenterline[i1].x);
        const a2 = Math.atan2(trackCenterline[i3].y - trackCenterline[i2].y, trackCenterline[i3].x - trackCenterline[i2].x);
        let diff = a2 - a1;
        while (diff > Math.PI) diff -= Math.PI * 2;
        while (diff < -Math.PI) diff += Math.PI * 2;
        curvature += Math.abs(diff);
    }

    // Shrink lookahead on sharp curves
    const curveFactor = 1 / (1 + curvature * 1.2);
    const physicsLook = Math.max(8, Math.floor(baseLook * curveFactor));

    // Read learned caution over upcoming path
    let upcomingCaution = 0;
    for (let i = 0; i < Math.min(physicsLook, 50); i++) {
        upcomingCaution = Math.max(upcomingCaution, ai._trackMemory[(nearestIdx + i) % ai._trackMemory.length]);
    }

    // Caution = shorter lookahead + earlier braking; risk = later braking + longer look
    const cautionClamp = Math.min(upcomingCaution, 1.0);
    const rawLook = Math.max(8, Math.floor(physicsLook * (1 - cautionClamp * 0.25) * (0.7 + ai._riskFactor * 0.3)));
    ai._smoothLook += (rawLook - ai._smoothLook) * 0.15; // smooth over ~7 frames
    const effectiveLook = Math.floor(ai._smoothLook);
    const cautiousBrake = ai._brakeAngle * (1 - cautionClamp * 0.3 * ai._riskFactor);
    if (cautionClamp > 0.05 && Math.random() < 0.02) {
        console.log(`[USE] ${ai.def?.name || 'AI'} caution=${cautionClamp.toFixed(2)} look=${effectiveLook} brake=${cautiousBrake.toFixed(2)}`);
    }

    // Single target point on the track ahead
    const targetIdx = (nearestIdx + effectiveLook) % trackCenterline.length;
    const target = trackCenterline[targetIdx];

    // Perpendicular offset for racing line — only on straights/mild curves
    const isMild = curvature < Math.PI / 4;
    const lineOffset = isMild ? ai._lineOffset : 0;
    const prevIdx = (targetIdx - 1 + trackCenterline.length) % trackCenterline.length;
    const nextIdx = (targetIdx + 1) % trackCenterline.length;
    const tdx = trackCenterline[nextIdx].x - trackCenterline[prevIdx].x;
    const tdy = trackCenterline[nextIdx].y - trackCenterline[prevIdx].y;
    const tlen = Math.hypot(tdx, tdy) || 1;
    const nx = -tdy / tlen;
    const ny =  tdx / tlen;
    const ox = target.x + nx * lineOffset;
    const oy = target.y + ny * lineOffset;

    const dx = ox - ai.x;
    const dy = oy - ai.y;
    const dist = Math.hypot(dx, dy);

    const desiredAngle = Math.atan2(dy, dx);
    const forwardAngle = ai.rotation - Math.PI / 2;
    let angleDiff = desiredAngle - forwardAngle;
    while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
    while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;

    const idealSteer = Math.abs(angleDiff) < 0.08 ? 0 : (angleDiff > 0 ? 1 : -1);
    ai._steerInertia += (idealSteer - ai._steerInertia) * 0.10;
    const steer = ai._steerInertia;

    // Stuck/backwards recovery
    const backward = Math.abs(angleDiff) > Math.PI * 0.7;
    const stuck = speed < 1.5 && backward;

    // Curvature-based speed limit — riskier cars carry more speed into corners
    const safeSpeed = ai.maxSpeed / (1 + curvature * 0.6 * (1.4 - ai._riskFactor));
    const tooFast = speed > safeSpeed + 1.0 && curvature > 0.3;

    // Pre-braking only when moving fast enough to need it
    const sharpCurve = curvature > Math.PI / 3 && speed > 3;
    const gas = (!backward && Math.abs(angleDiff) < Math.PI / 3 && dist > 25 && !sharpCurve && !tooFast) || stuck;

    return { steer, gas, nearestIdx };
}

// Records one off-track episode into an AI's caution memory. Shared by the live race
// loop and by pretrainAI() below, so warm-started memory behaves identically to memory
// learned during an actual race.
export function recordOffTrackEpisode(ai, centerIdx, duration, verbose = true) {
    const mem = ai._trackMemory;
    if (!mem) return;
    const boost = Math.min(1.0, duration * 0.015); // ~67 frames off = full caution
    const n = mem.length;
    const lo = Math.max(0, centerIdx - 6), hi = Math.min(n, centerIdx + 7);
    const oldMax = Math.max(...mem.slice(lo, hi));
    for (let i = -6; i <= 6; i++) {
        const idx = (centerIdx + i + n) % n;
        const falloff = 1 - Math.abs(i) / 7;
        mem[idx] = Math.min(1.0, mem[idx] + boost * falloff);
    }
    if (verbose) {
        const newMax = Math.max(...mem.slice(lo, hi));
        console.log(`[LEARN] ${ai.def?.name || 'AI'} idx=${centerIdx} off-track ${duration}f: caution ${oldMax.toFixed(2)} -> ${newMax.toFixed(2)}`);
    }
}

// --- SPLINE AI ---
// A deliberately dumb, old-school line-follower: no live curvature reasoning, no
// off-track recovery logic, no learning. It just chases a point on the centerline
// and interpolates toward the speed baked into the track's precomputed speed profile
// at that point. Can't oscillate because its target is never derived from its own
// (possibly erratic) position — it's always a fixed offset ahead on the known line.
export function createSplineAI(trackCenterline, color, speedProfile, isAce = false, rng = Math.random) {
    const pt = trackCenterline[0];
    const next = trackCenterline[1];
    const tangent = Math.atan2(next.y - pt.y, next.x - pt.x);
    const ai = createCar(pt.x, pt.y, tangent + Math.PI / 2, color);
    ai.aiType = 'spline';
    const gf = S.aiGapFactor ?? 1.0;
    const rawMaxSpeed = 9.2 + rng() * 0.8;
    ai.maxSpeed = AI_SPEED_BASELINE + (rawMaxSpeed - AI_SPEED_BASELINE) * gf;
    ai.acceleration = 0.14;
    ai.fuel = S.mode?.hasFuel ? 0.8 : 0;
    ai.turnSpeed = 0.07;
    ai.offTrackGrip = 2.0;
    ai.offTrackDecay = 0.99;
    if (isAce) {
        ai.grip = AI_GRIP_BASELINE + (0.045 - AI_GRIP_BASELINE) * gf;
        ai._steerSmooth = 0.12;
        ai._lookAhead = 40;
        ai._speedTolerance = 0.3;
    } else {
        const rawGrip = 0.035 + rng() * 0.015;
        ai.grip = AI_GRIP_BASELINE + (rawGrip - AI_GRIP_BASELINE) * gf;
        ai._steerSmooth = 0.08 + rng() * 0.08; // 0.08–0.16
        ai._lookAhead = 28 + Math.floor(rng() * 20); // 28–47
        ai._speedTolerance = 0.1 + rng() * 0.7; // 0.1–0.8
    }
    ai._steerInertia = 0;
    ai._speedProfile = speedProfile;
    ai._lastTrackIdx = 0;
    ai._isAce = isAce;
    return ai;
}

// Re-roll random params for a non-ace spline AI when track changes.
export function rerollSplineParams(ai, rng) {
    if (ai._isAce || ai.aiType !== 'spline') return;
    if (ai._clonePlayer) {
        ai.maxSpeed = 9.2;
        ai.acceleration = 0.14;
        ai.fuel = S.mode?.hasFuel ? 0.8 : 0;
        ai.grip = 0.025;
        ai.offTrackGrip = 1.0;
        ai.offTrackDecay = 0.965;
        ai._steerSmooth = 0.06;
        ai._lookAhead = 20;
        ai._speedTolerance = 0.1;
        return;
    }
    const gf = S.aiGapFactor ?? 1.0;
    const rawMaxSpeed = 9.2 + rng() * 0.8;
    ai.maxSpeed = AI_SPEED_BASELINE + (rawMaxSpeed - AI_SPEED_BASELINE) * gf;
    ai.fuel = S.mode?.hasFuel ? 0.8 : 0;
    const rawGrip = 0.035 + rng() * 0.015;
    ai.grip = AI_GRIP_BASELINE + (rawGrip - AI_GRIP_BASELINE) * gf;
    ai._steerSmooth = 0.08 + rng() * 0.08;
    ai._lookAhead = 28 + Math.floor(rng() * 20);
    ai._speedTolerance = 0.1 + rng() * 0.7;
}

export function updateSplineAI(ai, dt, trackCenterline) {
    const speed = Math.hypot(ai.vx, ai.vy);

    // Same stable windowed nearest-point search as the waypoint AI — cheap and
    // reliable since the spline AI rarely strays far enough for it to matter.
    let start = ai._lastTrackIdx || 0;
    let nearestIdx = start, nearestDist = Infinity;
    const win = 60;
    for (let i = -win; i <= win; i++) {
        const idx = (start + i + trackCenterline.length) % trackCenterline.length;
        const d = Math.hypot(trackCenterline[idx].x - ai.x, trackCenterline[idx].y - ai.y);
        if (d < nearestDist) { nearestDist = d; nearestIdx = idx; }
    }
    ai._lastTrackIdx = nearestIdx;

    const targetIdx = (nearestIdx + ai._lookAhead) % trackCenterline.length;
    const target = trackCenterline[targetIdx];
    const dx = target.x - ai.x;
    const dy = target.y - ai.y;

    const desiredAngle = Math.atan2(dy, dx);
    const forwardAngle = ai.rotation - Math.PI / 2;
    let angleDiff = desiredAngle - forwardAngle;
    while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
    while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;

    const idealSteer = Math.abs(angleDiff) < 0.08 ? 0 : (angleDiff > 0 ? 1 : -1);
    const steerSmooth = ai._steerSmooth ?? 0.12;
    ai._steerInertia += (idealSteer - ai._steerInertia) * steerSmooth;
    const steer = ai._steerInertia;

    // Minimum speed profile over the next _lookAhead points — brakes for upcoming corners, not ones it's already in.
    let minProfile = 1;
    if (ai._speedProfile) {
        const n = trackCenterline.length;
        for (let k = 0; k <= ai._lookAhead; k++) {
            const v = ai._speedProfile[(nearestIdx + k) % n];
            if (v < minProfile) minProfile = v;
        }
    }
    const targetSpeed = ai.maxSpeed * minProfile;

    const tol = ai._speedTolerance ?? 0.3;
    const gas = speed < targetSpeed - tol;

    return { steer, gas, nearestIdx };
}

// --- PRETRAINING ---
// Runs a waypoint AI through a headless simulation against the current track before the
// race starts, so its caution memory is already warmed up on lap 1 instead of needing a
// lap or two of live mistakes to learn the same corners. Physics-only, no rendering.
//
// Stops after `targetLaps` virtual laps rather than a fixed frame count: lap length varies
// a lot with track difficulty (radius ranges roughly 250–2000), so a fixed frame budget
// would under-train on big tracks and over-train on small ones. `maxSteps` is just a safety
// net in case something pathological prevents the lap-wrap ever being detected.
export function pretrainAI(ai, trackCenterline, isOnTrackFn, arena, targetLaps = 4, maxSteps = 30000) {
    if (ai.aiType !== 'waypoint' || !ai._trackMemory) return;

    const startPt = trackCenterline[0];
    ai.x = startPt.x; ai.y = startPt.y; ai.vx = 0; ai.vy = 0;
    ai._steerInertia = 0; ai._recovering = false; ai._lastTrackIdx = 0; ai._smoothLook = ai._lookAhead;

    const dt = 1; // matches ticker.deltaTime at a normal 60fps frame
    let offSince = 0, offStartIdx = 0;
    let lapsCompleted = 0, prevIdx = 0;
    for (let frame = 1; frame <= maxSteps && lapsCompleted < targetLaps; frame++) {
        const input = updateWaypointAI(ai, dt, trackCenterline);
        const state = updateCarPhysics(ai, dt, input.steer, input.gas, isOnTrackFn, arena);

        // Same wrap-detection convention as the live lap counter in app.js.
        if (prevIdx > 800 && input.nearestIdx < 200) lapsCompleted++;
        prevIdx = input.nearestIdx;

        if (!state.onTrack) {
            if (!offSince) { offSince = frame; offStartIdx = input.nearestIdx || 0; }
        } else if (offSince) {
            recordOffTrackEpisode(ai, offStartIdx, frame - offSince, false);
            offSince = 0;
        }
    }
    // No per-frame decay here (unlike the live race loop): pretraining compresses several
    // clean virtual laps into an instant, and applying the live decay rate across that many
    // simulated steps would erase almost everything just learned before the race even starts.

    // Reset transient physical state — keep only the learned memory.
    ai.x = startPt.x; ai.y = startPt.y; ai.vx = 0; ai.vy = 0;
    ai._steerInertia = 0; ai._recovering = false; ai._lastTrackIdx = 0; ai._smoothLook = ai._lookAhead;
}

const DRAFT_RANGE = 140;
const DRAFT_MIN = 10;
const DRAFT_BONUS = 1.5;

export function computeDraftBoost(car, allCars) {
    const forwardX = Math.cos(car.rotation - Math.PI / 2);
    const forwardY = Math.sin(car.rotation - Math.PI / 2);

    for (const other of allCars) {
        if (other === car) continue;
        const dx = other.x - car.x;
        const dy = other.y - car.y;
        const dist = Math.hypot(dx, dy);
        if (dist < DRAFT_MIN || dist > DRAFT_RANGE) continue;

        // Other must be in front of car
        const dot = dx * forwardX + dy * forwardY;
        if (dot <= 0) continue;

        // Must be roughly straight ahead, not far to the side
        const cross = dx * forwardY - dy * forwardX;
        if (Math.abs(cross) > 25) continue;

        // Both heading roughly same direction
        let hDiff = other.rotation - car.rotation;
        while (hDiff > Math.PI) hDiff -= Math.PI * 2;
        while (hDiff < -Math.PI) hDiff += Math.PI * 2;
        if (Math.abs(hDiff) > Math.PI / 3) continue;

        // Slipstream only generated by a fast lead car
        const otherSpeed = Math.hypot(other.vx, other.vy);
        if (otherSpeed < 8) continue;

        car._draftSourceX = other.x;
        car._draftSourceY = other.y;
        return DRAFT_BONUS;
    }
    car._draftSourceX = null;
    return 0;
}

// OBB collision dimensions — physics position (car.x,y) is the sprite's local origin,
// which sits roughly at the cockpit / center of mass. The body extends ~15 units forward
// and ~18 units back from that point, and ~11 units to each side.
const COL_HALF_W = 11;
const COL_HALF_L = 17;

function _getOBB(car) {
    const fx = Math.cos(car.rotation - Math.PI / 2);
    const fy = Math.sin(car.rotation - Math.PI / 2);
    const rx = Math.cos(car.rotation);
    const ry = Math.sin(car.rotation);
    return { cx: car.x, cy: car.y, fx, fy, rx, ry };
}

function _obbOverlap(a, b, nx, ny, out) {
    const dx = b.cx - a.cx;
    const dy = b.cy - a.cy;
    const d = Math.abs(dx * nx + dy * ny);
    const ra = COL_HALF_L * Math.abs(a.fx * nx + a.fy * ny) + COL_HALF_W * Math.abs(a.rx * nx + a.ry * ny);
    const rb = COL_HALF_L * Math.abs(b.fx * nx + b.fy * ny) + COL_HALF_W * Math.abs(b.rx * nx + b.ry * ny);
    const overlap = ra + rb - d;
    if (overlap <= 0) return false;
    if (overlap < out.minOverlap) {
        out.minOverlap = overlap;
        const proj = dx * nx + dy * ny;
        out.nx = proj >= 0 ? nx : -nx;
        out.ny = proj >= 0 ? ny : -ny;
    }
    return true;
}

export function resolveCollisions(cars) {
    for (let i = 0; i < cars.length; i++) {
        for (let j = i + 1; j < cars.length; j++) {
            const a = cars[i], b = cars[j];
            const obbA = _getOBB(a);
            const obbB = _getOBB(b);

            let best = { minOverlap: Infinity, nx: 0, ny: 0 };
            if (!_obbOverlap(obbA, obbB, obbA.fx, obbA.fy, best)) continue;
            if (!_obbOverlap(obbA, obbB, obbA.rx, obbA.ry, best)) continue;
            if (!_obbOverlap(obbA, obbB, obbB.fx, obbB.fy, best)) continue;
            if (!_obbOverlap(obbA, obbB, obbB.rx, obbB.ry, best)) continue;

            const nlen = Math.hypot(best.nx, best.ny);
            if (nlen < 0.001) continue;
            const nx = best.nx / nlen;
            const ny = best.ny / nlen;

            const push = best.minOverlap * 0.5;
            a.x -= nx * push;
            a.y -= ny * push;
            b.x += nx * push;
            b.y += ny * push;

            const dvx = a.vx - b.vx;
            const dvy = a.vy - b.vy;
            const dot = dvx * nx + dvy * ny;
            if (dot > 0) {
                a.vx -= dot * nx;
                a.vy -= dot * ny;
                b.vx += dot * nx;
                b.vy += dot * ny;
            }
        }
    }
}
