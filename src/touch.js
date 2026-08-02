export { initTouchControls };

// Touch zones (landscape):
//   Left half / Right half, each split horizontally at SPLIT_Y % of screen height.
//   Upper zone (U): lift gas on the opposite side, or brake when both held.
//   Lower zone (D): steer in that direction.
//
// Scheme:
//   LD held           → steer left
//   RD held           → steer right
//   Gas               → auto-on during race, UNLESS (LD&&RU) || (RD&&LU) || brake
//   LU + RU           → brake
//   any L + any R     → activate (powerup / race start / advance)

const SPLIT_Y = 0.50;

function initTouchControls(input) {
    if (!('ontouchstart' in window)) return () => {};

    const zones = { LU: false, LD: false, RU: false, RD: false };
    const touchZones = new Map();

    function getZone(x, y) {
        const left = x < window.innerWidth / 2;
        const up   = y < window.innerHeight * SPLIT_Y;
        return (left ? 'L' : 'R') + (up ? 'U' : 'D');
    }

    function recompute() {
        zones.LU = zones.LD = zones.RU = zones.RD = false;
        for (const z of touchZones.values()) zones[z] = true;
    }

    const INTERACTIVE = new Set(['BUTTON', 'INPUT', 'SELECT', 'TEXTAREA', 'A', 'LABEL']);

    window.addEventListener('touchstart', e => {
        // Only suppress synthetic clicks/context-menu when not touching a UI control.
        if (!INTERACTIVE.has(e.target.tagName)) e.preventDefault();
        for (const t of e.changedTouches)
            touchZones.set(t.identifier, getZone(t.clientX, t.clientY));
        recompute();
    }, { passive: false });

    window.addEventListener('touchmove', e => {
        e.preventDefault();
        for (const t of e.changedTouches)
            touchZones.set(t.identifier, getZone(t.clientX, t.clientY));
        recompute();
    }, { passive: false });

    window.addEventListener('touchend', e => {
        if (!INTERACTIVE.has(e.target.tagName)) e.preventDefault();
        for (const t of e.changedTouches) touchZones.delete(t.identifier);
        recompute();
    }, { passive: false });

    window.addEventListener('touchcancel', e => {
        for (const t of e.changedTouches) touchZones.delete(t.identifier);
        recompute();
    });

    // Suppress long-press context menu (copy/paste popup on hold).
    window.addEventListener('contextmenu', e => e.preventDefault());

    return function pollTouch(isRaceActive) {
        const { LU, LD, RU, RD } = zones;
        const bothDown  = LD && RD;
        const bothUp    = LU && RU;

        if (LD && !RD) input.steerLeft  = true;
        if (RD && !LD) input.steerRight = true;

        if (bothUp) input.brake = true;

        const gasOff = (LD && RU) || (RD && LU) || bothUp;
        if (!gasOff && isRaceActive) input.gas = true;

        if (bothDown) input.activate = true;
    };
}
