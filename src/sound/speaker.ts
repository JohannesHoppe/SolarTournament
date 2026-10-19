import type { Voice } from '../music/band';
import { clipKey } from '../music/lines';
import { loadVoice } from '../music/voice';

/**
 * The flight computer reads out what the screen shows, in its own clear voice, independent
 * of the radio. One line at a time: a new line either waits its turn (it is dropped when
 * something else is talking) or interrupts, like a new step of the flight school.
 */
export class Speaker {
  private voice: Voice | null = null;
  private loading: Promise<void> | null = null;
  private readonly input: GainNode;
  private sources: AudioBufferSourceNode[] = [];
  private busyUntil = 0;

  constructor(private readonly context: AudioContext, destination: AudioNode) {
    // a little cockpit speaker: no rumble, the faintest grit
    const highpass = context.createBiquadFilter();
    highpass.type = 'highpass';
    highpass.frequency.value = 160;
    const grit = context.createWaveShaper();
    grit.curve = Float32Array.from({ length: 1024 }, (_, i) => Math.tanh(1.2 * ((i / 1023) * 2 - 1)) / Math.tanh(1.2));
    const level = context.createGain();
    level.gain.value = 1.1;
    this.input = context.createGain();
    this.input.connect(highpass).connect(grit).connect(level).connect(destination);
  }

  /** Loads the voice in the background; lines said before it is ready are skipped. */
  prepare() {
    this.loading ??= loadVoice()
      .then((voice) => {
        this.voice = voice;
      })
      .catch((error) => console.warn('Flight computer voice unavailable', error));
  }

  get speaking(): boolean {
    return this.context.currentTime < this.busyUntil;
  }

  /**
   * Says lines of the flight computer (see COMPUTER and SCHOOL), one after the other;
   * each line is rendered whole. Returns false when it stayed silent.
   */
  say(lines: string | string[], interrupt = false): boolean {
    this.prepare();
    const voice = this.voice;
    if (!voice || this.context.state !== 'running') return false;
    if (this.speaking && !interrupt) return false;
    this.stop();
    let position = this.context.currentTime + 0.05;
    for (const line of typeof lines === 'string' ? [lines] : lines) {
      const clip = voice.clips[clipKey('sys', line)];
      if (!clip) continue;
      const source = this.context.createBufferSource();
      source.buffer = voice.buffer;
      source.connect(this.input);
      source.start(position, clip[0], clip[1]);
      this.sources.push(source);
      position += clip[1] + 0.3;
    }
    this.busyUntil = position;
    return true;
  }

  /** Cuts the current line off. */
  stop() {
    for (const source of this.sources) source.stop();
    this.sources = [];
    this.busyUntil = 0;
  }
}
