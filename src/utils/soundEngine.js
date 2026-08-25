// src/utils/soundEngine.js — LIVESCORE PRO — Auto + Smooth + Haptics
// Intentionally automatic for livescore app — plays on goal/whistle/kickoff without user clicking sound button
// Smooth: uses master compressor, low latency, anti-spam queue, haptic fallback

export const Sound = {
  ctx: null,
  masterGain: null,
  compressor: null,
  on: true,
  type: 'whistle', // whistle | cheer | horn | silent
  volume: 0.7, // 0-1
  _lg: 0,
  _lw: 0,
  _lk: 0,
  _unlocked: false,
  _queue: [],

  _init() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return true;
    }
    try {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)({ latencyHint: 'interactive', sampleRate: 44100 });
      
      // Master chain: gain -> compressor -> destination = smoother, louder, no clipping
      this.compressor = this.ctx.createDynamicsCompressor();
      this.compressor.threshold.value = -24;
      this.compressor.knee.value = 30;
      this.compressor.ratio.value = 12;
      this.compressor.attack.value = 0.003;
      this.compressor.release.value = 0.25;

      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.value = this.volume;

      this.masterGain.connect(this.compressor);
      this.compressor.connect(this.ctx.destination);
      return true;
    } catch { return false; }
  },

  // Auto-unlock on first interaction — call once in App.jsx
  unlock() {
    if (this._unlocked) return;
    this._init();
    const unlock = () => {
      if (this.ctx?.state === 'suspended') this.ctx.resume();
      this._unlocked = true;
      // Warm up context with silent buffer to reduce first-play latency
      try {
        const buf = this.ctx.createBuffer(1, 1, 22050);
        const src = this.ctx.createBufferSource();
        src.buffer = buf;
        src.connect(this.ctx.destination);
        src.start(0);
      } catch {}
      document.removeEventListener('click', unlock);
      document.removeEventListener('touchstart', unlock);
      document.removeEventListener('keydown', unlock);
      document.removeEventListener('pointerdown', unlock);
    };
    // Try unlock immediately (may fail until gesture, but we listen)
    unlock();
    document.addEventListener('click', unlock, { once: true, passive: true });
    document.addEventListener('touchstart', unlock, { once: true, passive: true });
    document.addEventListener('keydown', unlock, { once: true });
    document.addEventListener('pointerdown', unlock, { once: true, passive: true });

    // Auto-pause when tab hidden to save battery
    document.addEventListener('visibilitychange', () => {
      if (document.hidden && this.ctx?.state === 'running') this.ctx.suspend();
      else if (!document.hidden && this.ctx?.state === 'suspended' && this._unlocked) this.ctx.resume();
    });
  },

  setVolume(v) {
    this.volume = Math.max(0, Math.min(1, v));
    if (this.masterGain) this.masterGain.gain.linearRampToValueAtTime(this.volume, this.ctx.currentTime + 0.05);
  },

  setType(t) { this.type = t; },

  // Haptics for mobile — vibrate on goal if sound blocked
  _haptic(pattern) {
    try { if (navigator.vibrate) navigator.vibrate(pattern); } catch {}
  },

  _connect(node) {
    if (this.masterGain) node.connect(this.masterGain);
    else node.connect(this.ctx.destination);
    return node;
  },

  // Public API — called automatically by live engine
  goal() {
    if (!this.on || this.type === 'silent') { this._haptic([100, 50, 100]); return; }
    if (!this._init()) return;
    if (Date.now() - this._lg < 1800) return; // anti-spam 1.8s
    this._lg = Date.now();
    this._haptic([80, 40, 80, 40, 120]);

    if (this.type === 'whistle') this._playWhistleSmooth();
    else if (this.type === 'cheer') this._playCheerSmooth();
    else if (this.type === 'horn') this._playHornSmooth();
  },

  whistle(type = 'ft') {
    if (!this.on || this.type === 'silent' || !this._init()) return;
    if (Date.now() - this._lw < 2500) return;
    this._lw = Date.now();
    this._haptic(type === 'ht' ? [60] : [60, 100, 60]);

    const t = this.ctx.currentTime;
    const freq = type === 'ht' ? 2600 : 3100;
    const dur = type === 'ht' ? 0.55 : 0.85;

    const playTone = (start, f) => {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      const lfo = this.ctx.createOscillator();
      const lfoGain = this.ctx.createGain();

      osc.type = 'sine';
      osc.frequency.value = f;
      lfo.type = 'sine';
      lfo.frequency.value = 5.5;
      lfoGain.gain.value = 80;

      lfo.connect(lfoGain);
      lfoGain.connect(osc.frequency);

      // Smooth ADSR — no click
      gain.gain.setValueAtTime(0, start);
      gain.gain.linearRampToValueAtTime(0.22, start + 0.03);
      gain.gain.setValueAtTime(0.22, start + dur - 0.08);
      gain.gain.exponentialRampToValueAtTime(0.001, start + dur);

      this._connect(gain);
      osc.connect(gain);
      osc.start(start);
      osc.stop(start + dur + 0.05);
      lfo.start(start);
      lfo.stop(start + dur + 0.05);
    };

    playTone(t, freq);
    if (type === 'ft') playTone(t + dur + 0.12, freq * 1.08);
  },

  kickoff() {
    if (!this.on || this.type === 'silent' || !this._init()) return;
    if (Date.now() - this._lk < 2000) return;
    this._lk = Date.now();
    this._haptic([30]);

    const t = this.ctx.currentTime;
    const len = this.ctx.sampleRate * 0.18;
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) {
      // Band-limited noise
      data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 1.5) * 0.7;
    }
    const src = this.ctx.createBufferSource();
    const bp = this.ctx.createBiquadFilter();
    const gain = this.ctx.createGain();
    src.buffer = buf;
    bp.type = 'bandpass';
    bp.frequency.setValueAtTime(1800, t);
    bp.frequency.exponentialRampToValueAtTime(600, t + 0.18);
    bp.Q.value = 1.8;
    gain.gain.setValueAtTime(0.18, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.18);
    src.connect(bp);
    bp.connect(gain);
    this._connect(gain);
    src.start(t);
  },

  // Smooth variants — no harsh sawtooth
  _playWhistleSmooth() {
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    // Triangle = smoother than sawtooth
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(380, t);
    osc.frequency.exponentialRampToValueAtTime(920, t + 0.18);
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(0.2, t + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.32);
    osc.connect(gain);
    this._connect(gain);
    osc.start(t);
    osc.stop(t + 0.32);
  },

  _playHornSmooth() {
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sine'; // sine = smooth horn
    osc.frequency.setValueAtTime(140, t);
    osc.frequency.linearRampToValueAtTime(160, t + 0.1);
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(0.28, t + 0.05);
    gain.gain.setValueAtTime(0.28, t + 0.4);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.7);
    osc.connect(gain);
    this._connect(gain);
    osc.start(t);
    osc.stop(t + 0.7);
  },

  _playCheerSmooth() {
    const t = this.ctx.currentTime;
    const len = this.ctx.sampleRate * 0.9;
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) {
      d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 0.8) * 0.5;
    }
    const src = this.ctx.createBufferSource();
    const hp = this.ctx.createBiquadFilter();
    const gain = this.ctx.createGain();
    src.buffer = buf;
    hp.type = 'highpass';
    hp.frequency.value = 900;
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(0.22, t + 0.05);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.9);
    src.connect(hp);
    hp.connect(gain);
    this._connect(gain);
    src.start(t);
  },
};

// Auto-init helper — import this in App.jsx once
// import { Sound } from './utils/soundEngine'; Sound.unlock();
