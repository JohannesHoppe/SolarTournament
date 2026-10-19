import type * as ToneLib from 'tone';
import { clipKey, words, type Language } from './lines';
import { barSeconds, stepEvents, STEPS_PER_BAR, type BarInfo, type Song, type VoiceLine } from './songs';

type Tone = typeof ToneLib;

const midiToHz = (note: number) => 440 * Math.pow(2, (note - 69) / 12);

/** A waveshaper curve normalised to ±1, so distortion adds grit without losing level. */
const saturate = (k: number) => (x: number) => Math.tanh(k * x) / Math.tanh(k);
/** The gabber kick's double saturation (Sonic Pi "gabberkick": tanh, then atan). */
const gabber = (x: number) => Math.atan(5.1 * Math.tanh(10 * x)) / Math.atan(5.1);

/** Master filter cutoff for a brightness of 0..1: 200 Hz to 18 kHz. */
const cutoff = (brightness: number) => 200 * Math.pow(90, Math.max(0, Math.min(1, brightness)));

/** The rendered words of the voices (see tools/voice/render.ts). */
export interface Voice {
  buffer: AudioBuffer;
  clips: Record<string, [number, number]>;
}

/** A word on its way out, for the subtitles. */
export interface Spoken {
  line: string;
  language: Language;
  time: number;
  duration: number;
}

/**
 * The instruments of Radio 2584 and how one sixteenth step of a track is played on them.
 * Works on whatever Tone context is active, live or offline.
 *
 * The kick is a sine with a two-stage pitch drop, saturated hard, plus a noise click. A copy
 * of it feeds the rumble: a long reverb, distorted, low-passed to the sub range, ducked by
 * every kick so it swells in between. Bass and harmony pump with the kick as well. The
 * master ends in a soft clipper: loud, dense, never harsh digital clipping. The voice of the
 * regime and the radio host bypass the master filter, so they cut through every breakdown.
 */
export class Band {
  readonly output: ToneLib.Gain;
  /** Called when a voice line is scheduled, with its audio start time. */
  onSpeak: (spoken: Spoken) => void = () => {};

  private readonly T: Tone;
  private readonly glue: ToneLib.Compressor;
  private readonly master: ToneLib.Filter;
  private readonly musicLevel: ToneLib.Gain;
  private readonly pump: ToneLib.Gain;
  private readonly fxSend: ToneLib.Gain;
  private readonly echo: ToneLib.FeedbackDelay;
  private readonly echoSend: ToneLib.Gain;
  private readonly reverbs: ToneLib.Reverb[] = [];

  private readonly kickOsc: ToneLib.Oscillator;
  private readonly kickDrive: ToneLib.Gain;
  private readonly kickAmp: ToneLib.AmplitudeEnvelope;
  private readonly kickHighpass: ToneLib.Filter;
  private readonly click: ToneLib.NoiseSynth;
  private readonly rumbleSend: ToneLib.Gain;
  private readonly rumbleDuck: ToneLib.Gain;

  private readonly hat: ToneLib.NoiseSynth;
  private readonly openHat: ToneLib.NoiseSynth;
  private readonly crush: ToneLib.BitCrusher;
  private readonly ride: ToneLib.NoiseSynth;
  private readonly clap: ToneLib.NoiseSynth;
  private readonly perc: ToneLib.MembraneSynth;
  private readonly percCrush: ToneLib.BitCrusher;
  private readonly cowbell: ToneLib.PolySynth;
  private readonly clave: ToneLib.Synth;

  private readonly bass: ToneLib.MonoSynth;
  private readonly bassDrive: ToneLib.Gain;
  private readonly bassHighpass: ToneLib.Filter;
  private readonly bassEcho: ToneLib.FeedbackDelay;
  private readonly acid: ToneLib.MonoSynth;
  private readonly acidFilter: ToneLib.Filter;
  private readonly acidDrive: ToneLib.Gain;
  private readonly stab: ToneLib.PolySynth;
  private readonly stabDrive: ToneLib.Gain;
  private readonly french: ToneLib.PolySynth;
  private readonly frenchFilter: ToneLib.Filter;
  private readonly pad: ToneLib.PolySynth;
  private readonly hoover: ToneLib.MonoSynth;
  private readonly bell: ToneLib.FMSynth;
  private readonly arp: ToneLib.Synth;
  private readonly siren: ToneLib.Synth;
  private readonly bomb: ToneLib.MembraneSynth;
  private readonly riser: ToneLib.NoiseSynth;
  private readonly riserFilter: ToneLib.Filter;
  private readonly impact: ToneLib.NoiseSynth;

