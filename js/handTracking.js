/**
 * HandTracking — MediaPipe Hands wrapper (v2)
 *
 * Aiming:   crosshair follows index-finger direction ANY time a hand
 *           is visible. No strict pose needed to aim.
 *
 * Shooting: THUMB SNAP DOWN — when the thumb tip drops below the
 *           thumb MCP joint (trigger-pull motion).  Detected as a
 *           state-transition edge so holding the thumb down doesn't
 *           repeat fire.
 *
 * Anti-chop:
 *   • Landmark EMA smoothing before any decision logic.
 *   • Hysteresis counters on every boolean state so single-frame
 *     wobbles never flip the state.
 */
const HandTracking = (() => {

  // ── State ──────────────────────────────────────────────────────
  let crosshairX       = -1;
  let crosshairY       = -1;
  let handDetected     = false;
  let indexAiming      = false;   // index finger is extended
  let currentLandmarks = null;
  let onShootCb        = null;

  // ── Landmark smoothing (EMA) ───────────────────────────────────
  // α = how much we trust the NEW frame vs the running average.
  // 0.55 → ~2-frame lag at 30 fps; very jitter-free.
  const LM_ALPHA = 0.55;
  let smoothed = null;

  function smooth(rawLm) {
    if (!smoothed) {
      smoothed = rawLm.map(p => ({ x: p.x, y: p.y, z: p.z || 0 }));
      return smoothed;
    }
    const a = LM_ALPHA, b = 1 - a;
    for (let i = 0; i < rawLm.length; i++) {
      smoothed[i].x = b * smoothed[i].x + a * rawLm[i].x;
      smoothed[i].y = b * smoothed[i].y + a * rawLm[i].y;
      smoothed[i].z = b * smoothed[i].z + a * (rawLm[i].z || 0);
    }
    return smoothed;
  }

  // ── Crosshair: project index finger direction forward ──────────
  // Vector from index MCP (5) → tip (8), extended PROJECTION× beyond tip.
  // Gives a natural "barrel of a gun" aim rather than raw tip position.
  const PROJECTION = 1.8;
  const MARGIN     = 0.07; // remap inner 86% of frame to full screen

  function computeCrosshair(lm) {
    const mcp = lm[5]; // index MCP knuckle
    const tip = lm[8]; // index tip
    const dx  = tip.x - mcp.x;
    const dy  = tip.y - mcp.y;
    const len = Math.sqrt(dx * dx + dy * dy) || 0.001;

    // Extend beyond tip
    const px = tip.x + (dx / len) * len * PROJECTION;
    const py = tip.y + (dy / len) * len * PROJECTION;

    // Mirror X (selfie camera) + remap MARGIN band → full screen
    const nx = ((1 - px) - MARGIN) / (1 - 2 * MARGIN);
    const ny = (py       - MARGIN) / (1 - 2 * MARGIN);

    return {
      x: Math.max(0, Math.min(1, nx)) * window.innerWidth,
      y: Math.max(0, Math.min(1, ny)) * window.innerHeight
    };
  }

  // ── Index-extended check (aiming indicator only) ───────────────
  let idxExtFrames    = 0;
  let idxNotExtFrames = 0;
  const IDX_ON_FRAMES  = 3;
  const IDX_OFF_FRAMES = 5; // slightly sticky so brief wobble doesn't drop it

  function updateIndexState(lm) {
    // tip (8) clearly above PIP (6) = extended
    const raw = lm[8].y < lm[6].y - 0.015;
    if (raw) { idxExtFrames++;    idxNotExtFrames = 0; }
    else     { idxNotExtFrames++; idxExtFrames = 0;    }

    if (!indexAiming && idxExtFrames    >= IDX_ON_FRAMES)  indexAiming = true;
    if ( indexAiming && idxNotExtFrames >= IDX_OFF_FRAMES) indexAiming = false;
  }

  // ── Thumb-snap / trigger-pull detection ──────────────────────
  // Uses RAW (unsmoothed) landmarks — the EMA filter attenuates fast
  // snaps too much for reliable velocity measurement.
  //
  // Orientation-independent: we track the downward velocity of the
  // thumb tip in image-Y rather than comparing it to a fixed reference
  // joint. A quick snap DOWN (positive ΔY in image coords) = fire.

  const SHOT_COOLDOWN  = 480;   // ms between shots
  const SNAP_THRESH    = 0.020; // raw norm-Y units per frame (≈6 px at 30fps)
  const SNAP_HIST      = 5;     // frames to keep in velocity buffer

  let rawPrevThumbY = null;
  let snapVelBuf    = [];
  let lastShotMs    = 0;

  // rawLm = unsmoothed MediaPipe landmarks for this frame
  function detectThumbSnap(rawLm) {
    const ty = rawLm[4].y; // thumb tip, raw

    if (rawPrevThumbY !== null) {
      const dv = ty - rawPrevThumbY; // positive = moving DOWN in image
      snapVelBuf.push(dv);
      if (snapVelBuf.length > SNAP_HIST) snapVelBuf.shift();
    }
    rawPrevThumbY = ty;

    if (snapVelBuf.length < 3) return false;

    const peak = Math.max(...snapVelBuf);
    if (peak < SNAP_THRESH) return false;

    const now = Date.now();
    if (now - lastShotMs < SHOT_COOLDOWN) return false;

    lastShotMs = now;
    snapVelBuf = []; // clear so same snap can't re-trigger
    return true;
  }

  // ── MediaPipe results callback ────────────────────────────────
  function onResults(results) {
    currentLandmarks = null;
    handDetected     = false;

    if (!results.multiHandLandmarks?.length) {
      // Reset all state when hand leaves frame
      smoothed        = null;
      rawPrevThumbY   = null;
      snapVelBuf      = [];
      idxExtFrames    = 0;
      idxNotExtFrames = 0;
      indexAiming     = false;
      return;
    }

    const rawLm = results.multiHandLandmarks[0];
    const lm    = smooth(rawLm);   // smoothed copy for position/aiming
    currentLandmarks = lm;
    handDetected     = true;

    // Crosshair follows smoothed index direction — stable, no delay
    const pos = computeCrosshair(lm);
    crosshairX = pos.x;
    crosshairY = pos.y;

    // Aiming indicator uses smoothed data (stable)
    updateIndexState(lm);

    // Shoot detection uses RAW data (fast snaps preserved)
    if (detectThumbSnap(rawLm) && onShootCb) {
      onShootCb(crosshairX, crosshairY);
    }
  }

  // ── Init ──────────────────────────────────────────────────────
  async function init(videoEl, onShoot) {
    onShootCb = onShoot;

    const hands = new Hands({
      locateFile: f => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${f}`
    });

    hands.setOptions({
      maxNumHands:            1,
      modelComplexity:        1,
      minDetectionConfidence: 0.6,
      minTrackingConfidence:  0.5
    });

    hands.onResults(onResults);

    const camera = new Camera(videoEl, {
      onFrame: async () => { await hands.send({ image: videoEl }); },
      width:  640,
      height: 480
    });

    await camera.start();
  }

  // ── Public API ────────────────────────────────────────────────
  function getCrosshair() {
    return {
      x:      crosshairX,
      y:      crosshairY,
      active: handDetected,   // any hand visible
      aiming: indexAiming     // index extended (brighter crosshair)
    };
  }

  function getLandmarks() { return currentLandmarks; }

  return { init, getCrosshair, getLandmarks };
})();
