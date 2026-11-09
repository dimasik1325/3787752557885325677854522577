// Процедурные звуки на WebAudio — без внешних файлов.
export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.enabled = true;
    this.masterGain = null;
    this.volume = 0.55;
    this.stepTimer = 0;
  }

  ensure() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return this.ctx;
    }
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) {
      this.enabled = false;
      return null;
    }
    this.ctx = new Ctx();
    this.masterGain = this.ctx.createGain();
    this.masterGain.gain.value = this.volume;
    this.masterGain.connect(this.ctx.destination);
    return this.ctx;
  }

  setVolume(v) {
    this.volume = v;
    if (this.masterGain) this.masterGain.gain.value = v;
  }

  noiseBuffer(duration = 0.4) {
    const ctx = this.ctx;
    const rate = ctx.sampleRate;
    const buffer = ctx.createBuffer(1, Math.floor(rate * duration), rate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) {
      data[i] = Math.random() * 2 - 1;
    }
    return buffer;
  }

  /** Шум с фильтром и огибающей */
  noiseHit({ duration = 0.18, freq = 800, q = 1, type = 'bandpass', gain = 0.3, decay = 2.5, freqEnd = null }) {
    const ctx = this.ensure();
    if (!ctx || !this.enabled) return;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer(duration + 0.05);
    const filter = ctx.createBiquadFilter();
    filter.type = type;
    filter.frequency.setValueAtTime(freq, ctx.currentTime);
    if (freqEnd) filter.frequency.exponentialRampToValueAtTime(Math.max(40, freqEnd), ctx.currentTime + duration);
    filter.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + duration * decay * 0.5);
    src.connect(filter);
    filter.connect(g);
    g.connect(this.masterGain);
    src.start();
    src.stop(ctx.currentTime + duration + 0.05);
  }

  tone({ freq = 440, duration = 0.2, type = 'sine', gain = 0.2, freqEnd = null, delay = 0 }) {
    const ctx = this.ensure();
    if (!ctx || !this.enabled) return;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    const t0 = ctx.currentTime + delay;
    osc.frequency.setValueAtTime(freq, t0);
    if (freqEnd) osc.frequency.exponentialRampToValueAtTime(Math.max(20, freqEnd), t0 + duration);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(gain, t0 + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
    osc.connect(g);
    g.connect(this.masterGain);
    osc.start(t0);
    osc.stop(t0 + duration + 0.02);
  }

  material(material) {
    switch (material) {
      case 'snow':
      case 'wool':
        return { freq: 420, q: 0.7, gain: 0.18 };
      case 'stone':
        return { freq: 1200, q: 2.5, gain: 0.35 };
      case 'wood':
        return { freq: 620, q: 3.5, gain: 0.3 };
      case 'sand':
        return { freq: 2600, q: 0.8, gain: 0.16 };
      case 'grass':
      case 'plant':
        return { freq: 2400, q: 1.0, gain: 0.12 };
      case 'glass':
        return { freq: 3200, q: 4, gain: 0.25 };
      case 'water':
        return { freq: 900, q: 0.6, gain: 0.2 };
      default:
        return { freq: 900, q: 1.5, gain: 0.25 };
    }
  }

  breakBlock(material = 'stone') {
    const m = this.material(material);
    this.noiseHit({ duration: 0.22, freq: m.freq, q: m.q, gain: m.gain, decay: 2.2 });
    if (material === 'glass') {
      this.tone({ freq: 2200, duration: 0.12, type: 'triangle', gain: 0.08, freqEnd: 3400 });
    }
  }

  placeBlock(material = 'stone') {
    const m = this.material(material);
    this.noiseHit({ duration: 0.12, freq: m.freq * 0.8, q: m.q * 1.5, gain: m.gain * 0.8, decay: 3 });
  }

  step(material = 'grass') {
    const m = this.material(material);
    this.noiseHit({ duration: 0.09, freq: m.freq * 0.55, q: 0.9, gain: m.gain * 0.45, decay: 3.5, type: 'lowpass' });
  }

  jump() {
    this.tone({ freq: 300, duration: 0.1, type: 'sine', gain: 0.06, freqEnd: 480 });
  }

  hurt() {
    this.tone({ freq: 260, duration: 0.22, type: 'square', gain: 0.12, freqEnd: 120 });
  }

  splash() {
    this.noiseHit({ duration: 0.4, freq: 1200, q: 0.5, gain: 0.28, decay: 2, type: 'lowpass', freqEnd: 300 });
  }

  explosion() {
    this.noiseHit({ duration: 1.4, freq: 220, q: 0.4, gain: 0.65, decay: 1.6, type: 'lowpass', freqEnd: 45 });
    this.tone({ freq: 90, duration: 0.9, type: 'sine', gain: 0.35, freqEnd: 25 });
  }

  pickup() {
    this.tone({ freq: 660, duration: 0.08, type: 'triangle', gain: 0.1 });
    this.tone({ freq: 990, duration: 0.1, type: 'triangle', gain: 0.09, delay: 0.07 });
  }

  craft() {
    this.tone({ freq: 520, duration: 0.1, type: 'square', gain: 0.07 });
    this.tone({ freq: 780, duration: 0.12, type: 'square', gain: 0.07, delay: 0.09 });
  }

  uiClick() {
    this.tone({ freq: 800, duration: 0.05, type: 'square', gain: 0.05 });
  }

  mobHurt() {
    this.tone({ freq: 180, duration: 0.16, type: 'sawtooth', gain: 0.08, freqEnd: 90 });
  }

  /** Шаги по таймеру дистанции */
  updateFootsteps(dt, player, material) {
    if (!player.isMoving || !player.onGround || player.flying) {
      this.stepTimer = 0.1;
      return;
    }
    const speed = Math.hypot(player.velocity.x, player.velocity.z);
    this.stepTimer -= dt * speed;
    if (this.stepTimer <= 0) {
      this.stepTimer = player.sprinting ? 1.9 : 2.4;
      this.step(material);
    }
  }

  /** Фоновая «музыка» — мягкие пэды (очень тихо) */
  startAmbient() {
    const ctx = this.ensure();
    if (!ctx || this.ambientNode) return;
    const g = ctx.createGain();
    g.gain.value = 0.0;
    g.connect(this.masterGain);
    const notes = [110, 164.81, 220, 277.18];
    const oscs = notes.map((f) => {
      const o = ctx.createOscillator();
      o.type = 'sine';
      o.frequency.value = f;
      const og = ctx.createGain();
      og.gain.value = 0.045;
      o.connect(og);
      og.connect(g);
      o.start();
      return { o, og };
    });
    // медленная модуляция громкости
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.04;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 0.02;
    lfo.connect(lfoGain);
    lfoGain.connect(g.gain);
    lfo.start();
    g.gain.setTargetAtTime(0.12, ctx.currentTime, 4);
    this.ambientNode = { g, oscs, lfo };
  }

  setAmbientMood(night) {
    if (!this.ambientNode) return;
    const target = night ? 0.2 : 0.1;
    this.ambientNode.g.gain.setTargetAtTime(target, this.ctx.currentTime, 3);
  }

  stopAmbient() {
    if (!this.ambientNode) return;
    this.ambientNode.g.gain.setTargetAtTime(0, this.ctx.currentTime, 0.5);
    setTimeout(() => {
      this.ambientNode?.oscs.forEach(({ o }) => o.stop());
      this.ambientNode?.lfo.stop();
      this.ambientNode = null;
    }, 1500);
  }
}

/** Определяет материал блока для звука */
export function soundMaterialFor(block) {
  if (!block) return 'stone';
  if (block.name.includes('wool')) return 'wool';
  if (block.name.includes('snow') || block.name === 'ice') return 'snow';
  if (block.name.includes('glass')) return 'glass';
  if (block.name.includes('log') || block.name === 'planks') return 'wood';
  if (block.name.includes('sand') || block.name === 'gravel') return 'sand';
  if (block.cross) return 'plant';
  if (block.name === 'grass' || block.name === 'dirt' || block.name === 'leaves') return 'grass';
  return 'stone';
}
