// car.js — shared car physics for player and AI

// Fuel burn per world-unit of distance traveled (balanced mode baseline).
// Lower = longer stints. At ~15 000 world-units/lap this gives ~5 laps per tank.
const FUEL_BURN_RATE = 0.000013;

// Fraction of car weight that fuel represents at a full tank.
// 0.18 → full tank is 18% heavier than empty; acceleration ~84%, top speed ~93%, grip ~92%.
const FUEL_WEIGHT_FRACTION = 0.18;

export function createCar(x, y, rotation, color = 0x00FFFF) {
    return {
        x, y, vx: 0, vy: 0, rotation, z: 0, vz: 0,
        acceleration: 0.30,
        maxSpeed: 10,
        turnSpeed: 0.07,
        friction: 0.995,
        grip: 0.06,
        offTrackGrip: 1.0,    // multiplies grass grip: >1 = better steering recovery
        offTrackDecay: 0.965, // velocity decay on grass: closer to 1 = less speed loss
        color,
        sprite: null,
        fuel: 1.0,
        fuelFlow: 0,  // -1 conserve · 0 balanced · 1 push
    };
}

export function updateCarPhysics(car, dt, steer, gas, isOnTrackFn, arena) {
    const speed = Math.hypot(car.vx, car.vy);
    const speedFactor = Math.min(speed / car.maxSpeed, 1);
    const zone = isOnTrackFn(car.x, car.y); // 2=track, 1=kerb, 0=off (bool true/2 both truthy)
    const onTrack = zone >= 2;
    const onKerb  = zone === 1;

    // Steering — scale with speed so stationary car doesn't spin
    if (steer !== 0 && speed > 0.1) {
        car.rotation += steer * car.turnSpeed * speedFactor * dt;
    }

    // Forward vector
    const forwardX = Math.cos(car.rotation - Math.PI / 2);
    const forwardY = Math.sin(car.rotation - Math.PI / 2);

    // Fuel-flow multipliers and weight
    const fuelFlow    = car.isPlayer ? (car.fuelFlow ?? 0) : 0;
    const accelMult   = fuelFlow === 1 ? 1.175 : fuelFlow === -1 ? 0.85 : 1.0;
    const burnMult    = fuelFlow === 1 ? 1.4   : fuelFlow === -1 ? 0.70 : 1.0;
    const fuelDepleted = car.isPlayer && car.fuel <= 0;

    // Weight from fuel load; AI fuel is fixed at creation, player fuel burns down
    const fuelLoad   = car.fuel ?? 0;
    const weightRatio = 1 + fuelLoad * FUEL_WEIGHT_FRACTION; // 1.0 (empty) → 1.18 (full)
    const invWeight  = 1 / weightRatio;

    // Acceleration
    if (car._logAccel) {
        console.log(`[ACCEL] ${car.isPlayer ? 'PLAYER' : 'AI'} fuel=${fuelLoad.toFixed(2)} invWeight=${invWeight.toFixed(3)} factor=${Math.pow(invWeight,0.4).toFixed(3)} baseAccel=${(car.acceleration * accelMult * Math.pow(invWeight,0.4)).toFixed(4)} maxSpeed=${car.maxSpeed.toFixed(2)}`);
        car._logAccel = false;
    }
    if (gas && !fuelDepleted) {
        let accel = car.acceleration * accelMult * Math.pow(invWeight, 0.4);
        // Player only: quadratic taper — the last ~1.0 speed is a crawl
        if (car.isPlayer) {
            const headroom = car.maxSpeed - speed;
            const taper = headroom < 1.0 ? Math.max(0.05, headroom) : 1.0;
            accel *= taper;
        }
        // Launch stiction: sluggish only from true standstill
        const launch = speed < 0.3 ? 0.4 : 1.0;

        if (car._physicsLogFrame !== undefined && car._physicsLogFrame < 20) {
            const vx1 = car.vx + forwardX * accel * launch * dt;
            const vy1 = car.vy + forwardY * accel * launch * dt;
            const spd1 = Math.hypot(vx1, vy1);
            console.log(`[PHYSICS] ${car.isPlayer ? 'PLAYER' : 'AI'} f=${car._physicsLogFrame} dt=${dt.toFixed(2)} zone=${zone} spd0=${speed.toFixed(3)} accel=${accel.toFixed(4)} launch=${launch.toFixed(1)} vx0=${car.vx.toFixed(4)} vy0=${car.vy.toFixed(4)} vx1=${vx1.toFixed(4)} vy1=${vy1.toFixed(4)} spd1=${spd1.toFixed(3)}`);
            car._physicsLogFrame++;
        }

        car.vx += forwardX * accel * launch * dt;
        car.vy += forwardY * accel * launch * dt;

        // Distance-based fuel burn
        if (car.isPlayer && car.fuel !== undefined) {
            car.fuel = Math.max(0, car.fuel - FUEL_BURN_RATE * burnMult * speed * dt);
        }
    } else if (car._physicsLogFrame !== undefined && car._physicsLogFrame < 20) {
        console.log(`[PHYSICS] ${car.isPlayer ? 'PLAYER' : 'AI'} f=${car._physicsLogFrame} dt=${dt.toFixed(2)} zone=${zone} spd0=${speed.toFixed(3)} NO_GAS fuelDepleted=${fuelDepleted}`);
        car._physicsLogFrame++;
    }
    // Slide Assist (momentum redirection)
    if (speed > 0.1) {
        const idealVx = forwardX * speed;
        const idealVy = forwardY * speed;
        let surfaceGrip = car.grip * Math.max(0.15, 1 - speedFactor * 0.85);
        if (onKerb)        surfaceGrip *= 0.88;
        else if (!onTrack) surfaceGrip *= 0.75 * car.offTrackGrip;
        // Hard steering at speed = understeer/drift — player only, AI can't adapt to this
        if (car.isPlayer) {
            surfaceGrip *= Math.sqrt(invWeight); // heavier = more lateral inertia = more slide
            const steerFactor = Math.max(0.2, 1 - Math.abs(steer) * speedFactor);
            surfaceGrip *= steerFactor;
        }
        car.vx += (idealVx - car.vx) * surfaceGrip * dt;
        car.vy += (idealVy - car.vy) * surfaceGrip * dt;
    }

    // Friction — track vs kerb vs off-track
    const surfaceFriction = onTrack ? car.friction : onKerb ? 0.982 : 0.96;
    car.vx *= Math.pow(surfaceFriction, dt);
    car.vy *= Math.pow(surfaceFriction, dt);
    if (!onTrack && !onKerb) {
        car.vx *= car.offTrackDecay;
        car.vy *= car.offTrackDecay;
    }

    // Speed cap — weight only affects acceleration feel, not the ceiling
    const effectiveMax = car.maxSpeed + (car._draftBoost || 0);
    if (speed > effectiveMax) {
        const ratio = effectiveMax / speed;
        car.vx *= ratio;
        car.vy *= ratio;
    }

    // Position update
    car.x += car.vx * dt;
    car.y += car.vy * dt;

    // Arena clamp
    const margin = 12;
    if (car.x < arena.x + margin) { car.x = arena.x + margin; car.vx = Math.abs(car.vx) * 0.3; }
    if (car.x > arena.x + arena.width - margin) { car.x = arena.x + arena.width - margin; car.vx = -Math.abs(car.vx) * 0.3; }
    if (car.y < arena.y + margin) { car.y = arena.y + margin; car.vy = Math.abs(car.vy) * 0.3; }
    if (car.y > arena.y + arena.height - margin) { car.y = arena.y + arena.height - margin; car.vy = -Math.abs(car.vy) * 0.3; }

    // Z physics
    car.vz -= 0.5 * dt;
    car.z += car.vz * dt;
    if (car.z < 0) { car.z = 0; car.vz = 0; }

    // Slip metrics for renderer
    const dot = car.vx * forwardX + car.vy * forwardY;
    const cross = car.vx * forwardY - car.vy * forwardX;
    const slip = Math.abs(Math.atan2(cross, dot));
    const turnSign = Math.sign(cross);
    const movingForward = dot > 0;

    return { speed, speedFactor, onTrack: zone > 0, forwardX, forwardY, dot, cross, slip, turnSign, movingForward, steerInput: steer };
}
