import type * as ToneLib from 'tone';
import { barSeconds, chordAt, mixSeed, scaleNote, sectionAt, STEPS_PER_BAR, type Song, type Style } from './songs';

type Tone = typeof ToneLib;

/** Sound design per style: oscillators, filters and how dirty the bass and lead get. */
const VOICES: Record<Style, {
  bass: ToneLib.ToneOscillatorType;
  bassQ: number;
  bassDrive: number;
  lead: ToneLib.ToneOscillatorType;
  arp: ToneLib.ToneOscillatorType;
  crush: number;
  kickPitch: number;
}> = {
  robotik: { bass: 'square', bassQ: 3, bassDrive: 0.25, lead: 'square', arp: 'triangle', crush: 0, kickPitch: 48 },
  acid: { bass: 'sawtooth', bassQ: 14, bassDrive: 0.6, lead: 'sawtooth', arp: 'square', crush: 0, kickPitch: 45 },
  chip: { bass: 'triangle', bassQ: 1, bassDrive: 0.15, lead: 'square', arp: 'square', crush: 0.8, kickPitch: 52 },
  detroit: { bass: 'sine', bassQ: 2, bassDrive: 0.35, lead: 'triangle', arp: 'sine', crush: 0, kickPitch: 44 },
  rave: { bass: 'sawtooth', bassQ: 6, bassDrive: 0.85, lead: 'sawtooth', arp: 'sawtooth', crush: 0.3, kickPitch: 46 },
};

const midiToHz = (note: number) => 440 * Math.pow(2, (note - 69) / 12);

/** Small, repeatable velocity variation, so the machines groove a little. */
function humanize(song: Song, step: number): number {
  const h = mixSeed(song.seed, step);
  return 0.9 + (h % 1000) / 10000;
}

/**
 * The instruments of Radio 2584 and how one sixteenth step of a song is played on them.
 * Works on whatever Tone context is active, live or offline.
 */
export class Band {
  readonly output: ToneLib.Gain;
  private readonly master: ToneLib.Filter;
  /** Ducks bass and harmony on every kick: the pumping of club techno. */
  private readonly pump: ToneLib.Gain;
  private readonly kick: ToneLib.MembraneSynth;
  private readonly clap: ToneLib.NoiseSynth;
  private readonly hat: ToneLib.NoiseSynth;
  private readonly openHat: ToneLib.NoiseSynth;
  private readonly bass: ToneLib.MonoSynth;
  private readonly squelch: ToneLib.Filter;
  private readonly bassDirt: ToneLib.Distortion;
  private readonly lead: ToneLib.MonoSynth;
  private readonly leadDirt: ToneLib.Chebyshev;
  private readonly arp: ToneLib.Synth;
  private readonly crusher: ToneLib.BitCrusher;
  private readonly pad: ToneLib.PolySynth;
  private readonly stab: ToneLib.PolySynth;
  private readonly riser: ToneLib.NoiseSynth;
  private readonly riserFilter: ToneLib.Filter;
  private readonly reverb: ToneLib.Reverb;
  private style: Style | null = null;
  private lastBassNote = 0;

