/**
 * AudioSystem — Web Audio API synthesized sound effects.
 * Lazy-initialises AudioContext on first call (required by browsers
 * that block audio before user interaction).
 */
const AudioSystem = (() => {
  let ctx = null;

  function init() {
    if (ctx) return;
    ctx = new (window.AudioContext || window.webkitAudioContext)();
  }

  /** Resume context if suspended (needed after tab focus changes) */
  function ensureRunning() {
    if (ctx && ctx.state === 'suspended') ctx.resume();
  }

  /**
   * Gunshot: layered noise burst + pitched punch
   * Anatomy: cracky high-frequency transient + low-mid thump, fast decay
   */
  function playGunshot() {
    init();
    ensureRunning();
    const now = ctx.currentTime;

    // ── Noise layer (crack / pop) ──────────────────────────────────
    const crackLen = Math.floor(ctx.sampleRate * 0.18);
    const crackBuf = ctx.createBuffer(1, crackLen, ctx.sampleRate);
    const crackData = crackBuf.getChannelData(0);
    for (let i = 0; i < crackLen; i++) {
      const t = i / crackLen;
      // Exponential decay envelope on white noise
      crackData[i] = (Math.random() * 2 - 1) * Math.exp(-t * 18);
    }

    const noiseSrc = ctx.createBufferSource();
    noiseSrc.buffer = crackBuf;

    const hpf = ctx.createBiquadFilter();
    hpf.type = 'highpass';
    hpf.frequency.value = 1200;
    hpf.Q.value = 0.5;

    const lpf = ctx.createBiquadFilter();
    lpf.type = 'lowpass';
    lpf.frequency.setValueAtTime(6000, now);
    lpf.frequency.exponentialRampToValueAtTime(300, now + 0.12);

    const noiseGain = ctx.createGain();
    noiseGain.gain.setValueAtTime(1.0, now);
    noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 0.18);

    noiseSrc.connect(hpf);
    hpf.connect(lpf);
    lpf.connect(noiseGain);
    noiseGain.connect(ctx.destination);
    noiseSrc.start(now);

    // ── Tonal punch (low-end thump) ────────────────────────────────
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(180, now);
    osc.frequency.exponentialRampToValueAtTime(28, now + 0.09);

    const distortion = ctx.createWaveShaper();
    distortion.curve = makeDistortionCurve(120);

    const punchGain = ctx.createGain();
    punchGain.gain.setValueAtTime(0.7, now);
    punchGain.gain.exponentialRampToValueAtTime(0.001, now + 0.09);

    osc.connect(distortion);
    distortion.connect(punchGain);
    punchGain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.09);
  }

  /**
   * Hit explosion: short burst of low-frequency filtered noise
   */
  function playExplosion() {
    init();
    ensureRunning();
    const now = ctx.currentTime;

    const len = Math.floor(ctx.sampleRate * 0.25);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) {
      const t = i / len;
      data[i] = (Math.random() * 2 - 1) * Math.pow(1 - t, 1.4);
    }

    const src = ctx.createBufferSource();
    src.buffer = buf;

    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(900, now);
    lp.frequency.exponentialRampToValueAtTime(80, now + 0.2);

    const g = ctx.createGain();
    g.gain.setValueAtTime(0.45, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.25);

    src.connect(lp);
    lp.connect(g);
    g.connect(ctx.destination);
    src.start(now);
  }

  /** Waveshaper curve for mild saturation on the punch oscillator */
  function makeDistortionCurve(amount) {
    const samples = 256;
    const curve = new Float32Array(samples);
    for (let i = 0; i < samples; i++) {
      const x = (i * 2) / samples - 1;
      curve[i] = ((Math.PI + amount) * x) / (Math.PI + amount * Math.abs(x));
    }
    return curve;
  }

  return { init, playGunshot, playExplosion };
})();
