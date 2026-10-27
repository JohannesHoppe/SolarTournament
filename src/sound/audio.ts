/**
 * Sound in vacuum: nothing outside the own ship is audible. What the pilot hears travels
 * through the hull (muffled by a low-pass filter): the own laser, the drive, the thrusters,
 * hits and debris on the own ship. Cockpit beeps from the ship's computer are unfiltered.
 */
export class Sound {
  readonly context = new AudioContext();
  private readonly master = this.context.createGain();
  private readonly hull = this.context.createBiquadFilter();
  private readonly driveGain = this.context.createGain();
  private readonly thrusterGain = this.context.createGain();
  private buffers: Record<string, AudioBuffer | null> = {};
  private loopsStarted = false;
  private whiteNoise: AudioBuffer | null = null;

  constructor() {
    this.master.gain.value = 0.6;
    this.master.connect(this.context.destination);
    this.hull.type = 'lowpass';
    this.hull.frequency.value = 900;
    this.hull.Q.value = 0.7;
    this.hull.connect(this.master);
    this.driveGain.gain.value = 0;
    this.thrusterGain.gain.value = 0;
    // Browsers only start audio after a user gesture; for a finger that is its lifting
    // (pointerup, touchend), for a mouse or a key already the press.
    const unlock = () => {
      void this.context.resume();
      this.startLoops();
    };
    for (const gesture of ['pointerdown', 'pointerup', 'touchend', 'keydown']) window.addEventListener(gesture, unlock);
  }

  setBuffers(buffers: Record<string, AudioBuffer | null>) {
    this.buffers = buffers;
  }

  /** A sound transmitted through the hull. */
  play(name: string, options: { volume?: number; rate?: number } = {}) {
    const buffer = this.buffers[name];
    const volume = options.volume ?? 1;
    if (!buffer || this.context.state !== 'running' || volume < 0.02) return;
    const source = this.context.createBufferSource();
    source.buffer = buffer;
    source.playbackRate.value = (options.rate ?? 1) * (0.92 + Math.random() * 0.16);
    const gain = this.context.createGain();
    gain.gain.value = volume;
    source.connect(gain).connect(this.hull);
    source.start();
  }

  /** A short tone from the ship's computer. */
  beep(frequency: number, duration = 0.06, volume = 0.15, delay = 0) {
    if (this.context.state !== 'running') return;
    const start = this.context.currentTime + delay;
    const oscillator = this.context.createOscillator();
    oscillator.type = 'sine';
    oscillator.frequency.value = frequency;
    const gain = this.context.createGain();
    gain.gain.setValueAtTime(volume, start);
    gain.gain.exponentialRampToValueAtTime(0.001, start + duration);
    oscillator.connect(gain).connect(this.master);
    oscillator.start(start);
    oscillator.stop(start + duration + 0.02);
  }

  /**
   * Static of the broken link to the clone: a burst of filtered white noise in the pilot's
   * own headset, so it does not pass through the hull.
   */
  crackle(strength: number) {
    if (this.context.state !== 'running') return;
    const now = this.context.currentTime;
    const source = this.context.createBufferSource();
    source.buffer = this.whiteNoise ??= this.createWhiteNoise();
    source.playbackRate.value = 0.5 + Math.random();
    const filter = this.context.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = 200 + Math.random() * 600 * (1 + strength);
    filter.Q.value = 1.5;
    const gain = this.context.createGain();
    gain.gain.setValueAtTime(0.25 * Math.min(1, strength + 0.3), now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.06);
    source.connect(filter).connect(gain).connect(this.master);
    source.start(now, Math.random());
    source.stop(now + 0.08);
  }

  /**
   * Dust pattering on the hull: a few grains ticking on the plates in quick succession, heard
   * through the hull, louder the thicker the dust (`strength` 0..1).
   */
  patter(strength: number) {
    if (this.context.state !== 'running') return;
    const now = this.context.currentTime;
    const grains = 1 + Math.floor(Math.random() * 3);
    for (let i = 0; i < grains; i++) {
      const start = now + Math.random() * 0.04;
      const source = this.context.createBufferSource();
      source.buffer = this.whiteNoise ??= this.createWhiteNoise();
      const filter = this.context.createBiquadFilter();
      filter.type = 'highpass';
      filter.frequency.value = 400 + Math.random() * 400;
      const gain = this.context.createGain();
      gain.gain.setValueAtTime((0.1 + 0.3 * strength) * (0.5 + Math.random() * 0.5), start);
      gain.gain.exponentialRampToValueAtTime(0.001, start + 0.012);
      source.connect(filter).connect(gain).connect(this.hull);
      source.start(start, Math.random());
      source.stop(start + 0.02);
    }
  }

  /** Where the cockpit radio plays: straight into the headset, like the beeps. */
  get headset(): AudioNode {
    return this.master;
  }

  /** Drive rumble and thruster hiss of the own ship, 0..1 each. */
  setEngine(drive: number, thrusters: number) {
    const now = this.context.currentTime;
    this.driveGain.gain.setTargetAtTime(drive * 0.9, now, 0.08);
    this.thrusterGain.gain.setTargetAtTime(thrusters * 0.25, now, 0.03);
  }

  private startLoops() {
    if (this.loopsStarted) return;
    this.loopsStarted = true;
    const noise = this.noiseBuffer();

    const drive = this.context.createBufferSource();
    drive.buffer = noise;
    drive.loop = true;
    const driveFilter = this.context.createBiquadFilter();
    driveFilter.type = 'lowpass';
    driveFilter.frequency.value = 110;
    drive.connect(driveFilter).connect(this.driveGain).connect(this.master);
    drive.start();

    const hiss = this.context.createBufferSource();
    hiss.buffer = noise;
    hiss.loop = true;
    hiss.playbackRate.value = 0.7;
    const hissFilter = this.context.createBiquadFilter();
    hissFilter.type = 'bandpass';
    hissFilter.frequency.value = 700;
    hissFilter.Q.value = 0.8;
    hiss.connect(hissFilter).connect(this.thrusterGain).connect(this.hull);
    hiss.start();
  }

  private createWhiteNoise(): AudioBuffer {
    return this.noise(() => Math.random() * 2 - 1);
  }

  /** Brown noise: integrated white noise, deep and rumbling. */
  private noiseBuffer(): AudioBuffer {
    let last = 0;
    return this.noise(() => {
      last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02;
      return last * 3.5;
    });
  }

  /** Two seconds of noise, each sample from `next`. */
  private noise(next: () => number): AudioBuffer {
    const buffer = this.context.createBuffer(1, this.context.sampleRate * 2, this.context.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = next();
    return buffer;
  }
}
