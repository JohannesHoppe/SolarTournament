import type * as ToneLib from 'tone';
import { barSeconds, stepEvents, STEPS_PER_BAR, type BarInfo, type Song } from './songs';

type Tone = typeof ToneLib;

const midiToHz = (note: number) => 440 * Math.pow(2, (note - 69) / 12);

/** A waveshaper curve normalised to ±1, so distortion adds grit without losing level. */
const saturate = (k: number) => (x: number) => Math.tanh(k * x) / Math.tanh(k);
/** The gabber kick's double saturation (Sonic Pi "gabberkick": tanh, then atan). */
const gabber = (x: number) => Math.atan(5.1 * Math.tanh(10 * x)) / Math.atan(5.1);

/** Master filter cutoff for a brightness of 0..1: 200 Hz to 18 kHz. */
const cutoff = (brightness: number) => 200 * Math.pow(90, Math.max(0, Math.min(1, brightness)));

/**
 * The instruments of Radio 2584 and how one sixteenth step of a track is played on them.
 * Works on whatever Tone context is active, live or offline.
 *
 * The kick is a sine with a two-stage pitch drop, saturated hard, plus a noise click. A copy
 * of it feeds the rumble: a long reverb, distorted, low-passed to the sub range, ducked by
 * every kick so it swells in between. Bass, acid and stabs pump with the kick as well. The
 * master ends in a soft clipper: loud, dense, never harsh digital clipping.
 */
export class Band {
  readonly output: ToneLib.Gain;
  private readonly master: ToneLib.Filter;
  private readonly pump: ToneLib.Gain;
  private readonly fxSend: ToneLib.Gain;
  private readonly echoSend: ToneLib.Gain;
  private readonly reverbs: ToneLib.Reverb[] = [];

  private readonly kickOsc: ToneLib.Oscillator;
  private readonly kickDrive: ToneLib.Gain;
  private readonly kickAmp: ToneLib.AmplitudeEnvelope;
  private readonly click: ToneLib.NoiseSynth;
  private readonly rumbleSend: ToneLib.Gain;
  private readonly rumbleDuck: ToneLib.Gain;

  private readonly hat: ToneLib.NoiseSynth;
  private readonly openHat: ToneLib.NoiseSynth;
  private readonly hatCrush: ToneLib.BitCrusher;
  private readonly ride: ToneLib.NoiseSynth;
  private readonly clap: ToneLib.NoiseSynth;
  private readonly perc: ToneLib.MembraneSynth;
  private readonly percCrush: ToneLib.BitCrusher;

  private readonly bass: ToneLib.MonoSynth;
  private readonly bassDrive: ToneLib.Gain;
  private readonly bassHighpass: ToneLib.Filter;
  private readonly acid: ToneLib.MonoSynth;
  private readonly acidFilter: ToneLib.Filter;
  private readonly acidDrive: ToneLib.Gain;
  private readonly stab: ToneLib.PolySynth;
  private readonly stabDrive: ToneLib.Gain;
  private readonly lead: ToneLib.MonoSynth;
  private readonly riser: ToneLib.NoiseSynth;
  private readonly riserFilter: ToneLib.Filter;
  private readonly impact: ToneLib.NoiseSynth;

  private flavor = '';
  /** Highpass of the bass; a breakdown lifts it, so the bass goes on without its low end. */
  private bassFloor = 60;
  private lastAcid = 0;