  private readonly voiceIn: ToneLib.Gain;
  private readonly voiceEcho: ToneLib.Gain;
  private readonly hostIn: ToneLib.Gain;
  private readonly hostStatic: ToneLib.NoiseSynth;
  private voice: Voice | null = null;
  private voiceBuffer: ToneLib.ToneAudioBuffer | null = null;

  private flavor = '';
  /** Highpass of the bass; a breakdown lifts it, so the bass goes on without its low end. */
  private bassFloor = 60;
  private lastAcid = 0;

  constructor(T: Tone) {
    this.T = T;
    // master: filter -> level -> glue compressor -> soft clipper -> -1 dB ceiling
    this.output = new T.Gain(T.dbToGain(-1));
    const clipper = new T.WaveShaper(saturate(2), 4096).connect(this.output);
    clipper.oversample = '4x';
    this.glue = new T.Compressor({ threshold: -14, ratio: 4, attack: 0.02, release: 0.12, knee: 6 }).connect(new T.Gain(0.9).connect(clipper));
    this.musicLevel = new T.Gain(1).connect(this.glue);
    this.master = new T.Filter({ frequency: 18000, type: 'lowpass', rolloff: -24, Q: 0 }).connect(this.musicLevel);
    this.pump = new T.Gain(1).connect(this.master);

    // shared effects: a reverb for space, a dotted-eighth echo
    const space = this.reverb(T, 2.4);
    space.connect(this.master);
    this.fxSend = new T.Gain(1).connect(space);
    this.echo = new T.FeedbackDelay({ delayTime: '8n.', feedback: 0.38, wet: 1 }).connect(this.master);
    this.echoSend = new T.Gain(1).connect(this.echo);

    // kick: sine -> drive -> gabber shaper -> tame the fizz -> amplitude envelope
    const kickBus = new T.Gain(0.9).connect(this.master);
    this.kickHighpass = new T.Filter({ type: 'highpass', frequency: 10, Q: 0 }).connect(kickBus);
    this.kickAmp = new T.AmplitudeEnvelope({ attack: 0.001, decay: 0.01, sustain: 0.75, release: 0.03 }).connect(this.kickHighpass);
    const kickTone = new T.Filter({ type: 'lowpass', frequency: 7900, Q: 0 }).connect(this.kickAmp);
    const kickShaper = new T.WaveShaper(gabber, 4096).connect(kickTone);
    kickShaper.oversample = '4x';
    this.kickDrive = new T.Gain(1).connect(kickShaper);
    this.kickOsc = new T.Oscillator({ type: 'sine', frequency: 55 }).connect(this.kickDrive);
    this.kickOsc.start();
    this.click = new T.NoiseSynth({ noise: { type: 'white' }, envelope: { attack: 0.0005, decay: 0.012, sustain: 0 }, volume: -14 })
      .connect(new T.Filter({ type: 'bandpass', frequency: 3000, Q: 1 }).connect(this.kickHighpass));

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

    // hats, ride, clap, percussion, metal
    const hatBus = new T.Gain(1).connect(this.master);
    this.crush = new T.BitCrusher({ bits: 6 }).connect(hatBus);
    this.crush.wet.value = 0;
    this.hat = new T.NoiseSynth({ noise: { type: 'white' }, envelope: { attack: 0.001, decay: 0.03, sustain: 0 }, volume: -15 })
      .connect(new T.Filter({ type: 'highpass', frequency: 8200, Q: 0 }).connect(this.crush));
    this.openHat = new T.NoiseSynth({ noise: { type: 'white' }, envelope: { attack: 0.002, decay: 0.24, sustain: 0 }, volume: -17 })
      .connect(new T.Filter({ type: 'highpass', frequency: 7600, Q: 0 }).connect(this.crush));
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
    // 808-style cowbell: two square tones at 587 and 845 Hz through a band at 2.64 kHz
    const metalBand = new T.Filter({ type: 'bandpass', frequency: 2640, Q: 3 }).connect(this.percCrush);
    this.cowbell = new T.PolySynth(T.Synth, { oscillator: { type: 'square' }, envelope: { attack: 0.001, decay: 0.22, sustain: 0, release: 0.05 }, volume: -22 }).connect(metalBand);
    // clave: a short triangle click, woody
    this.clave = new T.Synth({ oscillator: { type: 'triangle' }, envelope: { attack: 0.001, decay: 0.03, sustain: 0, release: 0.01 }, volume: -14 }).connect(this.percCrush);

    // bass: saw -> filter envelope -> highpass (the rumble owns the sub) -> drive; a 16th echo for moroder pulses
    const bassShaper = new T.WaveShaper(saturate(3), 2048).connect(this.pump);
    this.bassEcho = new T.FeedbackDelay({ delayTime: '16n', feedback: 0, wet: 0 }).connect(bassShaper);
    this.bassDrive = new T.Gain(1).connect(this.bassEcho);
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
    this.stab = new T.PolySynth(T.Synth, { oscillator: { type: 'fatsawtooth', count: 3, spread: 30 }, envelope: { attack: 0.002, decay: 0.17, sustain: 0, release: 0.1 }, volume: -19 }).connect(this.stabDrive);

    // french touch: a chord loop through a phaser and a filter that opens and closes over 8 bars
    this.frenchFilter = new T.Filter({ type: 'lowpass', frequency: 600, rolloff: -24, Q: 4 }).connect(this.pump);
    const phaser = new T.Phaser({ frequency: 0.3, octaves: 3, baseFrequency: 350, wet: 0.5 }).connect(this.frenchFilter);
    this.french = new T.PolySynth(T.Synth, { oscillator: { type: 'fatsawtooth', count: 2, spread: 18 }, envelope: { attack: 0.004, decay: 0.2, sustain: 0.35, release: 0.08 }, volume: -16 }).connect(phaser);

    // motorik pad: slow, wide, under the machines
    const padTone = new T.Filter({ type: 'lowpass', frequency: 1800, Q: 0 }).connect(this.pump);
    padTone.connect(this.fxSend);
    this.pad = new T.PolySynth(T.Synth, { oscillator: { type: 'fatsawtooth', count: 3, spread: 24 }, envelope: { attack: 0.8, decay: 0.5, sustain: 0.7, release: 1.5 }, volume: -25 }).connect(padTone);

    // hoover: pulse width modulation, gliding, chorus
    const chorus = new T.Chorus({ frequency: 1.5, delayTime: 3.5, depth: 0.7, spread: 180, wet: 0.5 }).connect(this.pump);
    chorus.connect(this.fxSend);
    chorus.start();
    this.hoover = new T.MonoSynth({
      oscillator: { type: 'pwm', modulationFrequency: 6 },
      portamento: 0.12,
      filter: { type: 'lowpass', Q: 1, rolloff: -12 },
      envelope: { attack: 0.01, decay: 0.3, sustain: 0.8, release: 0.25 },
      filterEnvelope: { attack: 0.02, decay: 0.4, sustain: 0.6, release: 0.3, baseFrequency: 900, octaves: 2.5 },
      volume: -17,
    }).connect(chorus);

    // FM bell: inharmonic partials that die away fast, with echo
    const bellOut = new T.Gain(1).connect(this.pump);
    bellOut.connect(this.echoSend);
    this.bell = new T.FMSynth({
      harmonicity: 3.5,
      modulationIndex: 14,
      oscillator: { type: 'sine' },
      modulation: { type: 'sine' },
      envelope: { attack: 0.001, decay: 0.6, sustain: 0, release: 0.4 },
      modulationEnvelope: { attack: 0.001, decay: 0.15, sustain: 0, release: 0.2 },
      volume: -14,
    }).connect(bellOut);

    // motorik arpeggio: short square plings
    const arpOut = new T.Filter({ type: 'lowpass', frequency: 4200, Q: 0 }).connect(this.pump);
    arpOut.connect(this.echoSend);
    this.arp = new T.Synth({ oscillator: { type: 'square' }, envelope: { attack: 0.002, decay: 0.09, sustain: 0.05, release: 0.05 }, volume: -20 }).connect(arpOut);

    // surprises: an air-raid siren, a bomb into the reverb
    const sirenOut = new T.Gain(1).connect(this.master);
    sirenOut.connect(this.echoSend);
    this.siren = new T.Synth({ oscillator: { type: 'square' }, envelope: { attack: 0.05, decay: 0.1, sustain: 1, release: 0.3 }, volume: -22 }).connect(sirenOut);
    const bombOut = new T.Gain(1).connect(this.master);
    bombOut.connect(new T.Gain(2).connect(this.fxSend));
    this.bomb = new T.MembraneSynth({ pitchDecay: 0.3, octaves: 6, envelope: { attack: 0.001, decay: 1.2, sustain: 0, release: 0.3 }, volume: -6 }).connect(bombOut);

    // transitions: a noise riser into the drop, a crash on the first beat after it
    this.riserFilter = new T.Filter({ type: 'highpass', frequency: 1000, Q: 1 }).connect(this.master);
    this.riserFilter.connect(this.fxSend);
    this.riser = new T.NoiseSynth({ noise: { type: 'white' }, envelope: { attack: 3, decay: 0.1, sustain: 1, release: 0.05 }, volume: -20 }).connect(this.riserFilter);
    const impactTone = new T.Filter({ type: 'lowpass', frequency: 6000, Q: 0 }).connect(this.master);
    impactTone.connect(this.fxSend);
    this.impact = new T.NoiseSynth({ noise: { type: 'white' }, envelope: { attack: 0.001, decay: 1.3, sustain: 0, release: 0.1 }, volume: -13 }).connect(impactTone);

    // the regime's voice: ring-modulated, crushed, gritty, past the master filter; echo throws on the last word
    const voiceOut = new T.Gain(1.4).connect(this.glue);
    const voiceGrit = new T.Chebyshev({ order: 3, wet: 0.35 }).connect(voiceOut);
    voiceGrit.connect(new T.Gain(0.35).connect(this.fxSend));
    const voiceCrush = new T.BitCrusher({ bits: 7 }).connect(voiceGrit);
    voiceCrush.wet.value = 0.35;
    const voiceHigh = new T.Filter({ type: 'highpass', frequency: 160, Q: 0 }).connect(voiceCrush);
    const ring = new T.Gain(0).connect(voiceHigh);
    new T.Oscillator({ type: 'square', frequency: 62 }).connect(ring.gain).start();
    this.voiceIn = new T.Gain(1);
    this.voiceIn.connect(ring);
    this.voiceIn.connect(new T.Gain(0.55).connect(voiceHigh));
    this.voiceEcho = new T.Gain(0).connect(this.echoSend);
    voiceGrit.connect(this.voiceEcho);

    // the radio host: a narrow radio band, a little drive, static at the start and the end
    const hostOut = new T.Gain(1.3).connect(this.glue);
    const hostBand = new T.Filter({ type: 'bandpass', frequency: 1500, Q: 0.8 }).connect(new T.WaveShaper(saturate(2.5), 1024).connect(hostOut));
    this.hostIn = new T.Gain(1).connect(new T.Filter({ type: 'highpass', frequency: 350, Q: 0 }).connect(hostBand));
    this.hostStatic = new T.NoiseSynth({ noise: { type: 'white' }, envelope: { attack: 0.005, decay: 0.25, sustain: 0, release: 0.05 }, volume: -18 })
      .connect(new T.Filter({ type: 'bandpass', frequency: 2500, Q: 1.5 }).connect(hostOut));
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

  setVoice(voice: Voice) {
    this.voice = voice;
    this.voiceBuffer = new this.T.ToneAudioBuffer(voice.buffer);
  }

  /** Sets the sound of a track's flavor. */
  prepare(song: Song) {
    if (this.flavor === song.flavor) return;
    this.flavor = song.flavor;
    const crushed = song.flavor === 'industrial' || song.flavor === 'ebm';
    this.crush.wet.value = crushed ? 0.55 : 0;
    this.percCrush.wet.value = crushed || song.flavor === 'schranz' ? 0.8 : 0.2;
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

    if (pos === 0) this.startBar(song, info, time, bar);
    if (info.fill?.type === 'tapeStop' && pos === info.fill.from) this.tapeStop(time, beat * 2);

    if (events.kick) {
      this.kick(song, t, events.kick, info.drive, info.fill?.type === 'stutter' && pos >= 12 ? (pos - 11) * -200 : 0);
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
    if (events.metal) {
      if (events.metal.kind === 'cowbell') this.cowbell.triggerAttackRelease([587, 845], 0.08, t, events.metal.velocity);
      else this.clave.triggerAttackRelease(2500, 0.03, t, events.metal.velocity);
    }

    if (events.bass) this.bass.triggerAttackRelease(midiToHz(events.bass.note), sixteenth * (info.bassStyle === 'ebm' ? 0.6 : 0.8), t, events.bass.velocity);
    if (events.acid) this.playAcid(song, events.acid.note, events.acid.accent, events.acid.slide, step, t, sixteenth, info);

    if (events.chord) {
      const notes = events.chord.notes.map(midiToHz);
      const length = sixteenth * events.chord.length;
      if (song.flavor === 'french' && info.layers.chords) this.french.triggerAttackRelease(notes, length, t, events.chord.velocity);
      else if (events.chord.length > 4) this.pad.triggerAttackRelease(notes, length, t, events.chord.velocity);
      else this.stab.triggerAttackRelease(notes, length, t, events.chord.velocity);
    }
    if (events.lead) {
      const frequency = midiToHz(events.lead.note);
      const length = sixteenth * events.lead.length * 0.95;
      if (song.lead === 'hoover') this.hoover.triggerAttackRelease(frequency, length, t, events.lead.velocity);
      else if (song.lead === 'bell') this.bell.triggerAttackRelease(frequency, length, t, events.lead.velocity);
      else this.arp.triggerAttackRelease(frequency, sixteenth * 0.8, t, events.lead.velocity);
    }
  }

  private startBar(song: Song, info: BarInfo, t: number, bar: number) {
    this.master.frequency.cancelAndHoldAtTime(t);
    this.master.frequency.exponentialRampToValueAtTime(cutoff(info.brightness), t + bar);
    this.bassHighpass.frequency.setValueAtTime(info.section.kind === 'break' ? 380 : this.bassFloor, t);
    // a fake drop: the kick comes back without its low end
    this.kickHighpass.frequency.setValueAtTime(info.section.fake ? 250 : 10, t);
    this.rumbleSend.gain.setValueAtTime(info.section.fake ? 0 : info.layers.rumble ? 1 : 0, t);
    this.bassEcho.wet.setValueAtTime(info.bassStyle === 'moroder' ? 0.6 : 0, t);
    const drive = info.drive;
    this.kickDrive.gain.setValueAtTime(0.25 + 0.75 * drive, t);
    this.bassDrive.gain.setValueAtTime(0.5 + 1.5 * drive, t);
    this.acidDrive.gain.setValueAtTime(0.6 + 1.6 * drive, t);
    this.stabDrive.gain.setValueAtTime(0.6 + 1.4 * drive, t);
    // the french filter opens over four bars and closes over the next four
    const open = info.sweep < 0.5 ? info.sweep * 2 : 2 - info.sweep * 2;
    const next = info.sweep + 1 / 8 < 0.5 ? (info.sweep + 1 / 8) * 2 : 2 - (info.sweep + 1 / 8) * 2;
    this.frenchFilter.frequency.setValueAtTime(400 + 5200 * open * open, t);
    this.frenchFilter.frequency.linearRampToValueAtTime(400 + 5200 * next * next, t + bar);

    if (info.riserBars) {
      const length = bar * info.riserBars;
      this.riserFilter.frequency.setValueAtTime(1000, t);
      this.riserFilter.frequency.exponentialRampToValueAtTime(10000, t + length);
      this.riser.triggerAttackRelease(length - bar / 4, t, 0.9);
    }
    if (info.impact) this.impact.triggerAttackRelease(1.2, t, 1);
    if (info.surprise) this.surprise(song, info, t, bar);
    if (info.voice) this.speak(info.voice, t, bar / 8);
  }

  private surprise(song: Song, info: BarInfo, t: number, bar: number) {
    const s = info.surprise!;
    switch (s.type) {
      case 'delayThrow':
        // the echo swells into feedback over the bar and is cut on the next downbeat
        this.echo.feedback.setValueAtTime(0.38, t);
        this.echo.feedback.linearRampToValueAtTime(0.85, t + bar);
        this.echoSend.gain.setValueAtTime(1, t);
        this.echoSend.gain.linearRampToValueAtTime(2, t + bar);
        this.echo.feedback.setValueAtTime(0.38, t + bar + 0.1);
        this.echoSend.gain.setValueAtTime(1, t + bar + 0.1);
        break;
      case 'siren': {
        // an air-raid siren rising and falling over two bars
        const base = midiToHz(song.root + 48);
        this.siren.triggerAttackRelease(base, bar * 2, t, 0.8);
        for (let i = 0; i < 4; i++) {
          this.siren.frequency.linearRampToValueAtTime(base * 1.6, t + (i + 0.5) * (bar / 2));
          this.siren.frequency.linearRampToValueAtTime(base, t + (i + 1) * (bar / 2));
        }
        break;
      }
      case 'bomb':
        this.bomb.triggerAttackRelease(midiToHz(song.root - 12), 1, t, 1);
        break;
      case 'bitDrop':
        // the drums lose their bits for a bar
        this.crush.wet.setValueAtTime(1, t);
        this.crush.bits.setValueAtTime(12, t);
        this.crush.bits.linearRampToValueAtTime(3, t + bar * 0.75);
        this.crush.bits.setValueAtTime(6, t + bar);
        this.crush.wet.setValueAtTime(this.flavor === 'industrial' || this.flavor === 'ebm' ? 0.55 : 0, t + bar);
        break;
      default:
        break;
    }
  }

  /** The record slows down: every tonal part slides two octaves down, the level falls away. */
  private tapeStop(t: number, length: number) {
    for (const synth of [this.bass, this.acid, this.hoover, this.bell, this.arp]) {
      synth.detune.setValueAtTime(0, t);
      synth.detune.exponentialRampToValueAtTime(-2400, t + length);
    }
    this.musicLevel.gain.setValueAtTime(1, t);
    this.musicLevel.gain.linearRampToValueAtTime(0, t + length);
    this.master.frequency.cancelAndHoldAtTime(t);
    this.master.frequency.exponentialRampToValueAtTime(200, t + length);
    // the next bar starts in tune and at full level again
    for (const synth of [this.bass, this.acid, this.hoover, this.bell, this.arp]) synth.detune.setValueAtTime(0, t + length);
    this.musicLevel.gain.setValueAtTime(1, t + length);
  }

  /** Two-stage pitch drop: a fast click of pitch, then the body falls to the fundamental. */
  private kick(song: Song, t: number, velocity: number, drive: number, detune: number) {
    const fundamental = midiToHz(song.root) * Math.pow(2, detune / 1200);
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

  /**
   * The regime speaks. "speech": word after word. "chop": every word on its own eighth, like
   * a vocoder hook. The last word is thrown into the echo. Returns the end time.
   */
  speak(line: VoiceLine, t: number, eighth: number): number {
    const voice = this.voice;
    if (!voice || !this.voiceBuffer) return t;
    let position = t;
    const list = words(line.text);
    list.forEach(({ word, stop }, i) => {
      const clip = voice.clips[clipKey(line.language, word)];
      if (!clip) return;
      const start = line.style === 'chop' ? t + Math.ceil((position - t) / eighth - 1e-6) * eighth : position;
      this.playClip(clip, start, this.voiceIn);
      if (i === list.length - 1) {
        this.voiceEcho.gain.setValueAtTime(0.9, start);
        this.voiceEcho.gain.setValueAtTime(0, start + clip[1]);
      }
      position = start + clip[1] + (line.style === 'chop' ? 0.02 : 0.05) + (stop ? eighth : 0);
    });
    // the music steps back while the voice talks
    this.musicLevel.gain.setValueAtTime(0.75, t);
    this.musicLevel.gain.setValueAtTime(1, position);
    this.onSpeak({ line: line.text, language: line.language, time: t, duration: position - t });
    return position;
  }

  /** The radio host cuts in over the radio: static, the words, static. */
  host(text: string, name: string | null, t: number) {
    const voice = this.voice;
    if (!voice || !this.voiceBuffer) return;
    this.hostStatic.triggerAttackRelease(0.15, t, 0.9);
    let position = t + 0.18;
    for (const { word, stop } of words(text.replace('{name}', name ?? 'pilot'))) {
      const clip = voice.clips[clipKey('mod', word)];
      if (!clip) continue;
      this.playClip(clip, position, this.hostIn);
      position += clip[1] + 0.03 + (stop ? 0.22 : 0);
    }
    this.hostStatic.triggerAttackRelease(0.1, position + 0.05, 0.7);
    this.musicLevel.gain.cancelAndHoldAtTime(t);
    this.musicLevel.gain.linearRampToValueAtTime(0.55, t + 0.1);
    this.musicLevel.gain.setValueAtTime(0.55, position);
    this.musicLevel.gain.linearRampToValueAtTime(1, position + 0.4);
    this.onSpeak({ line: text, language: 'mod', time: t, duration: position - t });
  }

  private playClip([offset, duration]: [number, number], time: number, destination: ToneLib.InputNode) {
    const source = new this.T.ToneBufferSource(this.voiceBuffer!).connect(destination);
    source.onended = () => source.dispose();
    source.start(time, offset, duration);
  }
}
