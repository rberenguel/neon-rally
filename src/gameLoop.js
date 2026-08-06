import { S } from './state.js';
import { isOnTrack, getTrackZone, getTrackProgress } from './track.js';
import { updateCarPhysics } from './car.js';
import { updateCarSprite, updateCamera, shakeOnBump, updateShake } from './renderer.js';
import { updateWaypointAI, updateSplineAI, resolveCollisions, computeDraftBoost, recordOffTrackEpisode } from './ai.js';
import { spawnPowerup, updatePowerups, tickBoosts, activatePowerup, resetPowerupRng } from './powerups.js';
import { dismissControls, orientationDiv, lapDiv, deltaDiv, powerupHud, speedHud, fuelHud, fuelBarFill, fuelFlowLabel, fuelPctLabel, tireWearLabel, powerupIndicators, pitZoneDiv, showPitMenu, dismissPitMenu, confirmPitMenu, isPitMenuOpen, pitMenuStep, pitMenuToggleTires, pitStopFrames, debugDiv, labelDivs, showAnnounce, showLabels, updateMinimap, updatePowerupIndicators, formatTime, challengeDelta, encodeChallenge, showFinishedOverlay } from './hud.js';
import { getRaceProgress, getLeader, getColorName, advanceToNextTrack, endSession } from './race.js';
import { isRemapping } from './controls.js';
import { seedToTrackId } from './track.js';

const BUMP_DIST = 26;

function ordinal(n) {
  const v = n % 100;
  if (v >= 11 && v <= 13) return n + 'th';
  return n + (['th','st','nd','rd'][n % 10] ?? 'th');
}

function emitCarEffects(car, state, slipThreshold, skids, particles) {
  const rearX = -state.forwardX;
  const rearY = -state.forwardY;
  const rightX = Math.cos(car.rotation);
  const rightY = Math.sin(car.rotation);
  const lrx = car.x + rearX * 10 - rightX * 8;
  const lry = car.y + rearY * 10 - rightY * 8;
  const rrx = car.x + rearX * 10 + rightX * 8;
  const rry = car.y + rearY * 10 + rightY * 8;

  const skidWidth = 1 + (car.tireWear || 0) * 2; // 1 → 3 as wear increases

  if (state.speed > 2 && state.slip > slipThreshold && car._prevLrx !== undefined) {
    skids.emitSeg(car._prevLrx, car._prevLry, lrx, lry, state.onTrack, skidWidth);
    skids.emitSeg(car._prevRrx, car._prevRry, rrx, rry, state.onTrack, skidWidth);
  }
  car._prevLrx = lrx; car._prevLry = lry;
  car._prevRrx = rrx; car._prevRry = rry;

  if (state.speed > 3 && state.slip > 0.5 && state.slip < Math.PI - 0.5) {
    const intensity = Math.min(Math.floor((state.slip - 0.5) * 4), 4);
    for (let i = 0; i < intensity; i++) {
      particles.emit(lrx, lry, car.vx, car.vy);
      particles.emit(rrx, rry, car.vx, car.vy);
    }
  }
}

