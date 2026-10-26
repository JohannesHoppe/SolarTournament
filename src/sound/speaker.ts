import type { Voice } from '../music/band';
import { clipKey } from '../music/lines';
import { loadVoice } from '../music/voice';
import { t } from '../i18n/i18n';

/** A voice that failed to load is tried again after this long (ms), as the radio's. */
const VOICE_RETRY_MS = 5000;

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
  /** After a failed load, the next try waits until then (performance.now(), ms). */
  private retryAt = 0;
  private readonly input: GainNode;
  /** The lines playing or waiting to play, by their source. */
  private readonly sources = new Map<AudioBufferSourceNode, string>();
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

  /** Loads the voice of the Host's language in the background; lines said before it is ready are skipped. */
  prepare() {
    if (this.loading || performance.now() < this.retryAt) return;
    this.loading = loadVoice()
      .then((voice) => {
        this.voice = voice;
        // without the language's lines (Nicole's), asked for again after a pause: loadVoice
        // tries the language's sprite once more when its own pause is over
        if (voice.partial) {
          this.loading = null;
          this.retryAt = performance.now() + VOICE_RETRY_MS;
        }
      })
      .catch((error) => {
        // tried again with a line said after a pause, not with every line of every frame
        this.loading = null;
        this.retryAt = performance.now() + VOICE_RETRY_MS;
        console.warn('Flight computer voice unavailable', error);
      });
  }

  get speaking(): boolean {
    return this.context.currentTime < this.busyUntil;
  }

  /** Whether one of these lines is being said or waits to be said. */
  sayingAny(lines: ReadonlySet<string>): boolean {
    for (const line of this.sources.values()) if (lines.has(line)) return true;
    return false;
  }

  /**
   * Says lines of the flight computer (see COMPUTER and SCHOOL), one after the other;
   * each line is rendered whole. How it meets a line still being said depends on its
   * urgency: a lesson of the flight school is never cut off, a new lesson waits its turn
   * behind whatever is being said, an urgent line cuts off anything but a lesson, and
   * chatter only speaks into silence. A lesson that is already waiting is not queued twice, so
   * a drill failed again and again does not pile up its line. Returns false when it stayed
   * silent.
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
    const waiting = new Set(this.sources.values());
    let said = false;
    for (const line of typeof lines === 'string' ? [lines] : lines) {
      // the line in the Host's language: the sprite holds it rendered in each
      const clip = voice.clips[clipKey('sys', t(line))];
      if (!clip) continue;
      said = true;
      if (queued && waiting.has(line)) continue;
      const source = this.context.createBufferSource();
      source.buffer = voice.buffer;
      source.connect(this.input);
      source.start(position, clip[0], clip[1]);
      // a finished line leaves the list, so a long flight school does not pile them up
      source.onended = () => this.sources.delete(source);
      this.sources.set(source, line);
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
    for (const source of this.sources.keys()) source.stop();
    this.sources.clear();
    this.busyUntil = 0;
  }
}
