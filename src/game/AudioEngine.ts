/**
 * Web Audio API Procedural Audio Engine for Zelda-inspired Fantasy Open World
 * Generates dynamic music, atmospheric ambient noise, and retro-modern game SFX.
 */

class WebAudioEngine {
  private ctx: AudioContext | null = null;
  private isInitialized = false;
  private masterGain: GainNode | null = null;
  private musicGain: GainNode | null = null;
  private sfxGain: GainNode | null = null;

  // Music state
  private musicInterval: any = null;
  private currentMusicMode: 'day' | 'night' | 'combat' | 'shrine' | 'none' = 'none';
  private stepCount = 0;

  // Ambient sound nodes
  private windGain: GainNode | null = null;
  private windFilter: BiquadFilterNode | null = null;

  constructor() {
    // AudioContext will be initialized on first user interaction (touch/click/key)
  }

  public init() {
    if (this.isInitialized) return;
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) return;

      this.ctx = new AudioCtx();

      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.value = 0.8;
      this.masterGain.connect(this.ctx.destination);

      this.musicGain = this.ctx.createGain();
      this.musicGain.gain.value = 0.4;
      this.musicGain.connect(this.masterGain);

      this.sfxGain = this.ctx.createGain();
      this.sfxGain.gain.value = 0.7;
      this.sfxGain.connect(this.masterGain);