  constructor(T: Tone) {
    this.output = new T.Gain(1);
    const limiter = new T.Limiter(-1).connect(this.output);
    const glue = new T.Compressor({ threshold: -18, ratio: 3, attack: 0.01, release: 0.15 }).connect(limiter);
    this.master = new T.Filter({ frequency: 18000, type: 'lowpass', rolloff: -24, Q: 1 }).connect(glue);
    this.pump = new T.Gain(1).connect(this.master);

    this.reverb = new T.Reverb({ decay: 4.5, preDelay: 0.02, wet: 1 }).connect(this.master);
    const reverbSend = new T.Gain(0.35).connect(this.reverb);
    const echo = new T.PingPongDelay({ delayTime: '8n.', feedback: 0.38, wet: 0.3 }).connect(this.pump);
    echo.connect(reverbSend);

    this.kick = new T.MembraneSynth({
      pitchDecay: 0.045, octaves: 6, oscillator: { type: 'sine' },
      envelope: { attack: 0.001, decay: 0.42, sustain: 0, release: 0.05 },
      volume: -2,
    }).connect(new T.Distortion({ distortion: 0.15, wet: 0.4 }).connect(this.master));

    const clapTone = new T.Filter({ frequency: 1400, type: 'bandpass', Q: 1.2 }).connect(this.master);
    clapTone.connect(reverbSend);
    this.clap = new T.NoiseSynth({ noise: { type: 'white' }, envelope: { attack: 0.002, decay: 0.16, sustain: 0 }, volume: -10 }).connect(clapTone);

    const hatTone = new T.Filter({ frequency: 7500, type: 'highpass' }).connect(this.master);
    this.hat = new T.NoiseSynth({ noise: { type: 'white' }, envelope: { attack: 0.001, decay: 0.035, sustain: 0 }, volume: -17 }).connect(hatTone);
    this.openHat = new T.NoiseSynth({ noise: { type: 'white' }, envelope: { attack: 0.002, decay: 0.22, sustain: 0 }, volume: -20 }).connect(hatTone);

    // bass: synth -> resonant squelch filter -> distortion
    this.bassDirt = new T.Distortion({ distortion: 0.4, oversample: '4x', wet: 0.5 }).connect(this.pump);
    this.squelch = new T.Filter({ frequency: 900, type: 'lowpass', rolloff: -24, Q: 4 }).connect(this.bassDirt);
    this.bass = new T.MonoSynth({
      oscillator: { type: 'sawtooth' },
      filter: { Q: 1, type: 'lowpass', rolloff: -12 },
      envelope: { attack: 0.003, decay: 0.25, sustain: 0.5, release: 0.08 },
      filterEnvelope: { attack: 0.002, decay: 0.2, sustain: 0.3, release: 0.1, baseFrequency: 180, octaves: 4 },
      volume: -6,
    }).connect(this.squelch);

    this.leadDirt = new T.Chebyshev({ order: 3, wet: 0.2 }).connect(echo);
    this.leadDirt.connect(this.pump);
    this.lead = new T.MonoSynth({
      oscillator: { type: 'square' },
      portamento: 0.03,
      filter: { Q: 2, type: 'lowpass' },
      envelope: { attack: 0.01, decay: 0.2, sustain: 0.6, release: 0.2 },
      filterEnvelope: { attack: 0.01, decay: 0.3, sustain: 0.5, release: 0.3, baseFrequency: 600, octaves: 3 },
      volume: -17,
    }).connect(this.leadDirt);

    this.crusher = new T.BitCrusher({ bits: 5 }).connect(echo);
    this.crusher.wet.value = 0;
    this.crusher.connect(this.pump);
    this.arp = new T.Synth({ oscillator: { type: 'square' }, envelope: { attack: 0.002, decay: 0.12, sustain: 0.1, release: 0.08 }, volume: -19 }).connect(this.crusher);

    const padTone = new T.Filter({ frequency: 1600, type: 'lowpass' }).connect(this.pump);
    padTone.connect(reverbSend);
    this.pad = new T.PolySynth(T.Synth, {
      oscillator: { type: 'fatsawtooth', count: 3, spread: 28 },
      envelope: { attack: 1.2, decay: 0.6, sustain: 0.7, release: 2.5 },
      volume: -24,
    }).connect(padTone);

    this.stab = new T.PolySynth(T.Synth, {
      oscillator: { type: 'fatsquare', count: 2, spread: 12 },
      envelope: { attack: 0.003, decay: 0.16, sustain: 0, release: 0.12 },
      volume: -20,
    }).connect(echo);
    this.stab.connect(this.pump);

    this.riserFilter = new T.Filter({ frequency: 400, type: 'bandpass', Q: 3 }).connect(this.master);
    this.riserFilter.connect(reverbSend);
    this.riser = new T.NoiseSynth({ noise: { type: 'pink' }, envelope: { attack: 4, decay: 0.1, sustain: 1, release: 0.3 }, volume: -22 }).connect(this.riserFilter);
  }

  /** Resolves when the reverb's impulse response is ready. */
  ready(): Promise<void> {
    return this.reverb.ready;
  }

  /** Sets the sound design of a song's style. */
  prepare(song: Song) {
    if (this.style === song.style) return;
    this.style = song.style;
    const voice = VOICES[song.style];
    this.bass.oscillator.type = voice.bass;
    this.squelch.Q.value = voice.bassQ;
    this.bassDirt.distortion = voice.bassDrive;
    this.lead.oscillator.type = voice.lead;
    this.arp.oscillator.type = voice.arp;
    this.crusher.wet.value = voice.crush;
  }

