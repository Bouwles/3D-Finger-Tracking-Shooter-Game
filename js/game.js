/**
 * game.js — main game engine.
 *
 * Handles:
 *   - Canvas setup & resize
 *   - Target spawning, movement, hit detection
 *   - Crosshair rendering (no lerp → zero delay)
 *   - PiP camera window with landmarks overlay
 *   - Score / HUD
 *   - Effect timers (muzzle flash, recoil, screen flash)
 *   - MediaPipe + Audio initialisation
 */
(() => {
  // ── DOM refs ────────────────────────────────────────────────────
  const canvas        = document.getElementById('gameCanvas');
  const ctx           = canvas.getContext('2d');
  const pipCanvas     = document.getElementById('pipCanvas');
  const pipCtx        = pipCanvas.getContext('2d');
  const video         = document.getElementById('video');
  const scoreValueEl  = document.getElementById('scoreValue');
  const comboPanelEl  = document.getElementById('comboPanel');
  const gestureEl     = document.getElementById('gestureStatus');
  const initOverlay   = document.getElementById('initOverlay');
  const initStatusEl  = document.getElementById('initStatus');

  // ── Neon colour palette ─────────────────────────────────────────
  const COLORS = ['#00ffff', '#ff00ff', '#00ff41', '#ff6b00', '#ff1493'];

  // ── Game state ──────────────────────────────────────────────────
  let score      = 0;
  let targets    = [];
  let popups     = [];  // floating score labels
  let lastTime   = 0;

  // Effect timers
  let muzzleFlashTimer = 0;   // seconds remaining
  let screenFlashAlpha = 0;   // screen-wide flash for gunshot ambiance
  let recoilY          = 0;   // vertical crosshair recoil offset (px)

  // Spawn pacing
  let spawnTimer    = 0;
  let spawnInterval = 1.6; // seconds between spawns (decreases with score)

  // Crosshair smoothing: raw MediaPipe → one-frame EMA for silky visual
  // α=1 = instant (raw), α<1 = smoothed. 0.88 ≈ ~1 frame lag at 60 fps.
  const CROSSHAIR_ALPHA = 0.90;
  let chX = window.innerWidth  / 2;
  let chY = window.innerHeight / 2;

  // ── MediaPipe → hand-landmark connection indices ────────────────
  const HAND_CONNECTIONS = [
    [0,1],[1,2],[2,3],[3,4],        // thumb
    [0,5],[5,6],[6,7],[7,8],        // index
    [5,9],[9,10],[10,11],[11,12],   // middle
    [9,13],[13,14],[14,15],[15,16], // ring
    [13,17],[17,18],[18,19],[19,20],// pinky
    [0,17]                          // palm base
  ];

  // ── Target ──────────────────────────────────────────────────────
  class Target {
    constructor() {
      this.color  = COLORS[Math.floor(Math.random() * COLORS.length)];
      this.radius = 18 + Math.random() * 52;   // 18–70 px
      this.points = Math.round(2200 / (this.radius * 2)); // smaller → more points

      const W = canvas.width;
      const H = canvas.height;
      const speed = 55 + Math.random() * 110;
      const edge  = Math.floor(Math.random() * 4);

      switch (edge) {
        case 0: // top
          this.x  = Math.random() * W;
          this.y  = -this.radius - 10;
          this.vx = (Math.random() - 0.5) * speed * 0.8;
          this.vy = speed * (0.4 + Math.random() * 0.6);
          break;
        case 1: // right
          this.x  = W + this.radius + 10;
          this.y  = Math.random() * H;
          this.vx = -speed;
          this.vy = (Math.random() - 0.5) * speed * 0.7;
          break;
        case 2: // bottom
          this.x  = Math.random() * W;
          this.y  = H + this.radius + 10;
          this.vx = (Math.random() - 0.5) * speed * 0.8;
          this.vy = -speed * (0.4 + Math.random() * 0.6);
          break;
        case 3: // left
        default:
          this.x  = -this.radius - 10;
          this.y  = Math.random() * H;
          this.vx = speed;
          this.vy = (Math.random() - 0.5) * speed * 0.7;
          break;
      }

      // Slow angular wobble for visual interest
      this.wobble      = 0;
      this.wobbleSpeed = (Math.random() - 0.5) * 2.5; // rad/s
      this.wobbleAmp   = 8 + Math.random() * 16;      // px
      this.baseVx      = this.vx;

      this.alive = true;
    }

    update(dt) {
      this.wobble += this.wobbleSpeed * dt;
      this.x += (this.vx + Math.sin(this.wobble) * this.wobbleAmp * dt * 3) * dt;
      this.y += this.vy * dt;
    }

    isOffScreen() {
      const m = this.radius + 80;
      return (
        this.x < -m || this.x > canvas.width  + m ||
        this.y < -m || this.y > canvas.height + m
      );
    }

    contains(px, py) {
      const dx = this.x - px, dy = this.y - py;
      return dx * dx + dy * dy <= this.radius * this.radius;
    }

    draw() {
      const r = this.radius;

      ctx.save();

      // Outer glow
      ctx.shadowColor = this.color;
      ctx.shadowBlur  = 22;

      // Fill (semi-transparent)
      ctx.beginPath();
      ctx.arc(this.x, this.y, r, 0, Math.PI * 2);
      ctx.fillStyle = this.color + '28';
      ctx.fill();

      // Outer ring
      ctx.strokeStyle = this.color;
      ctx.lineWidth   = 2.5;
      ctx.stroke();

      // Inner concentric ring at 55%
      ctx.beginPath();
      ctx.arc(this.x, this.y, r * 0.55, 0, Math.PI * 2);
      ctx.strokeStyle = this.color + 'aa';
      ctx.lineWidth   = 1.5;
      ctx.stroke();

      // Point value
      ctx.shadowBlur = 0;
      const fontSize = Math.max(10, Math.round(r * 0.45));
      ctx.font        = `bold ${fontSize}px 'Courier New', monospace`;
      ctx.textAlign   = 'center';
      ctx.textBaseline= 'middle';
      ctx.fillStyle   = '#fff';
      ctx.fillText(this.points, this.x, this.y);

      ctx.restore();
    }
  }

  // ── Shoot handler (called from HandTracking) ────────────────────
  function onShoot(x, y) {
    AudioSystem.init();
    AudioSystem.playGunshot();

    ParticleSystem.muzzleFlash(x, y);
    muzzleFlashTimer = 0.08;
    screenFlashAlpha = 0.12;
    recoilY = -18;

    // Hit detection — one target per shot
    for (let i = targets.length - 1; i >= 0; i--) {
      if (targets[i].contains(x, y)) {
        const t = targets[i];

        score += t.points;
        scoreValueEl.textContent = score;
        animateScoreDigits();

        ParticleSystem.burst(t.x, t.y, t.color, 30);
        AudioSystem.playExplosion();
        spawnPopup(t.x, t.y, t.points, t.color);

        targets.splice(i, 1);
        break;
      }
    }
  }

  // ── Score digit flash animation ─────────────────────────────────
  function animateScoreDigits() {
    scoreValueEl.style.transform = 'scale(1.18)';
    scoreValueEl.style.transition = 'transform 0s';
    setTimeout(() => {
      scoreValueEl.style.transition = 'transform 0.25s ease-out';
      scoreValueEl.style.transform  = 'scale(1)';
    }, 30);
  }

  // ── Score popup labels ──────────────────────────────────────────
  function spawnPopup(x, y, pts, color) {
    popups.push({ x, y, pts, color, life: 1.0, vy: -90 });
  }

  // ── Resize handler ──────────────────────────────────────────────
  function resize() {
    canvas.width  = window.innerWidth;
    canvas.height = window.innerHeight;
  }

  // ── Update ──────────────────────────────────────────────────────
  function update(dt) {
    // ── Spawn targets ──────────────────────────────────────────
    spawnTimer += dt;
    const dynamicInterval = Math.max(0.45, spawnInterval - score * 0.0004);
    if (spawnTimer >= dynamicInterval) {
      spawnTimer = 0;
      // Occasionally spawn 2 at once at higher scores
      targets.push(new Target());
      if (score > 400 && Math.random() < 0.25) targets.push(new Target());
    }

    // ── Update targets ─────────────────────────────────────────
    for (let i = targets.length - 1; i >= 0; i--) {
      targets[i].update(dt);
      if (targets[i].isOffScreen()) targets.splice(i, 1);
    }

    // ── Update particles ───────────────────────────────────────
    ParticleSystem.update(dt);

    // ── Update effect timers ───────────────────────────────────
    if (muzzleFlashTimer > 0) muzzleFlashTimer = Math.max(0, muzzleFlashTimer - dt);
    screenFlashAlpha = Math.max(0, screenFlashAlpha - dt * 3.5);
    recoilY *= 0.75; // spring back

    // ── Update score popups ────────────────────────────────────
    for (let i = popups.length - 1; i >= 0; i--) {
      const p = popups[i];
      p.y    += p.vy * dt;
      p.life -= dt * 2;
      if (p.life <= 0) popups.splice(i, 1);
    }

    // ── Smooth crosshair to latest hand position ───────────────
    const ch = HandTracking.getCrosshair();
    if (ch.active && ch.x >= 0) {
      chX = chX + (ch.x - chX) * CROSSHAIR_ALPHA;
      chY = chY + (ch.y - chY) * CROSSHAIR_ALPHA;
    }

    // ── HUD gesture status ─────────────────────────────────────
    const lm = HandTracking.getLandmarks();
    if (!lm) {
      gestureEl.textContent = '● NO HAND';
      gestureEl.className   = '';
    } else if (ch.aiming) {
      gestureEl.textContent = '● AIMING';
      gestureEl.className   = 'tracking';
    } else {
      gestureEl.textContent = '● HAND DETECTED';
      gestureEl.className   = 'ready';
    }
  }

  // ── Render ──────────────────────────────────────────────────────
  function render() {
    const W = canvas.width;
    const H = canvas.height;

    // Background
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, W, H);

    // Subtle scan-line atmosphere (every 3 px)
    ctx.fillStyle = 'rgba(0,0,0,0.12)';
    for (let y = 0; y < H; y += 3) {
      ctx.fillRect(0, y, W, 1);
    }

    // Screen flash (gunshot ambiance + muzzle)
    if (screenFlashAlpha > 0) {
      ctx.fillStyle = `rgba(255, 240, 180, ${screenFlashAlpha})`;
      ctx.fillRect(0, 0, W, H);
    }

    // Targets
    for (const t of targets) t.draw();

    // Particles
    ParticleSystem.draw(ctx);

    // Score popups
    for (const p of popups) {
      ctx.save();
      ctx.globalAlpha    = Math.max(0, p.life);
      ctx.font           = 'bold 22px Courier New';
      ctx.textAlign      = 'center';
      ctx.textBaseline   = 'middle';
      ctx.fillStyle      = p.color;
      ctx.shadowColor    = p.color;
      ctx.shadowBlur     = 12;
      ctx.fillText(`+${p.pts}`, p.x, p.y);
      ctx.restore();
    }

    // Crosshair
    drawCrosshair();

    // PiP
    renderPiP();
  }

  // ── Crosshair ───────────────────────────────────────────────────
  function drawCrosshair() {
    const ch     = HandTracking.getCrosshair();
    const active = ch.active;   // any hand visible
    const aiming = ch.aiming;   // index extended
    const x      = chX;
    const y      = chY + recoilY;

    // Bright white when aiming, medium when hand visible, dim when no hand
    const color = aiming  ? '#ffffff'
                : active  ? 'rgba(255,255,255,0.55)'
                :            'rgba(255,255,255,0.2)';
    const glow  = aiming ? 12 : (active ? 4 : 0);
    const outerR   = 22;
    const gapR     = 6;
    const lineLen  = 14;
    const bracketS = 9;

    ctx.save();
    ctx.strokeStyle = color;
    ctx.fillStyle   = color;
    ctx.lineWidth   = aiming ? 1.8 : 1.2;
    ctx.shadowColor = color;
    ctx.shadowBlur  = glow;

    // Four lines (cross hair)
    ctx.beginPath();
    // left
    ctx.moveTo(x - outerR - lineLen, y);
    ctx.lineTo(x - gapR, y);
    // right
    ctx.moveTo(x + gapR, y);
    ctx.lineTo(x + outerR + lineLen, y);
    // top
    ctx.moveTo(x, y - outerR - lineLen);
    ctx.lineTo(x, y - gapR);
    // bottom
    ctx.moveTo(x, y + gapR);
    ctx.lineTo(x, y + outerR + lineLen);
    ctx.stroke();

    // Corner brackets
    const bOff = outerR + 4;
    ctx.beginPath();
    // TL
    ctx.moveTo(x - bOff - bracketS, y - bOff); ctx.lineTo(x - bOff, y - bOff); ctx.lineTo(x - bOff, y - bOff - bracketS);
    // TR
    ctx.moveTo(x + bOff + bracketS, y - bOff); ctx.lineTo(x + bOff, y - bOff); ctx.lineTo(x + bOff, y - bOff - bracketS);
    // BL
    ctx.moveTo(x - bOff - bracketS, y + bOff); ctx.lineTo(x - bOff, y + bOff); ctx.lineTo(x - bOff, y + bOff + bracketS);
    // BR
    ctx.moveTo(x + bOff + bracketS, y + bOff); ctx.lineTo(x + bOff, y + bOff); ctx.lineTo(x + bOff, y + bOff + bracketS);
    ctx.stroke();

    // Center dot
    ctx.beginPath();
    ctx.arc(x, y, aiming ? 2.5 : (active ? 2 : 1.5), 0, Math.PI * 2);
    ctx.fill();

    // Muzzle flash ring
    if (muzzleFlashTimer > 0) {
      const alpha = muzzleFlashTimer / 0.08;
      ctx.globalAlpha = alpha;
      ctx.strokeStyle = '#ffffc0';
      ctx.lineWidth   = 3;
      ctx.shadowBlur  = 20;
      ctx.beginPath();
      ctx.arc(x, y, 28 + (1 - alpha) * 20, 0, Math.PI * 2);
      ctx.stroke();
    }

    ctx.restore();
  }

  // ── PiP camera window ───────────────────────────────────────────
  function renderPiP() {
    const pw = pipCanvas.width;
    const ph = pipCanvas.height;

    // Dark background fallback
    pipCtx.fillStyle = '#0a0a0a';
    pipCtx.fillRect(0, 0, pw, ph);

    // Draw mirrored webcam feed
    pipCtx.save();
    pipCtx.scale(-1, 1);
    try {
      pipCtx.drawImage(video, -pw, 0, pw, ph);
    } catch (_) { /* video not ready yet */ }
    pipCtx.restore();

    // Darken slightly so landmarks pop
    pipCtx.fillStyle = 'rgba(0,0,0,0.35)';
    pipCtx.fillRect(0, 0, pw, ph);

    // Landmarks
    const lm = HandTracking.getLandmarks();
    if (!lm) return;

    const mapX = (nx) => (1 - nx) * pw;  // mirror X
    const mapY = (ny) => ny * ph;

    const ch = HandTracking.getCrosshair();

    // Connections — cyan when aiming, green otherwise
    pipCtx.lineWidth   = 1.5;
    pipCtx.strokeStyle = ch.aiming ? 'rgba(0,255,255,0.8)' : 'rgba(0,200,100,0.5)';
    for (const [a, b] of HAND_CONNECTIONS) {
      pipCtx.beginPath();
      pipCtx.moveTo(mapX(lm[a].x), mapY(lm[a].y));
      pipCtx.lineTo(mapX(lm[b].x), mapY(lm[b].y));
      pipCtx.stroke();
    }

    // Landmark dots
    for (let i = 0; i < lm.length; i++) {
      const x = mapX(lm[i].x);
      const y = mapY(lm[i].y);
      const r = (i === 8) ? 4.5 : 2.5;   // index tip is larger & red
      pipCtx.beginPath();
      pipCtx.arc(x, y, r, 0, Math.PI * 2);
      pipCtx.fillStyle = (i === 8) ? '#ff3333' : (ch.aiming ? '#00ffff' : '#00ff41');
      pipCtx.fill();
    }

    // Status badge
    pipCtx.font         = '9px Courier New';
    pipCtx.fillStyle    = ch.aiming ? '#00ffff' : 'rgba(255,255,255,0.3)';
    pipCtx.textAlign    = 'left';
    pipCtx.textBaseline = 'top';
    pipCtx.fillText(ch.aiming ? '[ AIMING ]' : '[ TRACKING ]', 6, 6);
  }

  // ── Main loop ───────────────────────────────────────────────────
  function loop(timestamp) {
    const dt = Math.min((timestamp - lastTime) / 1000, 0.05); // cap at 50ms
    lastTime = timestamp;
    update(dt);
    render();
    requestAnimationFrame(loop);
  }

  // ── Initialise ──────────────────────────────────────────────────
  async function init() {
    resize();
    window.addEventListener('resize', resize);

    initStatusEl.textContent = 'REQUESTING CAMERA…';

    try {
      await HandTracking.init(video, onShoot);
      // Hide overlay after a brief pause so first frame renders
      setTimeout(() => {
        initOverlay.style.transition = 'opacity 0.6s';
        initOverlay.style.opacity    = '0';
        setTimeout(() => { initOverlay.style.display = 'none'; }, 700);
      }, 800);
    } catch (err) {
      initStatusEl.textContent = `ERROR: ${err.message}`;
      initStatusEl.style.color = '#ff4444';
      console.error('HandTracking init failed:', err);
    }

    requestAnimationFrame((ts) => {
      lastTime = ts;
      requestAnimationFrame(loop);
    });
  }

  window.addEventListener('load', init);
})();
