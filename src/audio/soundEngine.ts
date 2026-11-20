import type { RarityTier } from '../games/next-stop/types';

class ArcadeSoundEngine {
  private ctx: AudioContext | null = null;
  private muted: boolean = false;
  private windSource: AudioBufferSourceNode | null = null;
  private windGain: GainNode | null = null;
  private windFilter: BiquadFilterNode | null = null;
  private menuLoopId: number | null = null;
  private menuStep: number = 0;

  private ensureContext(): AudioContext | null {
    if (this.muted) return null;
    if (typeof window === 'undefined') return null;
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;
    if (!AudioCtx) return null;
    if (!this.ctx) {
      try {
        this.ctx = new AudioCtx();
      } catch {
        return null;
      }
    }
    if (this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
    return this.ctx;
  }

  public setMuted(muted: boolean) {
    this.muted = muted;
    if (muted) {
      this.stopWind();
      this.stopMenuLoop();
    }
  }

  public isMuted(): boolean {
    return this.muted;
  }

  private playTone(
    freq: number,
    duration: number,
    type: OscillatorType = 'square',
    gainVal: number = 0.08,
    delay: number = 0,
    slideToFreq?: number,
  ) {
    const ctx = this.ensureContext();
    if (!ctx) return;

    const now = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, now);
    if (slideToFreq) {
      osc.frequency.exponentialRampToValueAtTime(
        Math.max(20, slideToFreq),
        now + duration,
      );
    }

    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.linearRampToValueAtTime(gainVal, now + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + duration + 0.02);
  }

  public playStationChime() {
    // Classic 3-note British/European station tannoy chime
    this.playTone(784, 0.24, 'triangle', 0.09, 0);
    this.playTone(659.25, 0.24, 'triangle', 0.09, 0.17);
    this.playTone(523.25, 0.42, 'triangle', 0.1, 0.34);
  }

  public playDoorChime() {
    this.playTone(659.25, 0.12, 'triangle', 0.06, 0);
    this.playTone(880, 0.2, 'triangle', 0.06, 0.1);
  }

  public playStationTick() {
    // Crisp railway signal click as train passes a skipped station
    this.playTone(920, 0.055, 'triangle', 0.05, 0, 1180);
  }

  public playBoardFlip() {
    const jitter = 0.94 + Math.random() * 0.12;
    this.playTone(210 * jitter, 0.045, 'square', 0.045, 0, 110 * jitter);
  }

  public playUiClick() {
    this.playTone(520, 0.06, 'square', 0.045, 0, 680);
  }

  public playTrainHorn(tier: RarityTier) {
    switch (tier) {
      case 'INVALID':
        // Sad descending platform buzzer
        this.playTone(233, 0.22, 'sawtooth', 0.07, 0, 185);
        this.playTone(175, 0.34, 'sawtooth', 0.07, 0.22, 130);
        break;
      case 'COMMON':
        // Wheezy stopping-service horn
        this.playTone(392, 0.36, 'triangle', 0.08, 0, 415);
        this.playTone(493.88, 0.36, 'triangle', 0.06, 0.03, 515);
        break;
      case 'FAKE_DEEP':
        // Gravelly local diesel horn
        this.playTone(185, 0.36, 'sawtooth', 0.07, 0);
        this.playTone(233, 0.36, 'sawtooth', 0.06, 0);
        break;
      case 'UNCOMMON':
        // Two-tone semi-fast horn
        this.playTone(392, 0.18, 'square', 0.06, 0);
        this.playTone(493.88, 0.34, 'square', 0.06, 0.18);
        break;
      case 'RARE':
        // Express dual chord
        this.playTone(329.63, 0.45, 'sawtooth', 0.06, 0);
        this.playTone(415.3, 0.45, 'sawtooth', 0.06, 0);
        this.playTone(659.25, 0.35, 'triangle', 0.06, 0.08);
        break;
      case 'LEGENDARY':
        // Shimmering non-stop bullet fanfare horn
        this.playTone(523.25, 0.45, 'triangle', 0.08, 0, 1046.5);
        this.playTone(659.25, 0.5, 'sine', 0.08, 0.06);
        this.playTone(783.99, 0.55, 'square', 0.05, 0.12);
        this.playTone(1046.5, 0.65, 'triangle', 0.08, 0.18);
        break;
    }
  }

  public playTierFanfare(tier: RarityTier) {
    if (tier === 'INVALID') {
      this.playTone(220, 0.18, 'square', 0.06, 0);
      this.playTone(196, 0.25, 'square', 0.06, 0.16);
      return;
    }
    const notesByTier: Record<Exclude<RarityTier, 'INVALID'>, number[]> = {
      COMMON: [392, 493.88],
      FAKE_DEEP: [349.23, 392, 349.23],
      UNCOMMON: [392, 493.88, 587.33],
      RARE: [440, 554.37, 659.25, 880],
      LEGENDARY: [523.25, 659.25, 783.99, 1046.5, 1318.5],
    };
    const notes = notesByTier[tier];
    notes.forEach((n, idx) => {
      this.playTone(n, 0.2, idx === notes.length - 1 ? 'triangle' : 'square', 0.065, idx * 0.09);
    });
  }

  public setWindIntensity(level: number) {
    if (this.muted || level <= 0.01) {
      this.stopWind();
      return;
    }
    const ctx = this.ensureContext();
    if (!ctx) return;

    if (!this.windSource) {
      const bufferSize = ctx.sampleRate * 2;
      const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        data[i] = Math.random() * 2 - 1;
      }

      const src = ctx.createBufferSource();
      src.buffer = buffer;
      src.loop = true;

      const filter = ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.value = 420 + level * 700;
      filter.Q.value = 1.4;

      const gain = ctx.createGain();
      gain.gain.value = 0.001;

      src.connect(filter);
      filter.connect(gain);
      gain.connect(ctx.destination);
      src.start();

      this.windSource = src;
      this.windFilter = filter;
      this.windGain = gain;
    }

    if (this.windFilter && this.windGain) {
      const now = ctx.currentTime;
      this.windFilter.frequency.setTargetAtTime(380 + level * 900, now, 0.15);
      this.windGain.gain.setTargetAtTime(0.016 + level * 0.032, now, 0.15);
    }
  }

  public stopWind() {
    if (this.windSource) {
      try {
        this.windSource.stop();
        this.windSource.disconnect();
      } catch {
        // ignore
      }
      this.windSource = null;
      this.windFilter = null;
      this.windGain = null;
    }
  }

  public startMenuLoop() {
    if (this.muted || this.menuLoopId !== null) return;
    const melody = [
      392.0, 0, 493.88, 587.33, 0, 523.25, 493.88, 392.0,
      329.63, 0, 392.0, 440.0, 0, 493.88, 440.0, 392.0,
    ];
    const bass = [
      196.0, 0, 196.0, 0, 164.81, 0, 164.81, 0,
      146.83, 0, 146.83, 0, 196.0, 0, 146.83, 0,
    ];

    this.menuLoopId = window.setInterval(() => {
      if (this.muted) return;
      const step = this.menuStep % melody.length;
      const note = melody[step];
      const bNote = bass[step];
      if (note > 0) {
        this.playTone(note, 0.16, 'triangle', 0.032, 0);
      }
      if (bNote > 0) {
        this.playTone(bNote, 0.18, 'square', 0.018, 0);
      }
      this.menuStep++;
    }, 220);
  }

  public stopMenuLoop() {
    if (this.menuLoopId !== null) {
      window.clearInterval(this.menuLoopId);
      this.menuLoopId = null;
    }
  }
}

export const soundEngine = new ArcadeSoundEngine();