export function startGameLoop() {
  S.app.ticker.add((ticker) => {
    const dt = ticker.deltaTime;

    // --- CONTROLS (always polled so pause can be toggled while paused) ---
    S.input.steerLeft = false; S.input.steerRight = false; S.input.gas = false; S.input.activate = false; S.input.pause = false; S.input.fuelFlowUp = false; S.input.fuelFlowDown = false;

    S.pollTouch(S.raceStarted && !S.raceFinished, true, isPitMenuOpen());
    if (!S.controlsAcknowledged) {
      S.input.steerLeft = false;
      S.input.steerRight = false;
      S.input.gas = false;
      S.input.pause = false;
      S.input.fuelFlowUp = false;
      S.input.fuelFlowDown = false;
    }

    if (!S.controlsAcknowledged) {
      if (isRemapping()) {
        S._ctrlPoll();
        S.pollControls();
      } else {
        S._ctrlInput.activate = false;
        S._ctrlPoll();
        if (S._ctrlInput.activate || S.input.activate) {
          dismissControls();
          S.input.activate = false;
          S._activateCooldown = 10;
        }
      }
    } else {
      S.pollControls();
    }
    if (S._pauseCooldown > 0) S._pauseCooldown--;
    if (S._pitMenuStepCooldown > 0) S._pitMenuStepCooldown--;

    if (isPitMenuOpen()) {
      // Route real controls into the pit menu; nothing else runs while it's open
      if (S.input.pause && S._pauseCooldown === 0) {
        S._pauseCooldown = 20;
        dismissPitMenu(); S.paused = false;
      }
      if (S.input.activate && S._activateCooldown === 0) {
        S._activateCooldown = 10;
        confirmPitMenu(); S.paused = false;
      }
      if (S._pitMenuStepCooldown === 0) {
        if (S.input.steerLeft)  { pitMenuStep(-1); S._pitMenuStepCooldown = 6; }
        if (S.input.steerRight) { pitMenuStep(+1); S._pitMenuStepCooldown = 6; }
      }
    } else if (S.input.pause && S._pauseCooldown === 0) {
      S._pauseCooldown = 20;
      const pitAvail = S.mode?.hasPit && S._inPitZone && S.raceStarted && !S.raceFinished && !S._pitActive && S._pitInvulTimer <= 0;
      if (pitAvail) {
        S.paused = true;
        showPitMenu(
          S.player.fuel ?? 1,
          S.player.tireWear ?? 0,
          (fuelPct, changeTires) => {
            S._pitFuelToAdd = fuelPct;
            S._pitChangeTires = changeTires;
            S._pitStopTimer = pitStopFrames(fuelPct * 100, changeTires);
            S._pitActive = true;
            S.paused = false;
            const lapsLeft = S.raceConfig.totalLaps - S.player.lap - 1;
            const lapsStr = lapsLeft <= 0 ? 'Final lap' : `${lapsLeft} lap${lapsLeft !== 1 ? 's' : ''} left`;
            showAnnounce(`PIT STOP<br><span style="font-size:22px">${lapsStr}</span>`);
          },
          () => { S.paused = false; }
        );
      } else {
        S.paused = !S.paused;
      }
    }

    // Fuel flow cycling (GP / hasFuel modes)
    if (S.mode?.hasFuel) {
      if (S._fuelFlowCooldown > 0) S._fuelFlowCooldown--;
      if (S._fuelFlowCooldown === 0) {
        if (S.input.fuelFlowUp)   { S.player.fuelFlow = Math.min( 1, (S.player.fuelFlow ?? 0) + 1); S._fuelFlowCooldown = 6; }
        if (S.input.fuelFlowDown) { S.player.fuelFlow = Math.max(-1, (S.player.fuelFlow ?? 0) - 1); S._fuelFlowCooldown = 6; }
      }
    }

    if (orientationDiv?.style.display !== 'none') return;
    if (S.paused) { lapDiv.textContent = 'PAUSED'; return; }
    if (S._activateCooldown > 0) S._activateCooldown--;
    if (S.input.activate && S._activateCooldown === 0) {
      if (S.raceFinished) { advanceToNextTrack(); }
      else if (S.player._heldPowerup) { activatePowerup(S.player); S._activateCooldown = 10; }
    }
    const gas = S.input.gas;

    // --- RACE START ---
    const wantsStart = S._isMobile
      ? (S.input.activate && S._activateCooldown === 0)
      : gas;
    if (!S.raceStarted && wantsStart && S.controlsAcknowledged) {
      S.raceStarted = true;
      S.raceFrame = 0;
      S._splitFrames = [null, null, null];
      resetPowerupRng(S.trackSeed ?? 0);
      showLabels();
      for (const c of S.allCars) { c._logAccel = true; c._physicsLogFrame = 0; }
      for (const c of S.allCars) {
        const zone = getTrackZone(c.x, c.y, S.trackCenterline);
        console.log(`[ZONE] ${c.isPlayer ? 'PLAYER' : 'AI'} zone=${zone} x=${c.x.toFixed(1)} y=${c.y.toFixed(1)}`);
      }
    }
    if (S.raceStarted) S.raceFrame++;

    if (!S.raceFinished) {
      // --- CAUTION MEMORY DECAY ---
      for (const ai of S.aiCars) {
        if (ai._trackMemory) {
          for (let i = 0; i < ai._trackMemory.length; i++) ai._trackMemory[i] *= 0.998;
        }
      }

      // --- DRAFTING / SLIPSTREAM ---
      for (const c of S.allCars) {
        const candidates = c === S.player ? S.aiCars : (c.isPlayer ? S.allCars : [S.player]);
        const desired = computeDraftBoost(c, candidates);
        if (desired > 0) {
          c._draftBoost = Math.min(desired, (c._draftBoost || 0) + 0.02 * dt);
        } else {
          c._draftBoost = Math.max(0, (c._draftBoost || 0) - 0.05 * dt);
        }
      }

      // --- PIT ZONE DETECTION ---
      if (S.pitBox && S.raceStarted && !S.raceFinished) {
        const dx = S.player.x - S.pitBox.x, dy = S.player.y - S.pitBox.y;
        const along  = Math.abs(dx * S.pitBox.fwdX  + dy * S.pitBox.fwdY);
        const across = Math.abs(dx * S.pitBox.perpX + dy * S.pitBox.perpY);
        S._inPitZone = along < S.pitBox.halfLen && across < S.pitBox.halfWidth;
        if (S._inPitZone) S._pitZoneFrames = (S._pitZoneFrames || 0) + 1;
        else { S._pitZoneFrames = 0; S._pitAutoTriggered = false; }
        // Auto pit on low fuel: trigger after 3 consecutive frames in zone (not on border)
        if (S._inPitZone && !S._pitAutoTriggered && S.mode?.hasFuel && !S._pitActive &&
            S._pitInvulTimer <= 0 && S.player.fuel <= 0.2 && !isPitMenuOpen() &&
            (S._pitZoneFrames || 0) >= 3) {
          S._pitAutoTriggered = true;
          S.paused = true;
          showPitMenu(
            S.player.fuel ?? 1,
            S.player.tireWear ?? 0,
            (fuelPct, changeTires) => {
              S._pitFuelToAdd = fuelPct;
              S._pitChangeTires = changeTires;
              S._pitStopTimer = pitStopFrames(fuelPct * 100, changeTires);
              S._pitActive = true;
              S.paused = false;
              const lapsLeft = S.raceConfig.totalLaps - S.player.lap - 1;
              const lapsStr = lapsLeft <= 0 ? 'Final lap' : `${lapsLeft} lap${lapsLeft !== 1 ? 's' : ''} left`;
              showAnnounce(`PIT STOP<br><span style="font-size:22px">${lapsStr}</span>`);
            },
            () => { S.paused = false; }
          );
          const lapsLeft = S.raceConfig.totalLaps - S.player.lap - 1;
          const lapsStr = lapsLeft <= 0 ? 'Final lap' : `${lapsLeft} lap${lapsLeft !== 1 ? 's' : ''} left`;
          showAnnounce(`AUTO PIT — LOW FUEL<br><span style="font-size:22px">${lapsStr}</span>`, '#FF8800');
        }
      } else {
        S._inPitZone = false;
      }
      if (pitZoneDiv) pitZoneDiv.style.display = (S._inPitZone && !S._pitActive) ? 'block' : 'none';

      // --- PIT STOP TIMER ---
      if (S._pitActive) {
        S.player.vx = 0; S.player.vy = 0;
        S._pitStopTimer -= dt;
        if (S._pitStopTimer <= 0) {
          S.player.fuel = Math.min(1, (S.player.fuel ?? 0) + S._pitFuelToAdd);
          if (S._pitChangeTires) { S.player.tireWear = 0; S._pitChangeTires = false; }
          S._pitActive = false;
          S._pitFuelToAdd = 0;
          S._pitInvulTimer = 120;
          S.paused = true;
          S._pauseCooldown = 20;
          showAnnounce('GO GO GO!');
        }
      }
      if (S._pitInvulTimer > 0) S._pitInvulTimer -= dt;

      // --- PLAYER ---
      const steer = S._pitActive ? 0 : (S.input.steerLeft ? -1 : 0) + (S.input.steerRight ? 1 : 0);
      const playerGas = S._pitActive ? false : (S.raceStarted ? gas : 0);
      const pState = updateCarPhysics(S.player, dt, steer, playerGas,
        (x, y) => getTrackZone(x, y, S.trackCenterline), S.arena);

      // --- AI ---
      const aiStates = [];
      for (const ai of S.aiCars) {
        // AI pit zone detection and auto-pit (freeze on entry, no navigation needed)
        if (S.pitBox && S.raceStarted && !S.raceFinished && S.mode?.hasFuel) {
          const adx = ai.x - S.pitBox.x, ady = ai.y - S.pitBox.y;
          const aAlong  = Math.abs(adx * S.pitBox.fwdX  + ady * S.pitBox.fwdY);
          const aAcross = Math.abs(adx * S.pitBox.perpX + ady * S.pitBox.perpY);
          ai._inPitZone = aAlong < S.pitBox.halfLen && aAcross < S.pitBox.halfWidth;
          if (ai._inPitZone) ai._pitZoneFrames = (ai._pitZoneFrames || 0) + 1;
          else { ai._pitZoneFrames = 0; ai._pitAutoTriggered = false; }
          if (ai._inPitZone && !ai._pitAutoTriggered && !ai._pitActive && (ai._pitInvulTimer || 0) <= 0 && ai.fuel <= 0.2 &&
              (ai._pitZoneFrames || 0) >= 3) {
            ai._pitAutoTriggered = true;
            ai._pitActive = true;
            ai._pitStopTimer = pitStopFrames(100, false);
            console.log(`[AI PIT] ${getColorName(ai.color)} fuel=${(ai.fuel*100).toFixed(0)}%`);
            if (Math.hypot(ai.x - S.player.x, ai.y - S.player.y) < 500) {
              showAnnounce(`${getColorName(ai.color)} PIT`, '#FF8800');
            }
          }
        }
        if (ai._pitActive) {
          ai.vx = 0; ai.vy = 0;
          ai._pitStopTimer -= dt;
          if (ai._pitStopTimer <= 0) {
            ai.fuel = 1.0;
            ai._pitActive = false;
            ai._pitInvulTimer = 120;
          }
        }
        if (ai._pitInvulTimer > 0) ai._pitInvulTimer -= dt;

        let aiInput, aiState;
        if (S.raceStarted && ai.lap < S.raceConfig.totalLaps && !ai._pitActive) {
          aiInput = ai.aiType === 'spline'
            ? updateSplineAI(ai, dt, S.trackRacingLine)
            : updateWaypointAI(ai, dt, S.trackRacingLine);
          aiState = updateCarPhysics(ai, dt, aiInput.steer, aiInput.gas,
            (x, y) => getTrackZone(x, y, S.trackCenterline), S.arena);

          if (ai.aiType === 'waypoint' && aiState.speed < 1.0) {
            ai._stuckFrames = (ai._stuckFrames || 0) + 1;
            if (ai._stuckFrames > 12) {
              ai.aiType = 'spline';
              ai._speedProfile = S.trackSpeedProfile;
              ai._stuckFrames = 0;
            }
          } else {
            ai._stuckFrames = 0;
          }
          if (!aiState.onTrack) {
            if (!ai._offTrackSince) {
              ai._offTrackSince = S.raceFrame;
              ai._offTrackStartIdx = aiInput.nearestIdx || 0;
            }
          } else if (ai._offTrackSince) {
            recordOffTrackEpisode(ai, ai._offTrackStartIdx, S.raceFrame - ai._offTrackSince);
            ai._offTrackSince = 0;
            ai._stuckFrames = 0;
            if (ai.aiType === 'spline' && ai._trackMemory) {
              ai.aiType = 'waypoint';
              ai._recovering = false;
            }
          }
        } else if (ai._pitActive) {
          aiState = { speed: 0, speedFactor: 0, onTrack: true, forwardX: 0, forwardY: 1, dot: 0, cross: 0, slip: 0, turnSign: 0, movingForward: true };
        } else if (ai.lap >= S.raceConfig.totalLaps) {
          aiState = updateCarPhysics(ai, dt, 0, false,
            (x, y) => getTrackZone(x, y, S.trackCenterline), S.arena);
        } else {
          aiState = { speed: 0, speedFactor: 0, onTrack: true, forwardX: 0, forwardY: 1, dot: 0, cross: 0, slip: 0, turnSign: 0, movingForward: true };
        }
        aiStates.push(aiState);
        ai.sprite.alpha = (ai._pitActive || ai._pitInvulTimer > 0) ? 0.3 : 1.0;
        updateCarSprite(ai.sprite, ai, aiState.slip, aiState.turnSign, aiState.movingForward, aiState.steerInput);
      }

      // --- SPLIT RECORDING ---
      if (S.raceStarted && !S.raceFinished) {
        const progress = Math.min(1, (S.player.lap + (S.player._trackIdx || 0) / S.trackSamples) / S.raceConfig.totalLaps);
        if (S._splitFrames[0] === null && progress >= 0.25) S._splitFrames[0] = S.raceFrame;
        if (S._splitFrames[1] === null && progress >= 0.50) S._splitFrames[1] = S.raceFrame;
        if (S._splitFrames[2] === null && progress >= 0.75) S._splitFrames[2] = S.raceFrame;
      }

      // --- LAPS & RACE FINISH ---
      if (S.raceStarted && S.raceFrame > 120) {
        for (const c of S.allCars) {
          const idx = Math.floor(getTrackProgress(c.x, c.y, S.trackCenterline) * S.trackSamples);
          const raw = idx - (c._trackIdx ?? idx);
          if (raw > 0 && raw < S.trackSamples * 0.5) c._lapDelta = (c._lapDelta ?? 0) + raw;
          if (c._trackIdx !== undefined && c._trackIdx > S.trackSamples * 0.8 && idx < S.trackSamples * 0.2 && c.lap < S.raceConfig.totalLaps && (c._lapDelta ?? 0) >= S.trackSamples * 0.8) {
            c.lap++;
            c._lapDelta = 0;
            if (c.lap >= S.raceConfig.totalLaps) c._finishOrder = ++S._finishCounter;
            if (c === S.player && c.lap < S.raceConfig.totalLaps) {
              const remaining = S.raceConfig.totalLaps - c.lap;
              const pos = S.player.prevPos > 0 ? `<br><span style="font-size:24px">${ordinal(S.player.prevPos)}</span>` : '';
              showAnnounce((remaining === 1 ? 'Final lap!' : `${remaining} laps to go!`) + pos);
            }
          }
          c._trackIdx = idx;
        }

        // Fuel warning — once per race when dropping below 20%
        if (S.mode?.hasFuel && !S._fuelWarningShown && S.player.fuel <= 0.2 && S.player.fuel > 0) {
          S._fuelWarningShown = true;
          showAnnounce('⚠ LOW FUEL', '#FF8800');
        }

        const leaderCar = getLeader();
        const leaderName = getColorName(leaderCar.color);

        if (!S.raceFinished && S.player.lap >= S.raceConfig.totalLaps) {
          S.raceFinished = true;
          S.playerFinishFrame = S.raceFrame;
          const rank = S.allCars.filter(c => getRaceProgress(c) > getRaceProgress(S.player)).length + 1;
          const timeStr = formatTime(S.playerFinishFrame);
          let challengeStr = '';
          if (S.challengeTime) {
            const diff = S.playerFinishFrame - S.challengeTime;
            if (diff < 0) challengeStr = `<span style="color:#00FF88">Beat challenge by ${formatTime(-diff)}!</span>`;
            else challengeStr = `<span style="color:#FF4444">Missed by ${formatTime(diff)}</span>`;
          }
          const trackId = S.trackSeed !== null ? seedToTrackId(S.trackSeed) : '';
          const splits = S._splitFrames.every(v => v !== null) ? S._splitFrames : null;
          const challenge = encodeChallenge(S.raceConfig.totalLaps, S.playerFinishFrame, splits);
          const shareUrl = trackId
            ? `${location.origin}${location.pathname}#track=${trackId}&challenge=${challenge}`
            : location.href;
          if (trackId) history.replaceState(null, '', `#track=${trackId}&challenge=${challenge}`);
          const standings = [...S.allCars].sort((a, b) => getRaceProgress(b) - getRaceProgress(a));
          S.sessionRaces.push({
            trackId,
            difficulty: S.player.trackDifficulty,
            laps: S.raceConfig.totalLaps,
            timeFrames: S.playerFinishFrame,
            rank,
            points: S.trackCenterline.map(p => ({ x: p.x, y: p.y })),
          });
          showFinishedOverlay(rank, timeStr, challengeStr, shareUrl, S.sessionRaces.length, standings, S.trackCenterline, advanceToNextTrack, endSession);
          lapDiv.textContent = '';
          deltaDiv.style.display = 'none';
        } else if (S._pitActive) {
          const secsLeft = (S._pitStopTimer / 60).toFixed(1);
          const lapsLeft = S.raceConfig.totalLaps - S.player.lap - 1;
          const lapsStr = lapsLeft <= 0 ? 'Final lap' : `${lapsLeft} lap${lapsLeft !== 1 ? 's' : ''} left`;
          lapDiv.textContent = `PIT — ${secsLeft}s  |  ${lapsStr}`;
        } else {
          const trackId = S.trackSeed !== null ? seedToTrackId(S.trackSeed) : '?';
          const text = `Lap ${Math.min(S.player.lap + 1, S.raceConfig.totalLaps)}/${S.raceConfig.totalLaps}  |  ${formatTime(S.raceFrame)}  |  Leader: ${leaderName}  |  Track: ${trackId}`;
          if (lapDiv.textContent !== text) lapDiv.textContent = text;

          if (S.challengeTime) {
            const progress = Math.min(1, (S.player.lap + (S.player._trackIdx || 0) / S.trackSamples) / S.raceConfig.totalLaps);
            const delta = challengeDelta(S.raceFrame, progress, S.challengeSplits, S.challengeTime);
            const ahead = delta < 0;
            deltaDiv.style.display = 'block';
            deltaDiv.style.color = ahead ? '#00FF88' : '#FF4444';
            deltaDiv.textContent = `${ahead ? '▲' : '▼'} ${ahead ? '-' : '+'}${formatTime(Math.abs(delta))} vs challenge`;
          } else {
            deltaDiv.style.display = 'none';
          }
        }
      } else if (S.controlsAcknowledged) {
        const preRaceMsg = S.challengeTime
          ? `Challenge: beat ${formatTime(S.challengeTime)} (${S.challengeLaps} laps) — Press gas to start`
          : 'Press gas to start race';
        if (lapDiv.textContent !== preRaceMsg) lapDiv.textContent = preRaceMsg;
        deltaDiv.style.display = 'none';
      } else {
        if (lapDiv.textContent !== '') lapDiv.textContent = '';
        deltaDiv.style.display = 'none';
      }

      // --- POSITION TRACKING ---
      if (S.raceStarted && S.raceFrame > 60) {
        const scores = S.allCars.map((c, i) => ({ index: i, score: getRaceProgress(c) }));
        scores.sort((a, b) => b.score - a.score);
        for (let rank = 0; rank < scores.length; rank++) {
          const carIdx = scores[rank].index;
          const car = S.allCars[carIdx];
          const newPos = rank + 1;
          const div = labelDivs[carIdx];
          if (car.prevPos !== 0 && car.prevPos !== newPos) {
            div.style.opacity = '1';
            div.textContent = String(newPos);
            div.style.fontSize = car.isPlayer ? '22px' : '16px';
            div.style.color = car.isPlayer ? '#00FFFF' : '#FFFFFF';
            div._flashTimer = 120;
          }
          car.prevPos = newPos;
        }
      }

      // --- POWERUPS ---
      if (S.raceStarted) {
        S._powerupSpawnTimer++;
        if (S._powerupSpawnTimer >= S.POWERUP_SPAWN_INTERVAL) {
          spawnPowerup(S.powerupLayer, S.trackCenterline);
          S._powerupSpawnTimer = 0;
        }
        updatePowerups(S.powerupLayer, S.allCars, S.player);
        tickBoosts(S.allCars);
      }

      // --- COLLISIONS ---
      // Only active (non-pitting, non-invulnerable) cars participate
      const activeCars = S.allCars.filter(c => {
        const pitting = c.isPlayer ? S._pitActive : c._pitActive;
        const invul   = c.isPlayer ? S._pitInvulTimer : (c._pitInvulTimer || 0);
        return !pitting && invul <= 0;
      });
      // Bump shake only when player is also active (not pitting/ghost)
      if (!S._pitActive && S._pitInvulTimer <= 0) {
        const activeAI = activeCars.filter(c => c !== S.player);
        for (const ai of activeAI) {
          if (Math.hypot(ai.x - S.player.x, ai.y - S.player.y) < BUMP_DIST) {
            shakeOnBump();
            break;
          }
        }
      }
      resolveCollisions(activeCars);

      // --- CAMERA ---
      const cam = updateCamera(S.world, S.player.x * S.ZOOM, S.player.y * S.ZOOM, S.app.screen.width, S.app.screen.height);
      updateShake(S.app.canvas, (!pState.onTrack && playerGas) ? 1 : 0);

      // Update floating labels
      const dpr = window.devicePixelRatio;
      for (let i = 0; i < S.allCars.length; i++) {
        const c = S.allCars[i];
        const screenX = (c.x * S.ZOOM + cam.x) * dpr;
        const screenY = (c.y * S.ZOOM + cam.y - 25) * dpr;
        const div = labelDivs[i];
        div.style.left = (screenX / dpr - 15) + 'px';
        div.style.top = (screenY / dpr) + 'px';
        if (div._flashTimer > 0) {
          div._flashTimer--;
          if (div._flashTimer <= 0) {
            div.style.opacity = '0';
            div.style.fontSize = '14px';
          }
        }
      }
      // Speed HUD position
      const pScreenX = (S.player.x * S.ZOOM + cam.x) * dpr;
      const pScreenY = (S.player.y * S.ZOOM + cam.y + 20) * dpr;
      speedHud.style.left = (pScreenX / dpr - 15) + 'px';
      speedHud.style.top = (pScreenY / dpr) + 'px';

      // --- SPRITES ---
      S.playerSprite.alpha = (S._pitActive || S._pitInvulTimer > 0) ? 0.3 : 1.0;
      updateCarSprite(S.playerSprite, S.player, pState.slip, pState.turnSign, pState.movingForward, pState.steerInput);

      // --- SKIDS & PARTICLES ---
      emitCarEffects(S.player, pState, 0.5, S.skids, S.particles);
      for (let i = 0; i < S.aiCars.length; i++) {
        emitCarEffects(S.aiCars[i], aiStates[i], 0.5, S.skids, S.particles);
      }
      S.skids.draw(S.trackColor);
      S.particles.draw();

      // --- DEBUG & HUD UPDATES ---
      if (debugDiv.style.display !== 'none') {
        let dbg = '<b>RACE DEBUG</b><br>';
        for (const c of S.allCars) {
          const name = c === S.player ? 'PLAYER' : getColorName(c.color);
          const on = isOnTrack(c.x, c.y, S.trackCenterline) ? 'ON' : 'OFF';
          const idx = c._trackIdx !== undefined ? c._trackIdx : '?';
          const prog = (c.lap + (c._trackIdx || 0) / S.trackSamples).toFixed(3);
          const tire = c.isPlayer ? ` grip=${Math.round(Math.max(0,(1-(c.tireWear||0)*0.8))*100)}%` : '';
          const fuel = c.fuel !== undefined ? ` F=${Math.round(c.fuel*100)}%` : '';
          const pit = c._pitActive ? ' PIT' : '';
          dbg += `${name}: lap=${c.lap} idx=${idx} prog=${prog} ${on}${tire}${fuel}${pit}<br>`;
        }
        debugDiv.innerHTML = dbg;
      }
      speedHud.textContent = `${pState.speed.toFixed(1)}`;
      if (S.player._heldPowerup) {
        powerupHud.style.display = 'block';
        const isS = S.player._heldPowerup === 'S';
        powerupHud.style.color = isS ? '#00FF88' : '#FF8800';
        const icon = isS ? 'speedometer' : 'rocket-launch';
        powerupHud.innerHTML = `<i class="ph-light ph-${icon}"></i>`;
      } else if (S.player._speedBoost) {
        powerupHud.style.display = 'block';
        powerupHud.style.color = '#FFFFFF';
        powerupHud.innerHTML = `<i class="ph-light ph-rocket-launch"></i>`;
      } else {
        powerupHud.style.display = 'none';
      }

      // Fuel + Tire HUD
      if (S.mode?.hasFuel && fuelHud) {
        fuelHud.style.display = 'block';
        const fuel = S.player.fuel ?? 1;
        const fuelColor = fuel < 0.2 ? '#FF4444' : '#00FFFF';
        fuelBarFill.style.width = `${(fuel * 100).toFixed(1)}%`;
        fuelBarFill.style.background = fuelColor;
        fuelPctLabel.textContent = `${Math.ceil(fuel * 100)}%`;
        fuelPctLabel.style.color = fuelColor + '88';
        const flow = S.player.fuelFlow ?? 0;
        fuelFlowLabel.textContent = flow === 1 ? 'PSH' : flow === -1 ? 'CON' : 'BAL';
        fuelFlowLabel.style.color  = flow === 1 ? '#FF4444' : flow === -1 ? '#00FF88' : '#00FFFF';
      } else if (fuelHud) {
        fuelHud.style.display = 'none';
      }
      if (S.mode?.hasTireWear && tireWearLabel) {
        const tw = S.player.tireWear ?? 0;
        const gripPct = Math.round(Math.max(0, (1 - tw * 0.8)) * 100);
        const twColor = gripPct < 30 ? '#FF4444' : gripPct < 60 ? '#FF8800' : '#00FFFF';
        tireWearLabel.textContent = `GRIP ${gripPct}%`;
        tireWearLabel.style.color = twColor;
      } else if (tireWearLabel) {
        tireWearLabel.textContent = '';
      }

      updateMinimap();

      // --- POWERUP PROXIMITY INDICATORS ---
      updatePowerupIndicators(S.player.x, S.player.y, S.player._trackIdx ?? 0, S.ZOOM, S.app.screen.width, S.app.screen.height, S.powerupLayer.powerups);
    }
  });
}