  constructor(T: Tone) {
    // master: filter -> glue compressor -> soft clipper -> -1 dB ceiling
    this.output = new T.Gain(T.dbToGain(-1));
    const clipper = new T.WaveShaper(saturate(2), 4096).connect(this.output);
    clipper.oversample = '4x';
    const glue = new T.Compressor({ threshold: -14, ratio: 4, attack: 0.02, release: 0.12, knee: 6 }).connect(new T.Gain(0.9).connect(clipper));
    this.master = new T.Filter({ frequency: 18000, type: 'lowpass', rolloff: -24, Q: 0 }).connect(glue);
    this.pump = new T.Gain(1).connect(this.master);

    // shared effects: a reverb for space, a dotted-eighth echo
    const space = this.reverb(T, 2.2);
    space.connect(this.master);
    this.fxSend = new T.Gain(1).connect(space);
    const echo = new T.PingPongDelay({ delayTime: '8n.', feedback: 0.38, wet: 1 }).connect(this.master);
    this.echoSend = new T.Gain(1).connect(echo);

    // kick: sine -> drive -> gabber shaper -> tame the fizz -> amplitude envelope
    const kickBus = new T.Gain(0.9).connect(this.master);
    this.kickAmp = new T.AmplitudeEnvelope({ attack: 0.001, decay: 0.01, sustain: 0.75, release: 0.03 }).connect(kickBus);
    const kickTone = new T.Filter({ type: 'lowpass', frequency: 7900, Q: 0 }).connect(this.kickAmp);
    const kickShaper = new T.WaveShaper(gabber, 4096).connect(kickTone);
    kickShaper.oversample = '4x';
    this.kickDrive = new T.Gain(1).connect(kickShaper);
    this.kickOsc = new T.Oscillator({ type: 'sine', frequency: 55 }).connect(this.kickDrive);
    this.kickOsc.start();
    this.click = new T.NoiseSynth({ noise: { type: 'white' }, envelope: { attack: 0.0005, decay: 0.012, sustain: 0 }, volume: -14 })
      .connect(new T.Filter({ type: 'bandpass', frequency: 3000, Q: 1 }).connect(kickBus));

    // rumble: kick -> long reverb -> distortion -> sub band -> mono -> ducked by the kick
    this.rumbleDuck = new T.Gain(1).connect(new T.Gain(0.75).connect(this.master));
    const rumbleMono = new T.Mono().connect(this.rumbleDuck);
    const rumbleHigh = new T.Filter({ type: 'highpass', frequency: 30, Q: 0 }).connect(rumbleMono);
    const rumbleLow = new T.Filter({ type: 'lowpass', frequency: 170, rolloff: -24, Q: 0 }).connect(rumbleHigh);
    const rumbleGrit = new T.WaveShaper(saturate(6), 2048).connect(rumbleLow);
    const rumbleVerb = this.reverb(T, 3.5);
    rumbleVerb.connect(new T.Gain(3).connect(rumbleGrit));
    this.rumbleSend = new T.Gain(0).connect(rumbleVerb);
    kickBus.connect(this.rumbleSend);

    // hats, ride, clap, percussion
    const hatBus = new T.Gain(1).connect(this.master);
    this.hatCrush = new T.BitCrusher({ bits: 6 }).connect(hatBus);
    this.hatCrush.wet.value = 0;
    const hatTone = new T.Filter({ type: 'highpass', frequency: 8200, Q: 0 }).connect(this.hatCrush);
    this.hat = new T.NoiseSynth({ noise: { type: 'white' }, envelope: { attack: 0.001, decay: 0.03, sustain: 0 }, volume: -15 }).connect(hatTone);
    this.openHat = new T.NoiseSynth({ noise: { type: 'white' }, envelope: { attack: 0.002, decay: 0.24, sustain: 0 }, volume: -17 })
      .connect(new T.Filter({ type: 'highpass', frequency: 7600, Q: 0 }).connect(this.hatCrush));
    // ride: noise through two resonant bands, a metallic shimmer that can retrigger any time
    this.ride = new T.NoiseSynth({ noise: { type: 'white' }, envelope: { attack: 0.001, decay: 0.35, sustain: 0 }, volume: -12 });
    this.ride.fan(
      new T.Filter({ type: 'bandpass', frequency: 5200, Q: 6 }).connect(hatBus),
      new T.Filter({ type: 'bandpass', frequency: 7400, Q: 8 }).connect(hatBus),
    );

    const clapDrive = new T.WaveShaper(saturate(3), 1024).connect(this.master);
    clapDrive.connect(this.fxSend);
    this.clap = new T.NoiseSynth({ noise: { type: 'white' }, envelope: { attack: 0.001, decay: 0.11, sustain: 0 }, volume: -11 })
      .connect(new T.Filter({ type: 'bandpass', frequency: 1250, Q: 1 }).connect(clapDrive));

    this.percCrush = new T.BitCrusher({ bits: 5 }).connect(this.master);
    this.percCrush.connect(this.echoSend);
    this.percCrush.wet.value = 0;
    this.perc = new T.MembraneSynth({ pitchDecay: 0.02, octaves: 2, envelope: { attack: 0.001, decay: 0.16, sustain: 0, release: 0.05 }, volume: -15 })
      .connect(new T.Filter({ type: 'highpass', frequency: 120, Q: 0 }).connect(this.percCrush));

    // bass: saw -> filter envelope -> highpass (the rumble owns the sub) -> drive
    const bassShaper = new T.WaveShaper(saturate(3), 2048).connect(this.pump);
    this.bassDrive = new T.Gain(1).connect(bassShaper);
    this.bassHighpass = new T.Filter({ type: 'highpass', frequency: 60, Q: 0 }).connect(this.bassDrive);
    this.bass = new T.MonoSynth({
      oscillator: { type: 'sawtooth' },
      filter: { type: 'lowpass', rolloff: -24, Q: 2 },
      envelope: { attack: 0.002, decay: 0.15, sustain: 0.5, release: 0.04 },
      filterEnvelope: { attack: 0.002, decay: 0.12, sustain: 0.2, release: 0.05, baseFrequency: 140, octaves: 3.5 },
      volume: -9,
    }).connect(this.bassHighpass);

    // acid: saw/square -> resonant squelch filter -> drive, with echo
    const acidShaper = new T.WaveShaper(saturate(4), 2048).connect(this.pump);
    acidShaper.connect(this.echoSend);
    this.acidDrive = new T.Gain(1).connect(acidShaper);
    this.acidFilter = new T.Filter({ type: 'lowpass', frequency: 800, rolloff: -24, Q: 9 }).connect(new T.Filter({ type: 'highpass', frequency: 140, Q: 0 }).connect(this.acidDrive));
    this.acid = new T.MonoSynth({
      oscillator: { type: 'sawtooth' },
      filter: { type: 'lowpass', Q: 0, rolloff: -12 },
      envelope: { attack: 0.003, decay: 0.2, sustain: 0.6, release: 0.03 },
      filterEnvelope: { attack: 0.001, decay: 0.1, sustain: 1, release: 0.1, baseFrequency: 20000, octaves: 0 },
      volume: -13,
    }).connect(this.acidFilter);

    // stabs: fat saws -> drive -> echo and reverb
    const stabShaper = new T.WaveShaper(saturate(3), 2048).connect(new T.Filter({ type: 'lowpass', frequency: 3800, Q: 0 }).connect(this.pump));
    stabShaper.connect(this.echoSend);
    stabShaper.connect(this.fxSend);
    this.stabDrive = new T.Gain(1).connect(stabShaper);
    this.stab = new T.PolySynth(T.Synth, {
      oscillator: { type: 'fatsawtooth', count: 3, spread: 30 },
      envelope: { attack: 0.002, decay: 0.17, sustain: 0, release: 0.1 },
      volume: -19,
    }).connect(this.stabDrive);

    // hoover lead: pulse width modulation, gliding, chorus
    const chorus = new T.Chorus({ frequency: 1.5, delayTime: 3.5, depth: 0.7, spread: 180, wet: 0.5 }).connect(this.pump);
    chorus.connect(this.fxSend);
    chorus.start();
    this.lead = new T.MonoSynth({
      oscillator: { type: 'pwm', modulationFrequency: 6 },
      portamento: 0.12,
      filter: { type: 'lowpass', Q: 1, rolloff: -12 },
      envelope: { attack: 0.01, decay: 0.3, sustain: 0.8, release: 0.25 },
      filterEnvelope: { attack: 0.02, decay: 0.4, sustain: 0.6, release: 0.3, baseFrequency: 900, octaves: 2.5 },
      volume: -17,
    }).connect(chorus);

    // transitions: a noise riser into the drop, a crash on the first beat after it
    this.riserFilter = new T.Filter({ type: 'highpass', frequency: 1000, Q: 1 }).connect(this.master);
    this.riserFilter.connect(this.fxSend);
    this.riser = new T.NoiseSynth({ noise: { type: 'white' }, envelope: { attack: 3, decay: 0.1, sustain: 1, release: 0.05 }, volume: -20 }).connect(this.riserFilter);
    const impactTone = new T.Filter({ type: 'lowpass', frequency: 6000, Q: 0 }).connect(this.master);
    impactTone.connect(this.fxSend);
    this.impact = new T.NoiseSynth({ noise: { type: 'white' }, envelope: { attack: 0.001, decay: 1.3, sustain: 0 }, volume: -13 }).connect(impactTone);
  }

