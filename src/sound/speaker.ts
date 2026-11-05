import type { Voice } from '../music/band';
import { type Cast, castOf, clipKey } from '../music/lines';
import { loadVoice } from '../music/voice';
import { t } from '../i18n/i18n';
import { tanh } from '../detmath';

/** A voice that failed to load is tried again after this long (ms), as the radio's. */
const VOICE_RETRY_MS = 5000;

/**
 * How the campaign's other voices are played (see castOf): `rate` the share of the pitch and
 * pace they were rendered at (Rask's is rendered fast and played at 78 %, a fat man's voice;
 * Pim's a girl's at 112 %; Hedda's low and worn at 84 %), `tremble` how far (cents) the pitch
 * wavers at TREMBLE_RATE (Hz).
 */
const CAST_VOICES: Record<Cast, { rate: number; tremble: number }> = { rask: { rate: 0.78, tremble: 35 }, pim: { rate: 1.12, tremble: 0 }, hedda: { rate: 0.84, tremble: 25 } };
const TREMBLE_RATE = 5;

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
  /** The comm the campaign's other voices come in on (see castOf): a narrow radio band, gritty. */
  private readonly comm: GainNode;
  /** The room the campaign's people stand in with the clone in a scene in person: their voices as they are, no comm. */
  private readonly room: GainNode;
  /** The clone stands among the people (a scene in person, see campaign/scenes): their lines come from the room, not the comm. */
  inPerson = false;
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
    grit.curve = Float32Array.from({ length: 1024 }, (_, i) => tanh(1.2 * ((i / 1023) * 2 - 1)) / tanh(1.2));
    const level = context.createGain();
    level.gain.value = 1.1;
    this.input = context.createGain();
    this.input.connect(highpass).connect(grit).connect(level).connect(destination);
    // a cheap comm from outside the ship: the telephone band, nasal, driven hard into a rasp
    const band = context.createBiquadFilter();
    band.type = 'bandpass';
    band.frequency.value = 1400;
    band.Q.value = 0.8;
    const nasal = context.createBiquadFilter();
    nasal.type = 'peaking';
    nasal.frequency.value = 1500;
    nasal.Q.value = 1;
    nasal.gain.value = 8;
    const crunch = context.createWaveShaper();
    crunch.curve = Float32Array.from({ length: 1024 }, (_, i) => tanh(4 * ((i / 1023) * 2 - 1)) / tanh(4));
    this.comm = context.createGain();
    this.comm.gain.value = 1.2;
    this.comm.connect(band).connect(nasal).connect(crunch).connect(level);
    // in the room: the voice as the clone's ears hear it, close and plain
    this.room = context.createGain();
    this.room.gain.value = 1.1;
    this.room.connect(destination);
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
      const who = castOf(line);
      const clip = voice.clips[clipKey(who ?? 'sys', t(line))];
      if (!clip) continue;
      said = true;
      if (queued && waiting.has(line)) continue;
      const source = this.context.createBufferSource();
      source.buffer = voice.buffer;
      source.connect(who ? (this.inPerson ? this.room : this.comm) : this.input);
      // a voice of the cast lower and heavier than it was rendered, with a tremble in it
      const cast = who ? CAST_VOICES[who] : null;
      const rate = cast?.rate ?? 1;
      source.playbackRate.value = rate;
      if (cast) {
        const tremble = this.context.createOscillator();
        tremble.frequency.value = TREMBLE_RATE;
        const depth = this.context.createGain();
        depth.gain.value = cast.tremble;
        tremble.connect(depth).connect(source.detune);
        tremble.start(position);
        tremble.stop(position + clip[1] / rate);
      }
      source.start(position, clip[0], clip[1]);
      // a finished line leaves the list, so a long flight school does not pile them up
      source.onended = () => this.sources.delete(source);
      this.sources.set(source, line);
      position += clip[1] / rate + 0.3;
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
