/**
 * The crowd of the Presidential Games, in the stadiums on Earth where the broadcast is watched:
 * it comes through Radio 2584 like everything else of the show (vacuum carries no sound), and
 * so follows the radio's volume, its switch and the muffled link of a lost clone. All of it is
 * synthesized: a roar of many voices (noise through the formants of open vowels, swelling and
 * breathing), applause (a train of single claps rendered once into a buffer), cheers (voices
 * gliding up, "woo") and whistles.
 */

/** The formants the roar is shaped with (Hz) and their width (Q): the open vowels of a shouting crowd. */
const FORMANTS: readonly [number, number][] = [
  [350, 2.5],
  [750, 3],
  [1150, 3.5],
  [2600, 4],
];
/** Loudness of the parts at full swell (gain into the radio's chain). */
const ROAR_LEVEL = 0.55;
const APPLAUSE_LEVEL = 0.4;
const CHEER_LEVEL = 0.05;
const WHISTLE_LEVEL = 0.025;
/** Claps a second in the applause buffer, and its length (s): long enough that its loop is not heard. */
const CLAPS_PER_SECOND = 140;
const APPLAUSE_SECONDS = 4;
/** The roar breathes: its level wanders by this share, about every BREATH_SECONDS. */
const BREATH = 0.25;
const BREATH_SECONDS = 1.3;

export class Crowd {
  private readonly roar: GainNode;
  private readonly applause: GainNode;
  private readonly cheers: GainNode;
  private started = false;
  /** Cheers and whistles still to come, and until when (audio time). */
  private excitedUntil = 0;
  private nextCheer = 0;

  constructor(
    private readonly context: AudioContext,
    destination: AudioNode,
  ) {
    this.roar = context.createGain();
    this.applause = context.createGain();
    this.cheers = context.createGain();
    for (const gain of [this.roar, this.applause]) gain.gain.value = 0;
    this.cheers.gain.value = 1;
    for (const gain of [this.roar, this.applause, this.cheers]) gain.connect(destination);
  }

  /** The loops start the first time the crowd is heard (an AudioContext may not run before a gesture). */
  private start() {
    if (this.started) return;
    this.started = true;
    const context = this.context;
    // the roar: a few seconds of noise, looped, through the vowels, into a level that breathes
    const noise = context.createBufferSource();
    noise.buffer = buffer(context, 3, (data) => {
      // brown-ish noise: the low rumble of a stadium under the voices
      let last = 0;
      for (let i = 0; i < data.length; i++) {
        last = 0.97 * last + 0.03 * (Math.random() * 2 - 1);
        data[i] = last * 3 + (Math.random() * 2 - 1) * 0.35;
      }
    });
    noise.loop = true;
    const breath = context.createGain();
    breath.gain.value = 1;
    for (const [frequency, q] of FORMANTS) {
      const formant = context.createBiquadFilter();
      formant.type = 'bandpass';
      formant.frequency.value = frequency;
      formant.Q.value = q;
      noise.connect(formant).connect(breath);
    }
    breath.connect(this.roar);
    this.breathe(breath.gain);
    noise.start();
    // the applause: claps at random moments, each a short burst of bright noise
    const claps = context.createBufferSource();
    claps.buffer = buffer(context, APPLAUSE_SECONDS, (data, rate) => {
      const clap = Math.round(0.012 * rate);
      for (let n = 0; n < CLAPS_PER_SECOND * APPLAUSE_SECONDS; n++) {
        const at = Math.floor(Math.random() * (data.length - clap));
        const loud = 0.3 + Math.random() * 0.7;
        for (let i = 0; i < clap; i++) data[at + i] += (Math.random() * 2 - 1) * loud * Math.exp(-i / (clap / 4));
      }
    });
    claps.loop = true;
    const bright = context.createBiquadFilter();
    bright.type = 'highpass';
    bright.frequency.value = 900;
    claps.connect(bright).connect(this.applause);
    claps.start();
  }

  /** The roar breathes: its level wanders a little, now and then, as a crowd's does. */
  private breathe(gain: AudioParam) {
    const step = () => {
      const now = this.context.currentTime;
      gain.setTargetAtTime(1 - BREATH / 2 + Math.random() * BREATH, now, BREATH_SECONDS / 3);
      this.cheer(now);
      setTimeout(step, BREATH_SECONDS * 1000 * (0.5 + Math.random()));
    };
    step();
  }

