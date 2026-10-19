import { Band, type Spoken } from './band';
import { barSeconds, createSong, STEPS_PER_BAR, type Energy, type Song } from './songs';
import { loadVoice } from './voice';

/** What the radio should play: a track (by its title) and how far into it the music is. */
export interface MusicCue {
  title: string;
  energy: Energy;
  /** Seconds since the song began; tournament songs run on the shared round clock. */
  elapsed: number;
  roundLength: number;
}

/** Steps are scheduled this far ahead of the audio clock (s). */
const LOOKAHEAD = 0.2;
const TICK_MS = 40;
/** The music jumps to the shared clock when it is this far off (s). */
const RESYNC = 0.12;
const ENABLED_KEY = 'solartournament.radio';
const VOLUME = 0.55;

/**
 * Radio 2584: the tournament's soundtrack in the cockpit. Tone.js loads only once the radio
 * plays. The radio does not keep its own time: every tick it compares its position with
 * the cue's clock and jumps when they disagree, so all pilots of a tournament hear the
 * same beat at the same moment.
 */
export class Radio {
  private readonly output: GainNode;
  private readonly muffler: BiquadFilterNode;
  private band: Band | null = null;
  private loading = false;
  song: Song | null = null;
  private songKey = '';
  /** Audio time at which the song's elapsed time was zero. */
  private start = 0;
  private nextStep = 0;
  private cue: MusicCue | null = null;
  private cueAt = 0;
  private enabledFlag = true;
  private lateAnnouncement = false;

  constructor(
    private readonly context: AudioContext,
    destination: AudioNode,
    private readonly onSong: (song: Song) => void,
    /** A voice line starts in `delayMs` milliseconds, for the subtitles. */
    private readonly onSpeak: (spoken: Spoken, delayMs: number) => void,
  ) {
    this.muffler = context.createBiquadFilter();
    this.muffler.type = 'lowpass';
    this.muffler.frequency.value = 20000;
    this.output = context.createGain();
    this.output.gain.value = 0;
    this.muffler.connect(this.output).connect(destination);
    try {
      this.enabledFlag = localStorage.getItem(ENABLED_KEY) !== 'off';
    } catch {
      // storage unavailable: the radio starts switched on
    }
    setInterval(() => this.tick(), TICK_MS);
  }

  get enabled() {
    return this.enabledFlag;
  }

  /** Switches the radio on or off; returns the new state. */
  toggle(): boolean {
    this.enabledFlag = !this.enabledFlag;
    try {
      localStorage.setItem(ENABLED_KEY, this.enabledFlag ? 'on' : 'off');
    } catch {
      // not remembered
    }
    if (this.enabledFlag) this.songKey = '';
    return this.enabledFlag;
  }

  /** Called every frame with what should be playing. */
  setCue(cue: MusicCue) {
    this.cue = cue;
    this.cueAt = performance.now();
  }

  /** The lost clone's radio fades into the distance; the next clone hears it clearly again. */
  setMuffled(muffled: boolean) {
    const now = this.context.currentTime;
    this.muffler.frequency.setTargetAtTime(muffled ? 450 : 20000, now, muffled ? 0.25 : 0.6);
  }

  /** A short drop-out of the link: the radio cuts out for a moment. */
  dropout(seconds: number) {
    if (!this.band) return;
    const now = this.context.currentTime;
    const gain = this.output.gain;
    gain.cancelScheduledValues(now);
    gain.setValueAtTime(gain.value, now);
    gain.linearRampToValueAtTime(0.05 * VOLUME, now + 0.02);
    gain.setValueAtTime(0.05 * VOLUME, now + seconds);
    gain.linearRampToValueAtTime(this.enabledFlag ? VOLUME : 0, now + seconds + 0.05);
  }

  private async load() {
    this.loading = true;
    const T = await import('tone');
    T.setContext(this.context);
    const band = new Band(T);
    band.output.connect(this.muffler);
    band.onSpeak = (spoken) => this.onSpeak(spoken, (spoken.time - this.context.currentTime) * 1000);
    await band.ready();
    try {
      band.setVoice(await loadVoice());
    } catch (error) {
      // without the voice the music still plays
      console.warn('Radio voice unavailable', error);
    }
    this.band = band;
  }

  /** The radio host comments on the action, over the music. */
  host(text: string, name: string | null) {
    if (!this.band || !this.enabledFlag || this.context.state !== 'running') return;
    this.band.host(text, name, this.context.currentTime + 0.05);
  }

  private tick() {
    const cue = this.cue;
    if (!cue || this.context.state !== 'running') return;
    if (!this.band) {
      if (this.enabledFlag && !this.loading) void this.load();
      return;
    }
    const now = this.context.currentTime;
    this.output.gain.setTargetAtTime(this.enabledFlag ? VOLUME : 0, now, 0.15);
    if (!this.enabledFlag) return;

    const elapsed = cue.elapsed + (performance.now() - this.cueAt) / 1000;
    const key = `${cue.title}:${cue.energy}:${cue.roundLength}`;
    if (key !== this.songKey) {
      this.songKey = key;
      this.song = createSong(cue.title, cue.energy, cue.roundLength);
      this.band.prepare(this.song);
      this.start = Infinity;
      this.onSong(this.song);
      // joining a track after its announcement: the station names it on the next bar
      this.lateAnnouncement = elapsed > barSeconds(this.song) * (this.song.voice[0].bar - 1);
    }
    const song = this.song!;
    const sixteenth = barSeconds(song) / STEPS_PER_BAR;
    if (this.lateAnnouncement) {
      const nextBar = Math.ceil(elapsed / barSeconds(song) + 0.25);
      this.band.speak(song.voice[0], now - elapsed + nextBar * barSeconds(song), barSeconds(song) / 8);
      this.lateAnnouncement = false;
    }
    const desiredStart = now - elapsed;
    if (Math.abs(desiredStart - this.start) > RESYNC) {
      this.start = desiredStart;
      this.nextStep = Math.max(0, Math.ceil((now - this.start) / sixteenth));
    }
    while (this.start + this.nextStep * sixteenth < now + LOOKAHEAD) {
      const time = this.start + this.nextStep * sixteenth;
      if (time >= now) this.band.play(song, this.nextStep, time);
      this.nextStep++;
    }
  }
}
