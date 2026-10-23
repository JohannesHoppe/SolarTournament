import { Band, type Spoken } from './band';
import { barSeconds, createSong, STEPS_PER_BAR, type Energy, type Song } from './songs';
import { loadVoice } from './voice';
import { t } from '../i18n/i18n';
import { storageGet, storageSet } from '../storage';

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
/** The Host's volume, 0..1, shared by the game and the radio page. */
const VOLUME_KEY = 'solartournament.radio-volume';
/** Output level at full volume: the radio sits under the cockpit's own sounds. */
const VOLUME = 0.55;
/** How much the last lap lifts the lows and highs (dB), and how long it takes (s); see Radio.push. */
const PUSH_LOWS = 5;
const PUSH_HIGHS = 4;
const PUSH_SECONDS = 2;

/** The volume kept in this browser; full volume without one. */
function storedVolume() {
  const volume = Number(storageGet(VOLUME_KEY) ?? 1);
  return Number.isFinite(volume) ? Math.min(1, Math.max(0, volume)) : 1;
}

/** The Host's volume, 0..1: every radio on the page plays at it. */
let hostVolume = storedVolume();

/** A volume slider (0 to 100): it shows the Host's volume, turns it and remembers it. */
export function bindVolume(slider: HTMLInputElement) {
  slider.value = String(Math.round(hostVolume * 100));
  slider.addEventListener('input', () => {
    hostVolume = Number(slider.value) / 100;
    storageSet(VOLUME_KEY, String(hostVolume));
  });
}
/** A failed load of Tone.js or the voice is tried again after this long (s). */
const RETRY_SECONDS = 5;
/** An announcement needs this much quiet before the track's next line (s): the announcer's lines are a few seconds long. */
const ANNOUNCE_ROOM = 5;
/** An announcement that found no room for this long (s) is no longer news and is dropped. */
const ANNOUNCE_PATIENCE = 8;

/**
 * Radio 2584: the tournament's soundtrack in the cockpit. Tone.js loads only once the radio
 * plays. The radio does not keep its own time: every tick it compares its position with
 * the cue's clock and jumps when they disagree, so all pilots of a tournament hear the
 * same beat at the same moment.
 */
export class Radio {
  private readonly output: GainNode;
  private readonly muffler: BiquadFilterNode;
  /** Shelves that open the sound up when the race comes to its end (see push). */
  private readonly lows: BiquadFilterNode;
  private readonly highs: BiquadFilterNode;
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
  /** Audio time of the last step handed to the band; the instruments never take an earlier one. */
  private scheduledUntil = 0;
  /** The output level the radio is set to, and the end of a running drop-out. */
  private level = 0;
  private dropoutUntil = 0;
  private warned = false;
  /** The band has its voice; until then, and after a failed load, when to try again (performance.now, ms). */
  private voiced = false;
  private retryAt = 0;
  /** An announcement waiting for room on air (see announce). */
  private pendingAnnouncement: { text: string; name: string | null; until: number } | null = null;

  constructor(
    private readonly context: AudioContext,
    destination: AudioNode,
    private readonly onSong: (song: Song) => void,
    /** A voice line starts in `delayMs` milliseconds, for the subtitles. */
    private readonly onSpeak: (spoken: Spoken, delayMs: number) => void,
    /** The game remembers whether the pilot switched the radio off; the radio page always plays. */
    private readonly remember = true,
  ) {
    this.muffler = context.createBiquadFilter();
    this.muffler.type = 'lowpass';
    this.muffler.frequency.value = 20000;
    this.output = context.createGain();
    this.output.gain.value = 0;
    this.lows = context.createBiquadFilter();
    this.lows.type = 'lowshelf';
    this.lows.frequency.value = 120;
    this.highs = context.createBiquadFilter();
    this.highs.type = 'highshelf';
    this.highs.frequency.value = 6000;
    this.muffler.connect(this.lows).connect(this.highs).connect(this.output).connect(destination);
    // without a kept choice the radio starts switched on
    if (remember) this.enabledFlag = storageGet(ENABLED_KEY) !== 'off';
    setInterval(() => this.tick(), TICK_MS);
  }

