# Neon Rally — Control Schemes

## Mobile (Touch)

### Zone geometry (landscape)

| Column | X range | Zones |
|---|---|---|
| Left outer | 0–25% | LU, LD |
| Center | 25–75% | CU, CD |
| Right outer | 75–100% | RU, RD |

Each column split at 50% screen height: U = upper half, D = lower half.

### Gesture table

| Fingers held | Steer | Gas | Other |
|---|---|---|---|
| LD only | left | on | |
| RD only | right | on | |
| LD (primary) + RD | left | off | |
| RD (primary) + LD | right | off | |
| Primary released, secondary survives | secondary direction | off → 5-frame grace → on | |
| LU + RU | — | off | brake |
| CD (touchstart) | — | — | activate (powerup / race start); lock timer |
| CU (touchstart) | — | — | pause; lock timer |

**Primary** = whichever lower zone was touched first. Gas-off grace (5 frames) is tunable toward 0 if it proves unnecessary.

CD and CU fire once per tap (touchstart only) and are locked by a frame timer to prevent jitter.
