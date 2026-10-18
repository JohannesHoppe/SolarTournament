import * as THREE from 'three';

/** Fire-and-forget sound effects with distance attenuation relative to the listener. */
export class Sound {
  readonly context = new AudioContext();
  private readonly master = this.context.createGain();
  private buffers: Record<string, AudioBuffer | null> = {};

  constructor() {
    this.master.gain.value = 0.6;
    this.master.connect(this.context.destination);
    // Browsers only start audio after a user gesture.
    const unlock = () => void this.context.resume();
    window.addEventListener('pointerdown', unlock);
    window.addEventListener('keydown', unlock);
  }

  setBuffers(buffers: Record<string, AudioBuffer | null>) {
    this.buffers = buffers;
  }

  play(name: string, options: { volume?: number; rate?: number; at?: THREE.Vector3; listener?: THREE.Vector3 } = {}) {
    const buffer = this.buffers[name];
    if (!buffer || this.context.state !== 'running') return;
    let volume = options.volume ?? 1;
    if (options.at && options.listener) volume *= 1 / (1 + options.at.distanceTo(options.listener) / 6000);
    if (volume < 0.02) return;
    const source = this.context.createBufferSource();
    source.buffer = buffer;
    source.playbackRate.value = (options.rate ?? 1) * (0.92 + Math.random() * 0.16);
    const gain = this.context.createGain();
    gain.gain.value = volume;
    source.connect(gain).connect(this.master);
    source.start();
  }
}