  /** Stops the music; the next cue starts it again from the cue's position. */
  stop() {
    this.cue = null;
    this.songKey = '';
    this.pendingAnnouncement = null;
    this.level = 0;
    this.output.gain.setTargetAtTime(0, this.context.currentTime, 0.05);
  }

  /** A cue is set: the radio plays (or waits for its band to load). */
  get playing() {
    return this.cue !== null;
  }

  get enabled() {
    return this.enabledFlag;
  }

  /** Switches the radio on or off. */
  toggle() {
    this.enabledFlag = !this.enabledFlag;
    if (this.remember) storageSet(ENABLED_KEY, this.enabledFlag ? 'on' : 'off');
    if (this.enabledFlag) this.songKey = '';
  }

  /** The output level the radio should have now: the Host's volume while it is on. */
  private targetLevel() {
    return this.enabledFlag ? VOLUME * hostVolume : 0;
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

  /**
   * The last lap: the cockpit's radio opens up, the kick heavier and the hats brighter by
   * PUSH_LOWS and PUSH_HIGHS (dB), over PUSH_SECONDS. Only the own cockpit hears it; the notes
   * and the beat stay those of every pilot.
   */
  push(on: boolean) {
    const now = this.context.currentTime;
    this.lows.gain.setTargetAtTime(on ? PUSH_LOWS : 0, now, PUSH_SECONDS / 3);
    this.highs.gain.setTargetAtTime(on ? PUSH_HIGHS : 0, now, PUSH_SECONDS / 3);
  }

  /** A short drop-out of the link: the radio cuts out for a moment; a stopped radio stays silent. */
  dropout(seconds: number) {
    if (!this.band || !this.cue) return;
    const now = this.context.currentTime;
    const gain = this.output.gain;
    gain.cancelScheduledValues(now);
    gain.setValueAtTime(gain.value, now);
    const level = this.targetLevel();
    gain.linearRampToValueAtTime(0.05 * level, now + 0.02);
    gain.setValueAtTime(0.05 * level, now + seconds);
    gain.linearRampToValueAtTime(level, now + seconds + 0.05);
    // the level the drop-out returns to is set; the tick leaves the gain alone until it is over
    this.dropoutUntil = now + seconds + 0.05;
    this.level = level;
  }

  /**
   * Loads Tone.js and the band. A failed load (a dropped connection) is tried again after
   * RETRY_SECONDS; so is a failed voice, while the music already plays without it.
   */
  private async load() {
    this.loading = true;
    try {
      const T = await import('tone');
      T.setContext(this.context);
      const band = new Band(T);
      band.output.connect(this.muffler);
      band.onSpeak = (spoken) => this.onSpeak(spoken, (spoken.time - this.context.currentTime) * 1000);
      await band.ready();
      this.band = band;
      await this.loadBandVoice();
    } catch (error) {
      console.warn('Radio unavailable', error);
      this.retryAt = performance.now() + RETRY_SECONDS * 1000;
    } finally {
      this.loading = false;
    }
  }

  private async loadBandVoice() {
    try {
      this.band!.setVoice(await loadVoice());
      this.voiced = true;
    } catch (error) {
      // without the voice the music still plays
      console.warn('Radio voice unavailable', error);
      this.retryAt = performance.now() + RETRY_SECONDS * 1000;
    }
  }

  /**
   * The announcer comments on the action, over the music; a stopped radio says nothing. Two
   * voices never talk at once: the line waits until the voice on air is through and no line of
   * the track is due within ANNOUNCE_ROOM seconds, and is dropped after ANNOUNCE_PATIENCE.
   */
  announce(text: string, name: string | null) {
    if (!this.band || !this.cue || !this.enabledFlag || this.context.state !== 'running') return;
    // in the Host's language: the sprite holds the announcer's lines rendered in each
    this.pendingAnnouncement = { text: t(text), name, until: this.context.currentTime + ANNOUNCE_PATIENCE };
  }

  /** Puts a waiting announcement on air once there is room for it (see announce). */
  private releaseAnnouncement(now: number, elapsed: number) {
    const pending = this.pendingAnnouncement;
    if (!pending || !this.band || !this.song) return;
    if (now > pending.until) {
      this.pendingAnnouncement = null;
      return;
    }
    if (now < this.band.voiceUntil + 0.3 || this.nextTrackLine(elapsed) < ANNOUNCE_ROOM) return;
    this.pendingAnnouncement = null;
    this.band.announce(pending.text, pending.name, now + 0.05);
  }

  /** Seconds until the next voice line the track plans (Infinity without one). */
  private nextTrackLine(elapsed: number): number {
    const song = this.song!;
    const bar = barSeconds(song);
    const now = elapsed / bar;
    let next = Infinity;
    for (const line of song.voice) {
      let at = line.bar;
      if (song.cycle) {
        at += Math.floor(now / song.cycle) * song.cycle;
        if (at < now) at += song.cycle;
      }
      if (at >= now) next = Math.min(next, (at - now) * bar);
    }
    return next;
  }

  private tick() {
    const cue = this.cue;
    if (!cue || this.context.state !== 'running') return;
    if (!this.band) {
      if (this.enabledFlag && !this.loading && performance.now() >= this.retryAt) void this.load();
      return;
    }
    if (!this.voiced && !this.loading && performance.now() >= this.retryAt) {
      this.loading = true;
      void this.loadBandVoice().finally(() => (this.loading = false));
    }
    const now = this.context.currentTime;
    // the level only changes when the radio is switched or turned up or down, and never during a drop-out
    const level = this.targetLevel();
    if (level !== this.level && now >= this.dropoutUntil) {
      this.level = level;
      this.output.gain.setTargetAtTime(level, now, 0.05);
    }
    if (!this.enabledFlag) return;

    const elapsed = cue.elapsed + (performance.now() - this.cueAt) / 1000;
    const key = `${cue.title}:${cue.energy}:${cue.roundLength}`;
    if (key !== this.songKey) {
      this.songKey = key;
      this.song = createSong(cue.title, cue.energy, cue.roundLength);
      this.band.prepare(this.song);
      this.start = Infinity;
      this.onSong(this.song);
      // joining a track after its announcement's downbeat: the station names it on the next
      // bar. The scheduler only skips downbeats before the first step it plays (now, or after
      // the old track's last note); a lounge track names itself again in every cycle, so
      // when that comes within two bars, the scheduler is left to it.
      const bars = (elapsed + Math.max(0, this.scheduledUntil - now) + 1e-3) / barSeconds(this.song);
      const position = this.song.cycle ? bars % this.song.cycle : bars;
      const announced = this.song.voice[0].bar;
      const nextByItself = this.song.cycle ? this.song.cycle - position + announced : Infinity;
      this.lateAnnouncement = position > announced && nextByItself > 2;
    }
    const song = this.song!;
    const sixteenth = barSeconds(song) / STEPS_PER_BAR;
    if (this.lateAnnouncement) {
      const nextBar = Math.ceil(elapsed / barSeconds(song) + 0.25);
      const at = now - elapsed + nextBar * barSeconds(song);
      if (at >= this.band.voiceUntil) this.band.speak(song.voice[0], at, barSeconds(song) / 8);
      this.lateAnnouncement = false;
    }
    const desiredStart = now - elapsed;
    if (Math.abs(desiredStart - this.start) > RESYNC) {
      this.start = desiredStart;
      // the old grid has notes out up to scheduledUntil: the new one starts after them, as
      // the instruments only take times later than their last one
      this.nextStep = Math.max(0, Math.ceil((Math.max(now, this.scheduledUntil + 1e-3) - this.start) / sixteenth));
      // landing inside a bar: its sound (filters, drive) is set up at once
      if (this.nextStep % STEPS_PER_BAR !== 0) this.guard(() => this.band!.joinBar(song, this.nextStep, now));
    }
    while (this.start + this.nextStep * sixteenth < now + LOOKAHEAD) {
      const time = this.start + this.nextStep * sixteenth;
      const step = this.nextStep++;
      if (time < now || time <= this.scheduledUntil) continue;
      this.scheduledUntil = time;
      this.guard(() => this.band!.play(song, step, time));
    }
    this.releaseAnnouncement(now, elapsed);
  }

  /** One failing instrument costs one note, not the beat: the scheduler goes on. */
  private guard(play: () => void) {
    try {
      play();
    } catch (error) {
      if (!this.warned) console.warn('Radio note dropped', error);
      this.warned = true;
    }
  }
}