  /** Plays sixteenth step number `step` of the song at audio time `time`. */
  play(song: Song, step: number, time: number) {
    const bar = Math.floor(step / STEPS_PER_BAR);
    const pos = step % STEPS_PER_BAR;
    const section = sectionAt(song, bar);
    const sixteenth = barSeconds(song) / STEPS_PER_BAR;
    const t = time + (pos % 2 === 1 ? song.swing * sixteenth : 0);
    const chord = chordAt(song, bar);
    const feel = humanize(song, step);
    const voice = VOICES[song.style];
    const lastBarOfSection = section.bar === 7;

    if (pos === 0) {
      // master filter and dirt follow the arrangement, once per bar
      const brightness = section.brightness + (section.kind === 'build' ? 0.65 / 8 : 0);
      this.master.frequency.linearRampToValueAtTime(200 * Math.pow(90, Math.min(1, brightness)), t + barSeconds(song));
      this.bassDirt.wet.setValueAtTime(0.35 + 0.65 * section.dirt, t);
      this.leadDirt.wet.setValueAtTime(0.1 + 0.6 * section.dirt, t);
      if (section.kind === 'build' && section.bar === 4) {
        const length = barSeconds(song) * 4;
        this.riserFilter.frequency.setValueAtTime(300, t);
        this.riserFilter.frequency.exponentialRampToValueAtTime(6000, t + length);
        this.riser.triggerAttackRelease(length * 0.98, t, 0.8);
      }
    }

    // drums; the last beat before a drop stays empty for the impact
    const silenceBeforeDrop = section.kind === 'build' && lastBarOfSection && pos >= 12;
    if (section.kick && song.kick[pos] && !silenceBeforeDrop) {
      this.kick.triggerAttackRelease(midiToHz(voice.kickPitch) * 0.5, '8n', t, song.kick[pos] * feel);
      this.pump.gain.cancelScheduledValues(t);
      this.pump.gain.setValueAtTime(0.35, t);
      this.pump.gain.linearRampToValueAtTime(1, t + sixteenth * 2.5);
    }
    if (section.clap) {
      if (section.kind === 'build' && section.bar >= 6) {
        // snare roll into the drop, getting denser and louder
        const every = section.bar === 6 ? 2 : 1;
        if (pos % every === 0) this.clap.triggerAttackRelease(0.08, t, 0.3 + 0.7 * (pos / 16));
      } else if (song.clap[pos]) {
        this.clap.triggerAttackRelease(0.15, t, song.clap[pos] * feel);
      }
    }
    if (section.hat && song.hat[pos]) this.hat.triggerAttackRelease(0.03, t, song.hat[pos] * feel);
    if (section.openHat && song.openHat[pos]) this.openHat.triggerAttackRelease(0.2, t, song.openHat[pos] * feel);

    if (section.bass) this.playBass(song, section.bassVariation, chord, pos, t, sixteenth, feel);

    if (section.arp) {
      const index = song.arp[pos];
      if (index !== null) {
        const tones = [0, 2, 4, 7, 9, 11];
        const note = scaleNote(song, chord + tones[index]) + 36;
        this.arp.triggerAttackRelease(midiToHz(note), sixteenth * 0.9, t, 0.6 * feel);
      }
    }

    if (section.lead) {
      const motif = song.lead[(bar % 2) * STEPS_PER_BAR + pos];
      if (motif) {
        const note = scaleNote(song, chord + motif.degree) + 36 + 12 * motif.octave;
        this.lead.triggerAttackRelease(midiToHz(note), sixteenth * motif.length * 0.95, t, motif.velocity);
      }
    }

    if (section.stab && song.stab[pos]) {
      this.stab.triggerAttackRelease(this.chordNotes(song, chord, 24), sixteenth * 1.5, t, song.stab[pos] * 0.8);
    }

    if (section.pad && pos === 0 && bar % song.chordBars === 0) {
      this.pad.triggerAttackRelease(this.chordNotes(song, chord, 24), barSeconds(song) * song.chordBars * 0.92, t, 0.6);
    }
  }

  private chordNotes(song: Song, chord: number, transpose: number): number[] {
    return [0, 2, 4, 6].map((d) => midiToHz(scaleNote(song, chord + d) + transpose));
  }

  private playBass(song: Song, variation: number, chord: number, pos: number, t: number, sixteenth: number, feel: number) {
    const line = song.bass[variation];
    const step = line[pos];
    if (!step) return;
    const note = scaleNote(song, chord + step.degree) + 12 * step.octave + (song.style === 'acid' || song.style === 'chip' ? 12 : 0);
    const frequency = midiToHz(note);
    // a slide glides from the held note instead of striking a new one
    if (step.slide && pos > 0 && line[pos - 1]) {
      this.bass.frequency.setValueAtTime(this.lastBassNote, t);
      this.bass.frequency.exponentialRampToValueAtTime(frequency, t + sixteenth * 0.6);
    } else {
      let length = 1;
      while (pos + length < STEPS_PER_BAR && line[pos + length]?.slide) length++;
      const gate = song.style === 'robotik' || song.style === 'chip' ? 0.5 : 0.8;
      this.bass.triggerAttackRelease(frequency, sixteenth * (length - 1 + gate), t, (step.accent ? 1 : 0.7) * feel);
    }
    this.lastBassNote = frequency;
    // the acid squelch: every note opens the resonant filter, accents open it wide
    const open = step.accent ? 5200 : 2200;
    const rest = song.style === 'acid' ? 380 : 900;
    this.squelch.frequency.cancelScheduledValues(t);
    this.squelch.frequency.setValueAtTime(open, t);
    this.squelch.frequency.exponentialRampToValueAtTime(rest, t + sixteenth * 1.6);
  }
}
