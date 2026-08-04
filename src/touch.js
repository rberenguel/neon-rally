export { initTouchControls };

// Touch zones (landscape):
//   Three columns × two rows = 6 zones.
//   Left outer (0–25%):    LU, LD
//   Center    (25–75%):    CU, CD
//   Right outer (75–100%): RU, RD
//   Upper = above SPLIT_Y, Lower = below.
//
// Scheme:
//   LD only          → steer left,  gas on
//   RD only          → steer right, gas on
//   LD(primary)+RD   → steer left,  gas off
//   RD(primary)+LD   → steer right, gas off
//   primary released, secondary survives → steer secondary, gas off (GAS_GRACE frames) → on
//   LU + RU          → (reserved)
//   CD (touchstart)  → activate (powerup / race start); lock timer
//   CU (touchstart)  → pause; lock timer

const SPLIT_Y      = 0.50;
const CENTER_LEFT  = 0.25;
const CENTER_RIGHT = 0.75;
const GAS_GRACE    = 5;    // tunable toward 0
const LOCK_FRAMES  = 12;   // prevent jitter on CD / CU

function initTouchControls(input) {
    if (!('ontouchstart' in window)) return () => {};

    const zones     = { LU: false, LD: false, CU: false, CD: false, RU: false, RD: false };
    const touchZones = new Map();  // identifier → zone string

    // Lower-zone primary tracking (insertion-ordered Map keeps first-in as primary)
    const lowerFingers = new Map(); // identifier → 'L' | 'R'
    let gasOffGrace    = 0;

    // Pending one-shot actions (set in touchstart, consumed in pollTouch)
    let pendingActivate  = false;
    let pendingPause     = false;
    let pendingFuelUp    = false;
    let pendingFuelDown  = false;
    let activateLock     = 0;
    let pauseLock        = 0;
    let fuelUpLock       = 0;
    let fuelDownLock     = 0;

    function getZone(x, y) {
        const xf = x / window.innerWidth;
        const up = y < window.innerHeight * SPLIT_Y;
        const col = xf < CENTER_LEFT ? 'L' : xf > CENTER_RIGHT ? 'R' : 'C';
        return col + (up ? 'U' : 'D');
    }

    function lowerSide(zone) {
        return zone === 'LD' ? 'L' : zone === 'RD' ? 'R' : null;
    }

    function primaryLower() {
        // First insertion in lowerFingers is the primary
        const it = lowerFingers.values();
        const r  = it.next();
        return r.done ? null : r.value;
    }

    function recompute() {
        zones.LU = zones.LD = zones.CU = zones.CD = zones.RU = zones.RD = false;
        for (const z of touchZones.values()) zones[z] = true;
    }

    const INTERACTIVE = new Set(['BUTTON', 'INPUT', 'SELECT', 'TEXTAREA', 'A', 'LABEL']);

    function isInteractive(elt) {
        if (!elt || !elt.tagName) return false;
        if (INTERACTIVE.has(elt.tagName)) return true;
        return !!elt.closest?.('button, input, select, textarea, a, label');
    }

    window.addEventListener('touchstart', e => {
        if (!isInteractive(e.target)) e.preventDefault();
        for (const t of e.changedTouches) {
            const zone = getZone(t.clientX, t.clientY);
            touchZones.set(t.identifier, zone);

            const side = lowerSide(zone);
            if (side) lowerFingers.set(t.identifier, side);

            if (zone === 'CD' && activateLock === 0) {
                pendingActivate = true;
                activateLock    = LOCK_FRAMES;
            }
            if (zone === 'CU' && pauseLock === 0) {
                pendingPause = true;
                pauseLock    = LOCK_FRAMES;
            }
            if (zone === 'RU' && fuelUpLock === 0) {
                pendingFuelUp = true;
                fuelUpLock    = LOCK_FRAMES;
            }
            if (zone === 'LU' && fuelDownLock === 0) {
                pendingFuelDown = true;
                fuelDownLock    = LOCK_FRAMES;
            }
        }
        recompute();
    }, { passive: false });

    window.addEventListener('touchmove', e => {
        e.preventDefault();
        for (const t of e.changedTouches) {
            const oldZone  = touchZones.get(t.identifier);
            const newZone  = getZone(t.clientX, t.clientY);
            touchZones.set(t.identifier, newZone);

            const oldSide  = lowerSide(oldZone);
            const newSide  = lowerSide(newZone);

            if (oldSide !== newSide) {
                // Finger crossed lower-zone boundary
                if (oldSide) {
                    const wasPrimary   = [...lowerFingers.keys()][0] === t.identifier;
                    const hadSecondary = lowerFingers.size > 1;
                    lowerFingers.delete(t.identifier);
                    if (wasPrimary && hadSecondary) gasOffGrace = GAS_GRACE;
                }
                if (newSide) lowerFingers.set(t.identifier, newSide);
            } else if (newSide && lowerFingers.get(t.identifier) !== newSide) {
                // Finger slid from LD to RD (or vice-versa) — update side, keep position
                lowerFingers.set(t.identifier, newSide);
            }
        }
        recompute();
    }, { passive: false });

    function removeTouches(touches) {
        for (const t of touches) {
            const zone = touchZones.get(t.identifier);
            touchZones.delete(t.identifier);

            const side = lowerSide(zone);
            if (side) {
                const wasPrimary   = [...lowerFingers.keys()][0] === t.identifier;
                const hadSecondary = lowerFingers.size > 1;
                lowerFingers.delete(t.identifier);
                if (wasPrimary && hadSecondary) gasOffGrace = GAS_GRACE;
            }
        }
        recompute();
    }

    window.addEventListener('touchend', e => {
        if (!isInteractive(e.target)) e.preventDefault();
        removeTouches(e.changedTouches);
    }, { passive: false });

    window.addEventListener('touchcancel', e => removeTouches(e.changedTouches));

    window.addEventListener('contextmenu', e => e.preventDefault());

    function pollTouch(isRaceActive, isLive) {
        if (!isLive) {
            // Discard anything accumulated while menus/overlays were open
            pendingActivate  = false;
            pendingPause     = false;
            pendingFuelUp    = false;
            pendingFuelDown  = false;
            gasOffGrace      = 0;
            return;
        }

        const pl = primaryLower();

        if (pl === 'L') input.steerLeft  = true;
        if (pl === 'R') input.steerRight = true;

        // Gas off when two lower fingers held or in grace window
        const gasOff = (lowerFingers.size > 1) || gasOffGrace > 0;
        if (!gasOff && isRaceActive) input.gas = true;

        if (pendingActivate)  { input.activate     = true; pendingActivate  = false; }
        if (pendingPause)     { input.pause        = true; pendingPause     = false; }
        if (pendingFuelUp)    { input.fuelFlowUp   = true; pendingFuelUp    = false; }
        if (pendingFuelDown)  { input.fuelFlowDown = true; pendingFuelDown  = false; }

        if (activateLock  > 0) activateLock--;
        if (pauseLock     > 0) pauseLock--;
        if (fuelUpLock    > 0) fuelUpLock--;
        if (fuelDownLock  > 0) fuelDownLock--;
        if (gasOffGrace   > 0) gasOffGrace--;
    }

    return pollTouch;
}