  /**
   * The crowd swells to `level` (0 silent, 1 on its feet) over `seconds`, with applause from
   * half of it on; above that, cheers and whistles ring out of it for `excited` seconds.
   */
  swell(level: number, seconds: number, excited = 0) {
    this.start();
    const now = this.context.currentTime;
    this.roar.gain.setTargetAtTime(level * ROAR_LEVEL, now, seconds / 3);
    this.applause.gain.setTargetAtTime(Math.max(0, level - 0.5) * 2 * APPLAUSE_LEVEL, now, seconds / 3);
    if (excited > 0) this.excitedUntil = Math.max(this.excitedUntil, now + excited);
  }

  /** The crowd erupts: on its feet at once, cheering and whistling, then settling to a murmur. */
  erupt(seconds = 4) {
    this.swell(1, 0.15, seconds);
    const now = this.context.currentTime;
    const settle = now + seconds;
    this.roar.gain.setTargetAtTime(0.25 * ROAR_LEVEL, settle, seconds / 2);
    this.applause.gain.setTargetAtTime(0, settle, seconds / 3);
    for (let i = 0; i < 6; i++) this.voice(now + Math.random() * 0.6);
  }

  /** Quiet: the broadcast cuts away from the stadium. */
  hush(seconds = 1.5) {
    const now = this.context.currentTime;
    this.excitedUntil = 0;
    for (const gain of [this.roar, this.applause]) gain.gain.setTargetAtTime(0, now, seconds / 3);
  }

  /** While the crowd is excited, a cheer or a whistle now and then. */
  private cheer(now: number) {
    if (now > this.excitedUntil || now < this.nextCheer) return;
    this.nextCheer = now + 0.1 + Math.random() * 0.4;
    if (Math.random() < 0.7) this.voice(now + Math.random() * 0.3);
    else this.whistle(now + Math.random() * 0.3);
  }

  /** One voice in the crowd: a "woo" gliding up and falling away, through a vowel. */
  private voice(at: number) {
    const context = this.context;
    const pitch = 220 + Math.random() * 380;
    const length = 0.5 + Math.random() * 0.7;
    const tone = context.createOscillator();
    tone.type = 'sawtooth';
    tone.frequency.setValueAtTime(pitch * 0.8, at);
    tone.frequency.exponentialRampToValueAtTime(pitch * 1.35, at + length * 0.4);
    tone.frequency.exponentialRampToValueAtTime(pitch * 0.9, at + length);
    const vowel = context.createBiquadFilter();
    vowel.type = 'bandpass';
    vowel.frequency.value = 600 + Math.random() * 500;
    vowel.Q.value = 2;
    const level = context.createGain();
    level.gain.setValueAtTime(0, at);
    level.gain.linearRampToValueAtTime(CHEER_LEVEL * (0.5 + Math.random()), at + 0.08);
    level.gain.exponentialRampToValueAtTime(0.0001, at + length);
    tone.connect(vowel).connect(level).connect(this.cheers);
    tone.start(at);
    tone.stop(at + length + 0.05);
  }

  /** A whistle from the stands: two fingers, a high tone sliding up and down. */
  private whistle(at: number) {
    const context = this.context;
    const pitch = 1800 + Math.random() * 1200;
    const length = 0.3 + Math.random() * 0.5;
    const tone = context.createOscillator();
    tone.type = 'sine';
    tone.frequency.setValueAtTime(pitch, at);
    tone.frequency.linearRampToValueAtTime(pitch * (1.1 + Math.random() * 0.3), at + length * 0.3);
    tone.frequency.linearRampToValueAtTime(pitch * 0.9, at + length);
    const level = context.createGain();
    level.gain.setValueAtTime(0, at);
    level.gain.linearRampToValueAtTime(WHISTLE_LEVEL, at + 0.03);
    level.gain.setValueAtTime(WHISTLE_LEVEL, at + length - 0.05);
    level.gain.linearRampToValueAtTime(0, at + length);
    tone.connect(level).connect(this.cheers);
    tone.start(at);
    tone.stop(at + length + 0.05);
  }
}

/** A mono buffer of `seconds`, filled by `fill`. */
function buffer(context: AudioContext, seconds: number, fill: (data: Float32Array, rate: number) => void): AudioBuffer {
  const result = context.createBuffer(1, Math.round(seconds * context.sampleRate), context.sampleRate);
  fill(result.getChannelData(0), context.sampleRate);
  return result;
}
