// car.js — shared car physics for player and AI

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
    };
}

export function updateCarPhysics(car, dt, steer, gas, brake, isOnTrackFn, arena) {
    const speed = Math.hypot(car.vx, car.vy);
    const speedFactor = Math.min(speed / car.maxSpeed, 1);
    const onTrack = isOnTrackFn(car.x, car.y);

    // Steering — scale with speed so stationary car doesn't spin
    if (steer !== 0 && speed > 0.1) {
        car.rotation += steer * car.turnSpeed * speedFactor * dt;
    }

    // Forward vector
    const forwardX = Math.cos(car.rotation - Math.PI / 2);
    const forwardY = Math.sin(car.rotation - Math.PI / 2);

    // Acceleration
    if (gas) {
        let accel = car.acceleration;
        // Player only: quadratic taper — the last ~1.0 speed is a crawl
        if (car.isPlayer) {
            const headroom = car.maxSpeed - speed;
            const taper = headroom < 1.0 ? Math.max(0.08, headroom * headroom) : 1.0;
            accel *= taper;
        }
        // Launch stiction: sluggish only from true standstill
        const launch = speed < 0.3 ? 0.4 : 1.0;
        car.vx += forwardX * accel * launch * dt;
        car.vy += forwardY * accel * launch * dt;
    }
    // Brake only when moving forward — prevents backward creep at standstill
    const fwdDot = car.vx * forwardX + car.vy * forwardY;
    if (brake && fwdDot > 0) {
        car.vx -= forwardX * (car.acceleration * 0.5) * dt;
        car.vy -= forwardY * (car.acceleration * 0.5) * dt;
    }

    // Slide Assist (momentum redirection)
    if (speed > 0.1) {
        const idealVx = forwardX * speed;
        const idealVy = forwardY * speed;
        let surfaceGrip = car.grip * Math.max(0.15, 1 - speedFactor * 0.85);
        if (!onTrack) surfaceGrip *= 0.75 * car.offTrackGrip;
        // Hard steering at speed = understeer/drift — player only, AI can't adapt to this
        if (car.isPlayer) {
            const steerFactor = Math.max(0.2, 1 - Math.abs(steer) * speedFactor);
            surfaceGrip *= steerFactor;
        }
        car.vx += (idealVx - car.vx) * surfaceGrip * dt;
        car.vy += (idealVy - car.vy) * surfaceGrip * dt;
    }

    // Friction — track vs off-track
    const surfaceFriction = onTrack ? car.friction : 0.96;
    car.vx *= Math.pow(surfaceFriction, dt);
    car.vy *= Math.pow(surfaceFriction, dt);
    if (!onTrack) {
        car.vx *= car.offTrackDecay;
        car.vy *= car.offTrackDecay;
    }

    // Speed cap (draft boost raises effective ceiling)
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

    return { speed, speedFactor, onTrack, forwardX, forwardY, dot, cross, slip, turnSign, movingForward, steerInput: steer };
}
