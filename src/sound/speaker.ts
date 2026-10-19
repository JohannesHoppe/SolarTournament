import type { Voice } from '../music/band';
import { clipKey } from '../music/lines';
import { loadVoice } from '../music/voice';

/** How a line meets one still being said: see Speaker.say. */
export type Urgency = 'chatter' | 'urgent' | 'lesson';

/**
 * The flight computer reads out what the screen shows, in its own clear voice, independent
 * of the radio. One line at a time; how a new line meets one still being said depends on
 * its urgency (see say).
 */
export class Speaker {
  private voice: Voice | null = null;
  private loading: Promise<void> | null = null;
  private readonly input: GainNode;
  private sources: AudioBufferSourceNode[] = [];
  private busyUntil = 0;
  /** How urgent the line being said is (see say). */
  private saying: Urgency = 'chatter';

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
      .catch((error) => {
        // tried again with the next line
        this.loading = null;
        console.warn('Flight computer voice unavailable', error);
      });
  }

  get speaking(): boolean {
    return this.context.currentTime < this.busyUntil;
  }

  /**
   * Says lines of the flight computer (see COMPUTER and SCHOOL), one after the other;
   * each line is rendered whole. How it meets a line still being said depends on its
   * urgency: a lesson of the flight school is never cut off, a new lesson waits its turn
   * behind whatever is being said, an urgent line cuts off anything but a lesson, and
   * chatter only speaks into silence. Returns false when it stayed silent.
   */
  say(lines: string | string[], urgency: Urgency = 'chatter'): boolean {
    this.prepare();
    const voice = this.voice;
    if (!voice || this.context.state !== 'running') return false;
    let position = this.context.currentTime + 0.05;
    const queued = this.speaking && urgency === 'lesson';
    if (queued) position = this.busyUntil;
    else if (this.speaking && (urgency === 'chatter' || this.saying === 'lesson')) return false;
    else this.stop();
    let said = false;
    for (const line of typeof lines === 'string' ? [lines] : lines) {
      const clip = voice.clips[clipKey('sys', line)];
      if (!clip) continue;
      said = true;
      const source = this.context.createBufferSource();
      source.buffer = voice.buffer;
      source.connect(this.input);
      source.start(position, clip[0], clip[1]);
      // a finished line leaves the list, so a long flight school does not pile them up
      source.onended = () => {
        const index = this.sources.indexOf(source);
        if (index >= 0) this.sources.splice(index, 1);
      };
      this.sources.push(source);
      position += clip[1] + 0.3;
    }
    if (said) {
      this.busyUntil = position;
      this.saying = urgency;
    } else if (!queued) {
      this.busyUntil = 0;
    }
    return said;
  }

  /** Cuts the current line off. */
  stop() {
    for (const source of this.sources) source.stop();
    this.sources = [];
    this.busyUntil = 0;
  }
}
