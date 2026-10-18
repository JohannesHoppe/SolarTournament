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

  constructor() {
    this.master.gain.value = 0.6;
    this.master.connect(this.context.destination);
    this.hull.type = 'lowpass';
    this.hull.frequency.value = 900;
    this.hull.Q.value = 0.7;
    this.hull.connect(this.master);
    this.driveGain.gain.value = 0;
    this.thrusterGain.gain.value = 0;
    // Browsers only start audio after a user gesture.
    const unlock = () => {
      void this.context.resume();
      this.startLoops();
    };
    window.addEventListener('pointerdown', unlock);
    window.addEventListener('keydown', unlock);
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

  private noiseBuffer(): AudioBuffer {
    const length = this.context.sampleRate * 2;
    const buffer = this.context.createBuffer(1, length, this.context.sampleRate);
    const data = buffer.getChannelData(0);
    // brown noise: integrated white noise, deep and rumbling
    let last = 0;
    for (let i = 0; i < length; i++) {
      last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02;
      data[i] = last * 3.5;
    }
    return buffer;
  }
}
