export { createPowerupLayer, spawnPowerup, clearPowerups, updatePowerups, activatePowerup, tickBoosts, resetPowerupRng };

import { Graphics } from 'pixi.js';
import { TRACK_HALF } from './track.js';

const POWERUP_SIZE     = 14;
const PICKUP_RADIUS_SQ = (POWERUP_SIZE + 14) ** 2;
const MAX_POWERUPS     = 5;
const TAPER_FRAMES     = 30;

// Seeded RNG — reset at race start so powerup placement is reproducible per track seed.
let _rng = Math.random;
function resetPowerupRng(seed) {
    let s = (seed >>> 0) ^ 0xDEADBEEF;
    _rng = () => { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; return (s >>> 0) / 4294967296; };
}

// S = sustained speed boost, T = turbo burst
const TYPES = {
    S: { color: 0x00FF88, multiplier: 1.35, accelBoost: 1.0, duration: 60 },
    T: { color: 0xFF8800, multiplier: 1.8,  accelBoost: 1.5, duration: 20 },
};

function createPowerupLayer(world) {
    const container = new Graphics();
    world.addChild(container);
    return { container, powerups: [] };
}

function _makeSprite(type) {
    const def = TYPES[type];
    const g = new Graphics();
    g.circle(0, 0, POWERUP_SIZE);
    g.fill({ color: 0x101010 });
    g.circle(0, 0, POWERUP_SIZE);
    g.stroke({ color: def.color, width: 2 });
    return g;
}

function spawnPowerup(layer, trackCenterline) {
    if (layer.powerups.length >= MAX_POWERUPS) return;

    const n = trackCenterline.length;
    const idx = Math.floor(_rng() * n);
    const pt = trackCenterline[idx];
    const next = trackCenterline[(idx + 1) % n];

    // Perpendicular to track direction, offset 40–70% toward edge so AI has to detour
    const tx = next.x - pt.x, ty = next.y - pt.y;
    const len = Math.hypot(tx, ty) || 1;
    const px = -ty / len, py = tx / len;
    const side = _rng() < 0.5 ? 1 : -1;
    const offset = TRACK_HALF * (0.4 + _rng() * 0.3) * side;

    const type = _rng() < 0.6 ? 'S' : 'T';
    const powerup = {
        x: pt.x + px * offset,
        y: pt.y + py * offset,
        type,
        sprite: _makeSprite(type),
    };
    powerup.sprite.x = powerup.x;
    powerup.sprite.y = powerup.y;
    layer.container.addChild(powerup.sprite);
    layer.powerups.push(powerup);
}

function clearPowerups(layer) {
    for (const p of layer.powerups) layer.container.removeChild(p.sprite);
    layer.powerups.length = 0;
}

function updatePowerups(layer, allCars, player) {
    for (let i = layer.powerups.length - 1; i >= 0; i--) {
        const p = layer.powerups[i];
        let collected = false;
        for (const car of allCars) {
            const distSq = (car.x - p.x) ** 2 + (car.y - p.y) ** 2;
            if (distSq < PICKUP_RADIUS_SQ) {
                if (car === player) {
                    if (!car._heldPowerup) {
                        car._heldPowerup = p.type;
                        collected = true;
                    }
                } else if (!car._speedBoost) {
                    activatePowerup(car, p.type);
                    collected = true;
                }
                if (collected) break;
            }
        }
        if (collected) {
            layer.container.removeChild(p.sprite);
            layer.powerups.splice(i, 1);
        }
    }
}

function activatePowerup(car, type) {
    type = type ?? car._heldPowerup;
    if (!type) return;
    const def = TYPES[type];
    car._baseMaxSpeed = car._baseMaxSpeed ?? car.maxSpeed;
    car._baseAccel    = car._baseAccel    ?? car.acceleration;
    car.maxSpeed      = car._baseMaxSpeed * def.multiplier;
    car.acceleration  = car._baseAccel    * def.accelBoost;
    car._speedBoost   = { duration: def.duration, multiplier: def.multiplier, accelBoost: def.accelBoost, taper: 0 };
    car._heldPowerup  = null;
}

function tickBoosts(allCars) {
    for (const car of allCars) {
        if (!car._speedBoost) continue;
        if (car._speedBoost.duration > 0) {
            car._speedBoost.duration--;
        } else {
            car._speedBoost.taper++;
            const t = car._speedBoost.taper / TAPER_FRAMES;
            if (t >= 1) {
                car.maxSpeed     = car._baseMaxSpeed;
                car.acceleration = car._baseAccel;
                car._speedBoost  = null;
            } else {
                car.maxSpeed     = car._baseMaxSpeed * (1 + (car._speedBoost.multiplier  - 1) * (1 - t));
                car.acceleration = car._baseAccel    * (1 + (car._speedBoost.accelBoost  - 1) * (1 - t));
            }
        }
    }
}
