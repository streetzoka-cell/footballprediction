// src/utils/soundEngine.js
export const Sound = {
  ctx: null,
  on: true,
  _lg: 0,
  _lw: 0,

  _init() {
    if (!this.ctx) {
      try {
        this.ctx = new (window.AudioContext || window.webkitAudioContext)();
      } catch {
        return false;
      }
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
    return !!this.ctx;
  },

  goal() {
    if (!this.on || !this._init()) return;
    if (Date.now() - this._lg < 2000) return;
    this._lg = Date.now();
    const t = this.ctx.currentTime;
    const w = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    w.type = 'sawtooth';
    w.frequency.setValueAtTime(180, t);
    w.frequency.exponentialRampToValueAtTime(600, t + 0.12);
    g.gain.setValueAtTime(0.04, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.18);
    w.connect(g);
    g.connect(this.ctx.destination);
    w.start(t);
    w.stop(t + 0.2);
  },

  whistle(type = 'ft') {
    if (!this.on || !this._init()) return;
    if (Date.now() - this._lw < 3000) return;
    this._lw = Date.now();
    const t = this.ctx.currentTime;
    const freq = type === 'ht' ? 2800 : 3200;
    const dur = type === 'ht' ? 0.6 : 0.9;

    const play = (start) => {
      const o = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      const lfo = this.ctx.createOscillator();
      const lg = this.ctx.createGain();
      o.type = 'sine';
      o.frequency.value = freq;
      lfo.type = 'sine';
      lfo.frequency.value = 6;
      lg.gain.value = 80;
      lfo.connect(lg);
      lg.connect(o.frequency);
      g.gain.setValueAtTime(0, start);
      g.gain.linearRampToValueAtTime(0.08, start + 0.05);
      g.gain.setValueAtTime(0.08, start + dur - 0.1);
      g.gain.exponentialRampToValueAtTime(0.001, start + dur);
      o.connect(g);
      g.connect(this.ctx.destination);
      o.start(start);
      o.stop(start + dur + 0.05);
      lfo.start(start);
      lfo.stop(start + dur + 0.05);
    };

    play(t);
    if (type === 'ft') play(t + dur + 0.15);
  },

  kickoff() {
    if (!this.on || !this._init()) return;
    const t = this.ctx.currentTime;
    const bs = this.ctx.sampleRate * 0.15;
    const buf = this.ctx.createBuffer(1, bs, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < bs; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / bs);
    const src = this.ctx.createBufferSource();
    const flt = this.ctx.createBiquadFilter();
    const g = this.ctx.createGain();
    src.buffer = buf;
    flt.type = 'bandpass';
    flt.frequency.setValueAtTime(2000, t);
    flt.frequency.exponentialRampToValueAtTime(500, t + 0.15);
    flt.Q.value = 2;
    g.gain.setValueAtTime(0.06, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.15);
    src.connect(flt);
    flt.connect(g);
    g.connect(this.ctx.destination);
    src.start(t);
  }
};