  private reverb(T: Tone, decay: number) {
    const reverb = new T.Reverb({ decay, preDelay: 0.01, wet: 1 });
    this.reverbs.push(reverb);
    return reverb;
  }

  /** Resolves when the reverbs' impulse responses are rendered. */
  async ready(): Promise<void> {
    await Promise.all(this.reverbs.map((r) => r.ready));
  }

  /** Sets the sound of a track's flavor. */
  prepare(song: Song) {
    if (this.flavor === song.flavor) return;
    this.flavor = song.flavor;
    const industrial = song.flavor === 'industrial';
    this.hatCrush.wet.value = industrial ? 0.6 : 0;
    this.percCrush.wet.value = industrial || song.flavor === 'schranz' ? 0.8 : 0.2;
    this.acid.oscillator.type = song.flavor === 'acid' ? 'sawtooth' : 'square';
    // when the acid carries the track, the bass makes room above the rumble
    this.bassFloor = song.flavor === 'acid' ? 150 : 60;
  }

  /** Plays sixteenth number `step` of the track at audio time `time`. */
  play(song: Song, step: number, time: number) {
    const events = stepEvents(song, step);
    const info = events.info;
    const pos = step % STEPS_PER_BAR;
    const bar = barSeconds(song);
    const sixteenth = bar / STEPS_PER_BAR;
    const beat = sixteenth * 4;
    const t = time + (pos % 2 === 1 ? song.swing * sixteenth : 0);

    if (pos === 0) this.startBar(info, t, bar);

    if (events.kick) {
      this.kick(song, t, events.kick, info.drive);
      // rumble and harmony duck under the kick and swell back before the next one
      this.rumbleDuck.gain.cancelAndHoldAtTime(t);
      this.rumbleDuck.gain.linearRampToValueAtTime(0, t + 0.004);
      this.rumbleDuck.gain.linearRampToValueAtTime(1, t + 0.6 * beat);
      this.pump.gain.cancelAndHoldAtTime(t);
      this.pump.gain.linearRampToValueAtTime(0.4, t + 0.004);
      this.pump.gain.linearRampToValueAtTime(1, t + 0.45 * beat);
    }
    if (events.clap) {
      // a clap is several hands: three bursts a few milliseconds apart
      for (const offset of [0, 0.011, 0.023]) this.clap.triggerAttackRelease(0.1, t + offset, events.clap);
    }
    if (events.hat) this.hat.triggerAttackRelease(0.03, t, events.hat);
    if (events.openHat) this.openHat.triggerAttackRelease(0.2, t + 0.004, events.openHat);
    if (events.ride) this.ride.triggerAttackRelease(0.1, t, events.ride);
    if (events.perc) this.perc.triggerAttackRelease(midiToHz(events.perc.note), 0.1, t, events.perc.velocity);

    if (events.bass) this.bass.triggerAttackRelease(midiToHz(events.bass.note), sixteenth * 0.8, t, events.bass.velocity);

    if (events.acid) this.playAcid(song, events.acid.note, events.acid.accent, events.acid.slide, step, t, sixteenth, info);

    if (events.stab) this.stab.triggerAttackRelease(events.stab.notes.map(midiToHz), sixteenth * 1.2, t, events.stab.velocity);

    if (events.lead) this.lead.triggerAttackRelease(midiToHz(events.lead.note), sixteenth * events.lead.length * 0.95, t, events.lead.velocity);
  }

