/**
 * ParticleSystem — manages all in-game particle effects.
 *
 * Two effect types:
 *   burst()       — colorful explosion on target hit
 *   muzzleFlash() — brief white flash ring at crosshair on fire
 */
const ParticleSystem = (() => {
  const pool = [];

  class Particle {
    constructor() { this.alive = false; }

    spawn(x, y, color, vx, vy, radius, life, gravity = 280) {
      this.x = x;
      this.y = y;
      this.color = color;
      this.vx = vx;
      this.vy = vy;
      this.radius = radius;
      this.life = life;
      this.maxLife = life;
      this.gravity = gravity;
      this.alive = true;
    }

    update(dt) {
      if (!this.alive) return;
      this.x  += this.vx * dt;
      this.y  += this.vy * dt;
      this.vy += this.gravity * dt;
      this.vx *= 0.97;
      this.life -= dt;
      if (this.life <= 0) this.alive = false;
    }

    draw(ctx) {
      if (!this.alive) return;
      const alpha = Math.max(0, this.life / this.maxLife);
      const r     = this.radius * alpha;
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.fillStyle = this.color;
      ctx.shadowColor = this.color;
      ctx.shadowBlur = r * 3;
      ctx.beginPath();
      ctx.arc(this.x, this.y, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }

  /** Grab a pooled particle or create a new one */
  function acquire() {
    for (let i = 0; i < pool.length; i++) {
      if (!pool[i].alive) return pool[i];
    }
    const p = new Particle();
    pool.push(p);
    return p;
  }

  /**
   * Colorful burst explosion at (x, y).
   * @param {number}   x
   * @param {number}   y
   * @param {string}   color   — primary neon colour of the destroyed target
   * @param {number}  [count]  — particle count (default 28)
   */
  function burst(x, y, color, count = 28) {
    // Neon secondary colours for variety
    const palette = [color, '#ffffff', lighten(color), '#ffff00'];

    for (let i = 0; i < count; i++) {
      const angle = (Math.PI * 2 * i) / count + (Math.random() - 0.5) * 0.8;
      const speed = 120 + Math.random() * 340;
      const r     = 2 + Math.random() * 4;
      const life  = 0.35 + Math.random() * 0.45;
      const c     = palette[Math.floor(Math.random() * palette.length)];

      acquire().spawn(
        x + (Math.random() - 0.5) * 8,
        y + (Math.random() - 0.5) * 8,
        c,
        Math.cos(angle) * speed,
        Math.sin(angle) * speed - 60, // slight upward bias
        r,
        life,
        300
      );
    }

    // A few longer-lived "spark" trails
    for (let i = 0; i < 6; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 60 + Math.random() * 180;
      acquire().spawn(
        x, y, '#ffffff',
        Math.cos(angle) * speed,
        Math.sin(angle) * speed,
        1.5,
        0.6 + Math.random() * 0.4,
        120
      );
    }
  }

  /**
   * Small muzzle-flash ring at the crosshair position.
   */
  function muzzleFlash(x, y) {
    for (let i = 0; i < 10; i++) {
      const angle = (Math.PI * 2 * i) / 10;
      const speed = 80 + Math.random() * 120;
      acquire().spawn(
        x, y,
        '#ffffc0',
        Math.cos(angle) * speed,
        Math.sin(angle) * speed,
        2.5,
        0.08 + Math.random() * 0.06,
        0   // no gravity for flash
      );
    }
  }

  function update(dt) {
    for (let i = 0; i < pool.length; i++) {
      if (pool[i].alive) pool[i].update(dt);
    }
  }

  function draw(ctx) {
    for (let i = 0; i < pool.length; i++) {
      if (pool[i].alive) pool[i].draw(ctx);
    }
  }

  /** Lighten a hex colour toward white (very naive) */
  function lighten(hex) {
    const r = Math.min(255, parseInt(hex.slice(1, 3), 16) + 80);
    const g = Math.min(255, parseInt(hex.slice(3, 5), 16) + 80);
    const b = Math.min(255, parseInt(hex.slice(5, 7), 16) + 80);
    return `#${r.toString(16).padStart(2,'0')}${g.toString(16).padStart(2,'0')}${b.toString(16).padStart(2,'0')}`;
  }

  return { burst, muzzleFlash, update, draw };
})();