      this.initWindAmbient();
      this.isInitialized = true;
    } catch (e) {
      console.warn('Web Audio API initialized failed', e);
    }
  }

  public resume() {
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }

  public setVolumes(master: number, music: number, sfx: number) {
    if (!this.ctx) return;
    if (this.masterGain) this.masterGain.gain.linearRampToValueAtTime(master, this.ctx.currentTime + 0.1);
    if (this.musicGain) this.musicGain.gain.linearRampToValueAtTime(music, this.ctx.currentTime + 0.1);
    if (this.sfxGain) this.sfxGain.gain.linearRampToValueAtTime(sfx, this.ctx.currentTime + 0.1);
  }

  // --- AMBIENT WIND GENERATOR ---
  private initWindAmbient() {
    if (!this.ctx || !this.sfxGain) return;
    const bufferSize = this.ctx.sampleRate * 2;
    const noiseBuffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const output = noiseBuffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      output[i] = Math.random() * 2 - 1;
    }

    const whiteNoise = this.ctx.createBufferSource();
    whiteNoise.buffer = noiseBuffer;
    whiteNoise.loop = true;

    this.windFilter = this.ctx.createBiquadFilter();
    this.windFilter.type = 'bandpass';
    this.windFilter.frequency.value = 350;
    this.windFilter.Q.value = 3.0;

    this.windGain = this.ctx.createGain();
    this.windGain.gain.value = 0.04;

    whiteNoise.connect(this.windFilter);
    this.windFilter.connect(this.windGain);
    this.windGain.connect(this.sfxGain);

    whiteNoise.start();

    // Modulate wind pitch & volume dynamically
    setInterval(() => {
      if (!this.ctx || !this.windFilter || !this.windGain) return;
      const t = this.ctx.currentTime;
      const targetFreq = 250 + Math.sin(t * 0.5) * 150 + Math.random() * 80;
      this.windFilter.frequency.linearRampToValueAtTime(targetFreq, t + 2);
    }, 2500);
  }

  // --- PROCEDURAL MUSIC SYNTHESIZER ---
  public playMusic(mode: 'day' | 'night' | 'combat' | 'shrine') {
    if (this.currentMusicMode === mode) return;
    this.currentMusicMode = mode;
    this.stopMusic();

    if (!this.ctx || !this.musicGain) return;
    this.stepCount = 0;

    // Musical Scales (Hz)
    // Zelda-like Lydian / Pentatonic notes in C major / G Lydian
    const dayNotes = [261.63, 293.66, 329.63, 392.00, 440.00, 523.25, 587.33, 659.25, 783.99]; // C, D, E, G, A, C5, D5, E5, G5
    const nightNotes = [220.00, 261.63, 329.63, 392.00, 440.00, 523.25]; // A Minor Pentatonic
    const combatNotes = [146.83, 174.61, 196.00, 220.00, 246.94, 293.66]; // D Minor / Intense low brass
    const shrineNotes = [329.63, 392.00, 493.88, 523.25, 659.25, 783.99, 987.77]; // Mystic E Minor 7

    const tempo = mode === 'combat' ? 220 : mode === 'night' ? 900 : 450;

    this.musicInterval = setInterval(() => {
      if (!this.ctx || !this.musicGain) return;

      const time = this.ctx.currentTime;
      const notes =
        mode === 'day'
          ? dayNotes
          : mode === 'night'
          ? nightNotes
          : mode === 'combat'
          ? combatNotes
          : shrineNotes;

      // Select melodic note
      if (Math.random() > (mode === 'night' ? 0.4 : 0.15)) {
        const note = notes[Math.floor(Math.random() * notes.length)];
        const osc = this.ctx.createOscillator();
        const noteGain = this.ctx.createGain();

        // Waveform based on mood
        osc.type = mode === 'combat' ? 'sawtooth' : mode === 'night' ? 'sine' : 'triangle';
        osc.frequency.setValueAtTime(note, time);

        // Envelope
        const attack = mode === 'combat' ? 0.02 : 0.15;
        const decay = mode === 'combat' ? 0.15 : mode === 'night' ? 1.8 : 0.6;
        noteGain.gain.setValueAtTime(0, time);
        noteGain.gain.linearRampToValueAtTime(0.2, time + attack);
        noteGain.gain.exponentialRampToValueAtTime(0.0001, time + attack + decay);

        // Filter for warmth
        const filter = this.ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(mode === 'combat' ? 1200 : 800, time);

        osc.connect(filter);
        filter.connect(noteGain);
        noteGain.connect(this.musicGain);

        osc.start(time);
        osc.stop(time + attack + decay + 0.1);
      }

      // Bass pad on certain steps
      if (this.stepCount % 4 === 0) {
        const rootNote = notes[0] / 2;
        const bassOsc = this.ctx.createOscillator();
        const bassGain = this.ctx.createGain();

        bassOsc.type = 'sine';
        bassOsc.frequency.setValueAtTime(rootNote, time);

        bassGain.gain.setValueAtTime(0, time);
        bassGain.gain.linearRampToValueAtTime(0.12, time + 0.3);
        bassGain.gain.exponentialRampToValueAtTime(0.001, time + 1.8);

        bassOsc.connect(bassGain);
        bassGain.connect(this.musicGain);

        bassOsc.start(time);
        bassOsc.stop(time + 2.0);
      }

      this.stepCount++;
    }, tempo);
  }

  public stopMusic() {
    if (this.musicInterval) {
      clearInterval(this.musicInterval);
      this.musicInterval = null;
    }
  }

  // --- SOUND EFFECTS (SFX) ---
  public playFootstep(surface: 'grass' | 'rock' | 'water') {
    if (!this.ctx || !this.sfxGain) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    if (surface === 'grass') {
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(140 + Math.random() * 40, t);
      gain.gain.setValueAtTime(0.06, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.08);
    } else if (surface === 'rock') {
      osc.type = 'sine';
      osc.frequency.setValueAtTime(220 + Math.random() * 50, t);
      gain.gain.setValueAtTime(0.08, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.06);
    } else {
      // water splash
      this.playWaterSplash('gentle');
      return;
    }

    osc.connect(gain);
    gain.connect(this.sfxGain);
    osc.start(t);
    osc.stop(t + 0.15);
  }

  public playWaterSplash(intensity: 'gentle' | 'heavy' | 'paddle' = 'paddle') {
    if (!this.ctx || !this.sfxGain) return;
    const t = this.ctx.currentTime;
    try {
      const isHeavy = intensity === 'heavy';
      const duration = isHeavy ? 0.32 : 0.22;

      // 1. Soft Bandpassed Water Spray Noise (Realistic Aquatic Plätschern)
      const bufferSize = Math.floor(this.ctx.sampleRate * duration);
      const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        data[i] = Math.random() * 2 - 1;
      }
      const noise = this.ctx.createBufferSource();
      noise.buffer = buffer;

      // Soft Bandpass filter for authentic water spray tone
      const filter = this.ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.setValueAtTime(isHeavy ? 1000 : 700, t);
      filter.frequency.exponentialRampToValueAtTime(280, t + duration);
      filter.Q.value = isHeavy ? 1.6 : 2.4;

      const gain = this.ctx.createGain();
      const peakVol = isHeavy ? 0.16 : 0.07;
      gain.gain.setValueAtTime(0.001, t);
      gain.gain.linearRampToValueAtTime(peakVol, t + 0.02); // gentle 20ms attack
      gain.gain.exponentialRampToValueAtTime(0.0001, t + duration);

      noise.connect(filter);
      filter.connect(gain);
      gain.connect(this.sfxGain);
      noise.start(t);

      // 2. High-Pitched Soft Water Droplet Chime / Liquid Bubble
      const dropFreq = isHeavy ? 600 : 800 + Math.random() * 250;
      const dropOsc = this.ctx.createOscillator();
      const dropGain = this.ctx.createGain();
      dropOsc.type = 'sine';
      dropOsc.frequency.setValueAtTime(dropFreq, t + 0.01);
      dropOsc.frequency.exponentialRampToValueAtTime(dropFreq * 0.55, t + 0.08);

      dropGain.gain.setValueAtTime(0.001, t + 0.01);
      dropGain.gain.linearRampToValueAtTime(isHeavy ? 0.04 : 0.025, t + 0.025);
      dropGain.gain.exponentialRampToValueAtTime(0.0001, t + 0.09);

      dropOsc.connect(dropGain);
      dropGain.connect(this.sfxGain);
      dropOsc.start(t + 0.01);
      dropOsc.stop(t + 0.1);

      // 3. Soft Sub-Surface Water Displacement Body
      const subOsc = this.ctx.createOscillator();
      const subGain = this.ctx.createGain();
      subOsc.type = 'sine';
      subOsc.frequency.setValueAtTime(90, t);
      subOsc.frequency.linearRampToValueAtTime(60, t + 0.14);

      subGain.gain.setValueAtTime(0.001, t);
      subGain.gain.linearRampToValueAtTime(isHeavy ? 0.06 : 0.025, t + 0.025);
      subGain.gain.exponentialRampToValueAtTime(0.0001, t + 0.14);

      subOsc.connect(subGain);
      subGain.connect(this.sfxGain);
      subOsc.start(t);
      subOsc.stop(t + 0.15);
    } catch (e) {
      // Audio fallback
    }
  }

  public playSwordSlash() {
    if (!this.ctx || !this.sfxGain) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(400, t);
    osc.frequency.exponentialRampToValueAtTime(80, t + 0.12);

    gain.gain.setValueAtTime(0.2, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.15);

    osc.connect(gain);
    gain.connect(this.sfxGain);
    osc.start(t);
    osc.stop(t + 0.16);
  }

  public playHitImpact() {
    if (!this.ctx || !this.sfxGain) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'square';
    osc.frequency.setValueAtTime(120, t);
    osc.frequency.linearRampToValueAtTime(40, t + 0.15);

    gain.gain.setValueAtTime(0.35, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.2);

    osc.connect(gain);
    gain.connect(this.sfxGain);
    osc.start(t);
    osc.stop(t + 0.22);
  }

  public playArrowShot() {
    if (!this.ctx || !this.sfxGain) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'triangle';
    osc.frequency.setValueAtTime(150, t);
    osc.frequency.exponentialRampToValueAtTime(600, t + 0.08);

    gain.gain.setValueAtTime(0.2, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.1);

    osc.connect(gain);
    gain.connect(this.sfxGain);
    osc.start(t);
    osc.stop(t + 0.12);
  }

  public playGliderOpen() {
    if (!this.ctx || !this.sfxGain) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(180, t);
    osc.frequency.exponentialRampToValueAtTime(420, t + 0.25);

    gain.gain.setValueAtTime(0.2, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.3);

    osc.connect(gain);
    gain.connect(this.sfxGain);
    osc.start(t);
    osc.stop(t + 0.35);
  }

  public playRupeeChime() {
    if (!this.ctx || !this.sfxGain) return;
    const t = this.ctx.currentTime;
    const notes = [1046.5, 1318.51, 1567.98]; // C6, E6, G6

    notes.forEach((freq, i) => {
      const osc = this.ctx!.createOscillator();
      const gain = this.ctx!.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, t + i * 0.05);

      gain.gain.setValueAtTime(0, t + i * 0.05);
      gain.gain.linearRampToValueAtTime(0.18, t + i * 0.05 + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.001, t + i * 0.05 + 0.2);

      osc.connect(gain);
      gain.connect(this.sfxGain!);
      osc.start(t + i * 0.05);
      osc.stop(t + i * 0.05 + 0.25);
    });
  }

  public playShrineFanfare() {
    if (!this.ctx || !this.sfxGain) return;
    const t = this.ctx.currentTime;
    const melody = [
      { f: 523.25, d: 0.15 },
      { f: 659.25, d: 0.15 },
      { f: 783.99, d: 0.15 },
      { f: 1046.5, d: 0.5 },
    ];

    let delay = 0;
    melody.forEach((note) => {
      const osc = this.ctx!.createOscillator();
      const gain = this.ctx!.createGain();

      osc.type = 'triangle';
      osc.frequency.setValueAtTime(note.f, t + delay);

      gain.gain.setValueAtTime(0.25, t + delay);
      gain.gain.exponentialRampToValueAtTime(0.001, t + delay + note.d);

      osc.connect(gain);
      gain.connect(this.sfxGain!);
      osc.start(t + delay);
      osc.stop(t + delay + note.d + 0.05);

      delay += note.d * 0.8;
    });
  }
}

export const audioEngine = new WebAudioEngine();