  private startBar(info: BarInfo, t: number, bar: number) {
    this.master.frequency.cancelAndHoldAtTime(t);
    this.master.frequency.exponentialRampToValueAtTime(cutoff(info.brightness), t + bar);
    this.rumbleSend.gain.setValueAtTime(info.layers.rumble ? 1 : 0, t);
    this.bassHighpass.frequency.setValueAtTime(info.section.kind === 'break' ? 380 : this.bassFloor, t);
    const drive = info.drive;
    this.kickDrive.gain.setValueAtTime(0.25 + 0.75 * drive, t);
    this.bassDrive.gain.setValueAtTime(0.5 + 1.5 * drive, t);
    this.acidDrive.gain.setValueAtTime(0.6 + 1.6 * drive, t);
    this.stabDrive.gain.setValueAtTime(0.6 + 1.4 * drive, t);
    if (info.riserBars) {
      const length = bar * info.riserBars;
      this.riserFilter.frequency.setValueAtTime(1000, t);
      this.riserFilter.frequency.exponentialRampToValueAtTime(10000, t + length);
      this.riser.triggerAttackRelease(length - bar / 4, t, 0.9);
    }
    if (info.impact) this.impact.triggerAttackRelease(1.2, t, 1);
  }

  /** Two-stage pitch drop: a fast click of pitch, then the body falls to the fundamental. */
  private kick(song: Song, t: number, velocity: number, drive: number) {
    const fundamental = midiToHz(song.root);
    const frequency = this.kickOsc.frequency;
    frequency.cancelAndHoldAtTime(t);
    frequency.setValueAtTime(fundamental * 18, t);
    frequency.exponentialRampToValueAtTime(fundamental * 7.5, t + 0.015);
    frequency.exponentialRampToValueAtTime(fundamental, t + 0.115);
    const length = Math.min(0.3, (60 / song.bpm) * 0.72);
    this.kickAmp.triggerAttackRelease(length, t, velocity);
    this.click.triggerAttackRelease(0.012, t, velocity * (0.5 + 0.5 * drive));
  }

