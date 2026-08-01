import { Application, Container, Graphics } from 'pixi.js';
import { createCarSprite } from './renderer.js';

export function showSplash() {
    return new Promise(resolve => {
        let dismissed = false;

        async function run() {
            const splashApp = new Application();
            await splashApp.init({ resizeTo: window, backgroundColor: 0x050510, antialias: true });
            splashApp.canvas.style.cssText = 'position:absolute;top:0;left:0;z-index:100';
            document.body.appendChild(splashApp.canvas);

            // World container, centered
            const world = new Container();
            splashApp.stage.addChild(world);
            function centerWorld() {
                world.x = splashApp.screen.width  / 2;
                world.y = splashApp.screen.height / 2;
            }
            centerWorld();
            splashApp.renderer.on('resize', centerWorld);

            // Subtle neon grid
            const grid = new Graphics();
            const GRID = 90;
            for (let gx = -1000; gx <= 1000; gx += GRID) {
                grid.moveTo(gx, -700).lineTo(gx, 700);
            }
            for (let gy = -700; gy <= 700; gy += GRID) {
                grid.moveTo(-1000, gy).lineTo(1000, gy);
            }
            grid.stroke({ color: 0x0022AA, width: 0.8, alpha: 0.25 });
            world.addChild(grid);

            // Particle layer — added before cars so they render underneath
            const pGfx = new Graphics();
            world.addChild(pGfx);

            // Car — pointing SE (lower-right)
            // CAR_ANGLE = 3π/4 → forward vector = (cos(π/4), sin(π/4)) = SE
            const CAR_ANGLE = Math.PI * 0.75;
            const fwdX = Math.cos(CAR_ANGLE - Math.PI / 2);
            const fwdY = Math.sin(CAR_ANGLE - Math.PI / 2);
            const perpX = -fwdY;
            const perpY =  fwdX;

            const sprite = createCarSprite(0x00FFFF, true);
            sprite.rotation = CAR_ANGLE;
            world.addChild(sprite);

            // Second AI car — slightly behind and to the left, magenta
            const sprite2 = createCarSprite(0xFF00FF, false);
            sprite2.rotation = CAR_ANGLE - 0.08;
            sprite2.position.set(-fwdX * 38 + perpX * 22, -fwdY * 38 + perpY * 22);
            sprite2.scale.set(0.88);
            world.addChild(sprite2);

            // HTML title overlay
            const fontStyle = document.createElement('style');
            fontStyle.textContent = `
                @font-face {
                    font-family: "Sixtyfour";
                    font-style: normal;
                    font-weight: 400;
                    src: url(fonts/SixtyFour.woff2) format("woff2");
                    unicode-range: U+0000-00FF, U+2000-206F, U+FEFF, U+FFFD;
                }
            `;
            document.head.appendChild(fontStyle);

            const title = document.createElement('div');
            title.style.cssText = `
                position:absolute;top:50%;left:50%;
                transform:translate(-50%,-270%);
                color:#00FFFF;font-family:'Sixtyfour',monospace;
                font-size:clamp(32px,8vw,80px);font-weight:400;
                letter-spacing:.08em;
                text-shadow:0 0 18px #00FFFF,0 0 40px #00FFFF88;
                pointer-events:none;z-index:102;
                text-align:center;white-space:nowrap;
            `;
            title.textContent = 'NEON RALLY';
            document.body.appendChild(title);

            // Particles (world-space, drawn by PixiJS below the cars)
            const particles = [];
            const PIXI_COLORS = [0xFFFFFF, 0x00FFFF, 0xFF00FF, 0xFF7800];

            function emitAt(wx, wy) {
                const angle = Math.atan2(fwdY, fwdX) + Math.PI + (Math.random() - 0.5) * 1.3;
                const spd = 0.8 + Math.random() * 2.8;
                particles.push({
                    wx, wy,
                    vx: Math.cos(angle) * spd,
                    vy: Math.sin(angle) * spd,
                    alpha: 0.5 + Math.random() * 0.5,
                    decay: 0.012 + Math.random() * 0.018,
                    radius: 1 + Math.random() * 2.5,
                    color: PIXI_COLORS[Math.floor(Math.random() * PIXI_COLORS.length)],
                });
            }

            let frame = 0;

            splashApp.ticker.add(() => {
                frame++;

                // Subtle bob
                const bob = Math.sin(frame * 0.035) * 2.5;
                sprite.position.set(bob * 0.4, bob);
                // Wheel wiggle
                const wiggle = Math.sin(frame * 0.045) * 0.12 + 0.28;
                for (const w of sprite._frontWheels) w.rotation = wiggle;

                // Second car lags slightly
                const bob2 = Math.sin(frame * 0.035 + 0.8) * 2;
                sprite2.position.set(
                    (-fwdX * 38 + perpX * 22) + bob2 * 0.3,
                    (-fwdY * 38 + perpY * 22) + bob2
                );
                for (const w of sprite2._frontWheels) w.rotation = wiggle * 0.7;

                // Emit from rear of both cars every 3 frames
                if (frame % 3 === 0) {
                    const sx = sprite.position.x;
                    const sy = sprite.position.y;
                    const rear = 14, side = 9;
                    emitAt(sx - fwdX * rear - perpX * side, sy - fwdY * rear - perpY * side);
                    emitAt(sx - fwdX * rear + perpX * side, sy - fwdY * rear + perpY * side);

                    const sx2 = sprite2.position.x;
                    const sy2 = sprite2.position.y;
                    emitAt(sx2 - fwdX * rear * 0.88, sy2 - fwdY * rear * 0.88);
                }

                // Draw particles via PixiJS Graphics (rendered below cars)
                pGfx.clear();
                for (let i = particles.length - 1; i >= 0; i--) {
                    const p = particles[i];
                    p.wx += p.vx;
                    p.wy += p.vy;
                    p.vx *= 0.93;
                    p.vy *= 0.93;
                    p.alpha -= p.decay;
                    if (p.alpha <= 0) { particles.splice(i, 1); continue; }
                    pGfx.circle(p.wx, p.wy, p.radius);
                    pGfx.fill({ color: p.color, alpha: p.alpha });
                }
            });

            function dismiss() {
                if (dismissed) return;
                dismissed = true;
                splashApp.destroy({ removeView: true });
                title.remove();
                fontStyle.remove();
                resolve();
            }

            document.addEventListener('keydown',     dismiss, { once: true });
            document.addEventListener('pointerdown', dismiss, { once: true });
            const gpPoll = setInterval(() => {
                for (const gp of navigator.getGamepads()) {
                    if (!gp) continue;
                    if (gp.buttons.some(b => b.pressed)) { clearInterval(gpPoll); dismiss(); return; }
                }
            }, 80);
        }

        run();
    });
}
