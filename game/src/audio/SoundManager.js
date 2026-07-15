/**
 * Procedural sound engine — Web Audio API
 * Sci-fi + Minecraft-adjacent blocky beeps, mining, thrusters, atmosphere entry
 */
export class SoundManager {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.enabled = true;
    this.ambientNodes = [];
    this.thrusterGain = null;
    this.thrusterOsc = null;
  }

  async init() {
    if (this.ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.45;
    this.master.connect(this.ctx.destination);
    this._startAmbient();
  }

  async resume() {
    await this.init();
    if (this.ctx.state === 'suspended') await this.ctx.resume();
  }

  _now() {
    return this.ctx.currentTime;
  }

  _env(gain, t0, a = 0.01, d = 0.15, v = 0.3) {
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.exponentialRampToValueAtTime(v, t0 + a);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + a + d);
  }

  _tone(freq, dur, type = 'square', vol = 0.2, detune = 0) {
    if (!this.ctx || !this.enabled) return;
    const t0 = this._now();
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    osc.detune.value = detune;
    this._env(gain, t0, 0.008, dur, vol);
    osc.connect(gain);
    gain.connect(this.master);
    osc.start(t0);
    osc.stop(t0 + dur + 0.05);
  }

  _noise(dur, vol = 0.15, filterFreq = 1200) {
    if (!this.ctx || !this.enabled) return;
    const t0 = this._now();
    const len = Math.floor(this.ctx.sampleRate * dur);
    const buffer = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    const src = this.ctx.createBufferSource();
    src.buffer = buffer;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = filterFreq;
    filter.Q.value = 0.8;
    const gain = this.ctx.createGain();
    this._env(gain, t0, 0.005, dur * 0.9, vol);
    src.connect(filter);
    filter.connect(gain);
    gain.connect(this.master);
    src.start(t0);
  }

  uiClick() {
    this._tone(880, 0.06, 'square', 0.12);
    this._tone(1320, 0.08, 'square', 0.08);
  }

  uiOpen() {
    this._tone(220, 0.1, 'sawtooth', 0.1);
    this._tone(440, 0.12, 'square', 0.08);
  }

  uiClose() {
    this._tone(440, 0.08, 'square', 0.08);
    this._tone(220, 0.1, 'triangle', 0.06);
  }

  mine(hard = false) {
    this._noise(hard ? 0.12 : 0.08, hard ? 0.22 : 0.14, hard ? 600 : 900);
    this._tone(hard ? 120 : 180, 0.05, 'square', 0.1);
  }

  collect() {
    this._tone(660, 0.05, 'square', 0.1);
    this._tone(990, 0.08, 'square', 0.08);
    this._tone(1320, 0.1, 'triangle', 0.06);
  }

  craft() {
    [440, 554, 659, 880].forEach((f, i) => {
      setTimeout(() => this._tone(f, 0.1, 'square', 0.1), i * 60);
    });
  }

  scan() {
    if (!this.ctx || !this.enabled) return;
    const t0 = this._now();
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(200, t0);
    osc.frequency.exponentialRampToValueAtTime(1800, t0 + 0.45);
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.exponentialRampToValueAtTime(0.12, t0 + 0.05);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.5);
    osc.connect(gain);
    gain.connect(this.master);
    osc.start(t0);
    osc.stop(t0 + 0.55);
    this._noise(0.4, 0.06, 2000);
  }

  footstep() {
    this._noise(0.05, 0.08, 400);
    this._tone(80, 0.04, 'triangle', 0.05);
  }

  jetpack() {
    this._noise(0.08, 0.06, 800);
  }

  shipEnter() {
    this._tone(150, 0.2, 'sawtooth', 0.12);
    this._tone(300, 0.25, 'square', 0.08);
    this._noise(0.3, 0.1, 500);
  }

  shipRepair() {
    this.craft();
    setTimeout(() => this._tone(520, 0.2, 'triangle', 0.15), 280);
  }

  liftoff() {
    if (!this.ctx || !this.enabled) return;
    const t0 = this._now();
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(60, t0);
    osc.frequency.exponentialRampToValueAtTime(200, t0 + 2);
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.exponentialRampToValueAtTime(0.18, t0 + 0.3);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + 2.5);
    osc.connect(gain);
    gain.connect(this.master);
    osc.start(t0);
    osc.stop(t0 + 2.6);
    this._noise(2, 0.12, 300);
  }

  setThruster(active, intensity = 0.5) {
    if (!this.ctx || !this.enabled) return;
    if (active) {
      if (!this.thrusterOsc) {
        this.thrusterOsc = this.ctx.createOscillator();
        this.thrusterGain = this.ctx.createGain();
        const filter = this.ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.value = 400;
        this.thrusterOsc.type = 'sawtooth';
        this.thrusterOsc.frequency.value = 55;
        this.thrusterGain.gain.value = 0.0001;
        this.thrusterOsc.connect(filter);
        filter.connect(this.thrusterGain);
        this.thrusterGain.connect(this.master);
        this.thrusterOsc.start();
        this._thrusterFilter = filter;
      }
      const g = 0.04 + intensity * 0.1;
      this.thrusterGain.gain.linearRampToValueAtTime(g, this._now() + 0.1);
      this.thrusterOsc.frequency.linearRampToValueAtTime(55 + intensity * 80, this._now() + 0.1);
    } else if (this.thrusterGain) {
      this.thrusterGain.gain.linearRampToValueAtTime(0.0001, this._now() + 0.2);
    }
  }

  atmosphereEntry() {
    if (!this.ctx || !this.enabled) return;
    const t0 = this._now();
    // Rising roar
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(40, t0);
    osc.frequency.exponentialRampToValueAtTime(180, t0 + 3);
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.exponentialRampToValueAtTime(0.22, t0 + 0.5);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + 4);
    osc.connect(gain);
    gain.connect(this.master);
    osc.start(t0);
    osc.stop(t0 + 4.1);

    // Crackling heat
    for (let i = 0; i < 12; i++) {
      setTimeout(() => this._noise(0.15, 0.1, 1500 + Math.random() * 1000), i * 200);
    }
    // Blocky digital chirps (Minecraft fusion)
    for (let i = 0; i < 8; i++) {
      setTimeout(() => this._tone(200 + i * 100, 0.06, 'square', 0.08), 400 + i * 180);
    }
  }

  missionComplete() {
    [523, 659, 784, 1046].forEach((f, i) => {
      setTimeout(() => this._tone(f, 0.25, 'triangle', 0.14), i * 120);
    });
  }

  hazardWarning() {
    this._tone(320, 0.15, 'square', 0.1);
    setTimeout(() => this._tone(280, 0.15, 'square', 0.1), 180);
  }

  _startAmbient() {
    if (!this.ctx) return;
    // Soft space drone
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = 55;
    gain.gain.value = 0.025;
    osc.connect(gain);
    gain.connect(this.master);
    osc.start();
    this.ambientNodes.push(osc, gain);

    const osc2 = this.ctx.createOscillator();
    const gain2 = this.ctx.createGain();
    osc2.type = 'triangle';
    osc2.frequency.value = 82.5;
    gain2.gain.value = 0.015;
    osc2.connect(gain2);
    gain2.connect(this.master);
    osc2.start();
    this.ambientNodes.push(osc2, gain2);
  }
}

export const sound = new SoundManager();