  /** The 303: accents open the squelch filter wide, slides glide without a new attack. */
  private playAcid(song: Song, note: number, accent: boolean, slide: boolean, step: number, t: number, sixteenth: number, info: BarInfo) {
    const frequency = midiToHz(note);
    if (slide && this.lastAcid > 0) {
      this.acid.frequency.setValueAtTime(this.lastAcid, t);
      this.acid.frequency.exponentialRampToValueAtTime(frequency, t + 0.06);
    } else {
      // hold the note through the slides that follow it
      let length = 1;
      while (length < 4 && stepEvents(song, step + length).acid?.slide) length++;
      this.acid.triggerAttackRelease(frequency, sixteenth * (length - 0.45), t, accent ? 1 : 0.75);
    }
    this.lastAcid = frequency;
    // the cutoff wanders over 16 bars and opens with the energy
    const wander = 0.5 - 0.5 * Math.cos((2 * Math.PI * (info.bar + (step % STEPS_PER_BAR) / STEPS_PER_BAR)) / 16);
    const rest = 220 + 1400 * wander * info.energy;
    const peak = rest * (accent ? 6 : 3);
    const filter = this.acidFilter.frequency;
    filter.cancelAndHoldAtTime(t);
    filter.setValueAtTime(Math.min(12000, peak), t);
    filter.exponentialRampToValueAtTime(rest, t + (accent ? 0.12 : 0.22));
  }
}
