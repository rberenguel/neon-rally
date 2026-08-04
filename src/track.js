// track.js — procedural track generation and surface checks

export const TRACK_WIDTH = 260;
export const TRACK_HALF = TRACK_WIDTH / 2;
export const KERB_EXTRA = 50; // world-units of kerb beyond track edge
const TRACK_SAMPLES = 1000;

// Seeded PRNG (Mulberry32) — deterministic for shared track IDs
export function createRng(seed) {
    return function() {
        let t = seed += 0x6D2B79F5;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

function hashStringToSeed(str) {
    let h = 1779033703 ^ str.length;
    for (let i = 0; i < str.length; i++) {
        h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
        h = h << 15 | h >>> 17;
        h = Math.imul(h, 461845907);
    }
    h ^= h >>> 16;
    h = Math.imul(h, 2246822507);
    h ^= h >>> 13;
    h = Math.imul(h, 3266489909);
    h ^= h >>> 16;
    return h >>> 0;
}

// Convert numeric seed to short alphanumeric track ID (e.g. "X7kP9m")
export function seedToTrackId(seed) {
    const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let id = '';
    let n = seed >>> 0;
    for (let i = 0; i < 6; i++) {
        id = chars[n % chars.length] + id; // prepend so MSB is first (matches trackIdToSeed)
        n = Math.floor(n / chars.length);
    }
    return id;
}

export function trackIdToSeed(id) {
    const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let seed = 0;
    for (let i = 0; i < id.length; i++) {
        const idx = chars.indexOf(id[i]);
        if (idx < 0) return null;
        seed = seed * chars.length + idx;
    }
    return seed;
}


export function generateTrack(difficulty = 0.5, attempt = 0, seedOrId = null, sizeMultiplier = 1.0, trackSamples = 1000) {
    let seed;
    if (seedOrId === null) {
        seed = Math.floor(Math.random() * 4294967296);
    } else if (typeof seedOrId === 'string') {
        seed = trackIdToSeed(seedOrId);
        if (seed === null) seed = hashStringToSeed(seedOrId);
    } else {
        seed = seedOrId >>> 0;
    }

    const rng = createRng(seed);
    const arenaHalf = 2000 * sizeMultiplier;
    const cx = arenaHalf, cy = arenaHalf;

    // Polar harmonic approach: r(θ) = baseR + Σ amp_k * sin(k*θ + phase_k)
    // Never self-intersects. Visual complexity = number and size of harmonics.
    const baseR = 920 * sizeMultiplier;

    // Smooth: 3–4 harmonics, medium amplitude → nice and curvy
    // Technical: 5–7 harmonics, moderate amplitude → complex and curvy
    // Chaotic: 7–9 harmonics, large amplitude → wild and irregular
    let harmonics;
    if (difficulty < 0.35) {
        // Smooth: what used to be Technical — nice and curvy
        harmonics = [];
        const nH = 3 + Math.floor(rng() * 2);       // 3–4 harmonics
        const totalAmp = 380 + rng() * 170;          // total variation budget
        for (let k = 2; k <= nH + 1; k++) {
            harmonics.push({ k, amp: (totalAmp / nH) * (0.6 + rng() * 0.8), phase: rng() * Math.PI * 2 });
        }
    } else if (difficulty < 0.65) {
        // Technical: what used to be Chaotic — complex and curvy
        harmonics = [];
        const nH = 5 + Math.floor(rng() * 3);       // 5–7 harmonics
        const totalAmp = 340 + rng() * 120;
        for (let k = 2; k <= nH + 1; k++) {
            harmonics.push({ k, amp: (totalAmp / nH) * (0.6 + rng() * 0.8), phase: rng() * Math.PI * 2 });
        }
    } else {
        // Chaotic: wilder — more harmonics, larger amplitude
        harmonics = [];
        const nH = 7 + Math.floor(rng() * 3);       // 7–9 harmonics
        const totalAmp = 420 + rng() * 160;          // bigger variation budget
        for (let k = 2; k <= nH + 1; k++) {
            harmonics.push({ k, amp: (totalAmp / nH) * (0.6 + rng() * 0.8), phase: rng() * Math.PI * 2 });
        }
    }

    const minR = 380 * sizeMultiplier;
    const points = [];
    for (let i = 0; i < trackSamples; i++) {
        const theta = (i / trackSamples) * Math.PI * 2;
        let r = baseR;
        for (const h of harmonics) r += h.amp * Math.sin(h.k * theta + h.phase);
        r = Math.max(minR, r);
        points.push({ x: cx + r * Math.cos(theta), y: cy + r * Math.sin(theta) });
    }
    for (let i = 0; i < points.length; i++) points[i].t = i / points.length;

    // Spikiness = average turning angle per segment
    let spikiness = 0;
    for (let i = 0; i < points.length; i++) {
        const prev = points[(i - 1 + points.length) % points.length];
        const curr = points[i];
        const next = points[(i + 1) % points.length];
        let turn = Math.abs(Math.atan2(next.y - curr.y, next.x - curr.x) -
                            Math.atan2(curr.y - prev.y, curr.x - prev.x));
        while (turn > Math.PI) turn -= Math.PI * 2;
        spikiness += Math.abs(turn);
    }
    spikiness = spikiness / points.length;

    const racingLine = computeRacingLine(points);
    return { points, racingLine, spikiness, seed, trackId: seedToTrackId(seed) };
}

// Compute a racing line via constrained Laplacian smoothing.
// Each pass pulls points toward shorter paths (cutting inside corners, straightening S-curves).
// The constraint clamps each point to within TRACK_HALF*0.8 of its original centerline position,
// keeping the line on track without any curvature calculations.
// Pull each point toward the midpoint of neighbours `look` steps away, then clamp
// to within TRACK_HALF of the original. Large `look` shortcuts aggressively across
// corners; the clamp keeps the line on track.
export function computeRacingLine(centerline) {
    const n = centerline.length;
    const maxDist = TRACK_HALF * 0.65;
    const look = 20;
    let pts = centerline.map(p => ({ x: p.x, y: p.y }));
    // Phase 1: chord-midpoint pulls — cuts corners aggressively
    for (let pass = 0; pass < 200; pass++) {
        const next = [];
        for (let i = 0; i < n; i++) {
            const behind = pts[(i - look + n) % n];
            const ahead  = pts[(i + look) % n];
            const mx = (behind.x + ahead.x) * 0.5;
            const my = (behind.y + ahead.y) * 0.5;
            let sx = pts[i].x + (mx - pts[i].x) * 0.4;
            let sy = pts[i].y + (my - pts[i].y) * 0.4;
            const orig = centerline[i];
            const dx = sx - orig.x, dy = sy - orig.y;
            const dist = Math.hypot(dx, dy);
            if (dist > maxDist) { sx = orig.x + dx / dist * maxDist; sy = orig.y + dy / dist * maxDist; }
            next.push({ x: sx, y: sy });
        }
        pts = next;
    }
    // Phase 2: gentle Laplacian to smooth out micro-bumps from phase 1
    for (let pass = 0; pass < 30; pass++) {
        const next = [];
        for (let i = 0; i < n; i++) {
            const prev = pts[(i - 1 + n) % n], curr = pts[i], nx = pts[(i + 1) % n];
            let sx = curr.x * 0.5 + prev.x * 0.25 + nx.x * 0.25;
            let sy = curr.y * 0.5 + prev.y * 0.25 + nx.y * 0.25;
            const orig = centerline[i];
            const dx = sx - orig.x, dy = sy - orig.y;
            const dist = Math.hypot(dx, dy);
            if (dist > maxDist) { sx = orig.x + dx / dist * maxDist; sy = orig.y + dy / dist * maxDist; }
            next.push({ x: sx, y: sy });
        }
        pts = next;
    }
    return pts;
}


export function drawTrackPath(g, centerline, width, color, alpha = 1) {
    if (centerline.length === 0) return;
    g.moveTo(centerline[0].x, centerline[0].y);
    for (let i = 1; i < centerline.length; i++) g.lineTo(centerline[i].x, centerline[i].y);
    g.closePath();
    g.stroke({ width, color, alpha, join: 'round', cap: 'round' });
}

export function isOnTrack(x, y, centerline) {
    let minDist = Infinity;
    for (const p of centerline) {
        const d = Math.hypot(p.x - x, p.y - y);
        if (d < minDist) minDist = d;
    }
    return minDist <= TRACK_HALF;
}

// Returns 2 = track, 1 = kerb, 0 = off-track
export function getTrackZone(x, y, centerline) {
    let minDist = Infinity;
    for (const p of centerline) {
        const d = Math.hypot(p.x - x, p.y - y);
        if (d < minDist) minDist = d;
    }
    if (minDist <= TRACK_HALF) return 2;
    if (minDist <= TRACK_HALF + KERB_EXTRA) return 1;
    return 0;
}

// Precompute a target-speed multiplier (0..1) for every point on the centerline,
// based on local curvature. Corners bake in a lower multiplier, straights stay near 1.
// This lets an AI follow the line and just interpolate toward "whatever speed is
// tagged here" instead of measuring curvature and deciding to brake every frame.
export function computeSpeedProfile(centerline, sampleWindow = 8) {
    const n = centerline.length;
    const profile = new Float32Array(n);
    for (let i = 0; i < n; i++) {
        let curvature = 0;
        for (let k = 0; k < sampleWindow; k++) {
            const i1 = (i + k) % n;
            const i2 = (i + k + 1) % n;
            const i3 = (i + k + 2) % n;
            const a1 = Math.atan2(centerline[i2].y - centerline[i1].y, centerline[i2].x - centerline[i1].x);
            const a2 = Math.atan2(centerline[i3].y - centerline[i2].y, centerline[i3].x - centerline[i2].x);
            let diff = a2 - a1;
            while (diff > Math.PI) diff -= Math.PI * 2;
            while (diff < -Math.PI) diff += Math.PI * 2;
            curvature += Math.abs(diff);
        }
        profile[i] = Math.max(0.35, 1 / (1 + curvature * 1.4));
    }
    return profile;
}

// Brute-force closest sample. O(1000) per call — trivial for 6 cars @ 60fps.
export function getTrackProgress(x, y, centerline) {
    let bestDist = Infinity, bestIdx = 0;
    for (let i = 0; i < centerline.length; i++) {
        const d = Math.hypot(centerline[i].x - x, centerline[i].y - y);
        if (d < bestDist) { bestDist = d; bestIdx = i; }
    }
    return bestIdx / centerline.length; // 0..1
}
