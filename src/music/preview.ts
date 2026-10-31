import { Band } from './band';
import { barSeconds, createSong, ROUND_SECONDS, STEPS_PER_BAR, type Energy, type Flavor, type Song } from './songs';
import { loadVoice } from './voice';

/** Length of a tournament track in seconds: the round, then the outro. */
export function trackSeconds(song: Song): number {
  const outro = song.form[song.form.length - 1];
  return (outro.start + outro.bars) * barSeconds(song);
}

/** A stretch that starts inside a track starts this early, so reverbs, echoes and voice lines are already sounding where it begins (s). */
const PREROLL = 8;
/** Events are scheduled this far after the start of a render (s). */
const LEAD = 0.05;
/** The track keeps ringing for this long after its last step (s), and its last FADE_OUT seconds fade to silence. */
const TAIL = 4;
const FADE_OUT = 1;
/** The audio a render works on at a time, and the step of Tone's clock (frames). */
const BLOCK = 128;
/**
 * The render stops every this many blocks (about 1.5 s at 44.1 kHz) and the band plays the next
 * stretch. Notes scheduled all at once sit in the audio graph from the start, each of them
 * costing time in every block, so the render slows down with its length; played stretch by
 * stretch, the graph holds little more than what sounds.
 */
const STRETCH_BLOCKS = 512;
/** A step is played at least this long before the render reaches it (s). */
const AHEAD = 0.1;

/**
 * Renders a stretch of a track offline, voice included, as 16-bit stereo WAV, in one pass:
 * the band plays it a stretch ahead of the render. The radio page uses it for downloads; in
 * development it lets you listen to tracks without playing.
 */
export async function renderTrack(song: Song, from: number, seconds: number, sampleRate = 44100, onProgress: (done: number) => void = () => {}): Promise<ArrayBuffer> {
  const T = await import('tone');
  const voice = await loadVoice();
  const pre = Math.min(PREROLL, from);
  const start = from - pre;
  const length = LEAD + pre + seconds + TAIL;
  const raw = new OfflineAudioContext(2, Math.ceil(length * sampleRate), sampleRate);
  const block = BLOCK / sampleRate;
  const stretch = STRETCH_BLOCKS * block;
  /**
   * Tone's context on the render, offline as Tone's own offline context is (nothing disposed
   * while the render runs), but with its clock run by hand: block by block, a stretch ahead of
   * the render, so whatever Tone holds back on its clock (a chord's notes, a sound's end) reaches
   * the render at its time.
   */
  const context = new (class extends T.Context {
    override readonly isOffline = true;
    /** Blocks Tone's clock has run. */
    private blocks = 0;
    override now() {
      return this.blocks * block;
    }
    override immediate() {
      return this.now();
    }
    override get currentTime() {
      return this.now();
    }
    /** Runs Tone's clock up to `until` (s), firing what is due in each block. */
    run(until: number) {
      for (; this.blocks * block < until; this.blocks++) this.emit('tick');
    }
    /** The bit crushers run as audio worklets, which have to be loaded before the render starts. */
    worklets() {
      return this.workletsAreReady();
    }
  })({ context: raw, clockSource: 'offline', lookAhead: 0, updateInterval: block });
  // Tone builds on its global context: the band's nodes are made in this one, and the global
  // context is handed back before anything is awaited
  const within = <R>(work: () => R): R => {
    const global = T.getContext();
    T.setContext(context);
    try {
      return work();
    } finally {
      T.setContext(global);
    }
  };
  const band = within(() => {
    const band = new Band(T);
    band.output.toDestination();
    return band;
  });
  await band.ready();
  within(() => {
    band.setVoice(voice);
    band.prepare(song);
    context.transport.bpm.value = song.bpm;
  });
  const sixteenth = barSeconds(song) / STEPS_PER_BAR;
  let step = Math.ceil(start / sixteenth - 1e-9);
  const last = Math.ceil((from + seconds) / sixteenth - 1e-9);
  const at = (step: number) => step * sixteenth - start + LEAD;
  /** The render stands at `time` (s): the band plays the next stretch, and Tone's clock runs through it. */
  const play = (time: number) =>
    within(() => {
      for (; step < last && at(step) < time + stretch + AHEAD; step++) band.play(song, step, at(step));
      context.run(time + stretch);
    });
  play(0);
  for (let stop = 1; stop * stretch < length; stop++) {
    const time = stop * stretch;
    void raw.suspend(time).then(() => {
      play(time);
      onProgress(time / length);
      void raw.resume();
    });
  }
  await context.worklets();
  const rendered = await raw.startRendering();
  const skip = Math.round((pre + LEAD) * sampleRate);
  const out = [0, 1].map((c) => rendered.getChannelData(c).subarray(skip));
  // the rumble of the last bars dies away instead of being cut off
  const fadeOut = Math.round(FADE_OUT * sampleRate);
  for (const channel of out) for (let i = 0; i < fadeOut; i++) channel[channel.length - 1 - i] *= i / fadeOut;
  onProgress(1);
  return encodeWav(out, sampleRate);
}

/** Development tool: a stretch of a track as base64 WAV plus what the generator decided. */
export async function renderPreview(title: string, energy: Energy, flavor: Flavor | undefined, from: number, seconds: number) {
  const song = createSong(title, energy, ROUND_SECONDS, flavor);
  const wav = await renderTrack(song, from, seconds, 32000);
  let binary = '';
  const bytes = new Uint8Array(wav);
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return {
    title: song.title,
    flavor: song.flavor,
    strategy: song.strategy,
    bpm: song.bpm,
    form: song.form.map((s) => `${s.kind}:${s.bars}${s.groove !== 'four' ? '/' + s.groove : ''}${s.fake ? '/fake' : ''}`).join(' '),
    surprises: song.surprises.map((s) => `${s.type}@${s.bar}`).join(' '),
    voice: song.voice.map((v) => `${v.bar}:${v.language}:${v.style}`).join(' '),
    wav: btoa(binary),
  };
}

/** 16-bit PCM WAV of the channels (interleaved), each sample clipped to [-1, 1]. */
export function encodeWav(channels: Float32Array[], sampleRate: number): ArrayBuffer {
  const frames = channels[0].length;
  const bytes = new DataView(new ArrayBuffer(44 + frames * channels.length * 2));
  const text = (offset: number, value: string) => [...value].forEach((c, i) => bytes.setUint8(offset + i, c.charCodeAt(0)));
  text(0, 'RIFF');
  bytes.setUint32(4, 36 + frames * channels.length * 2, true);
  text(8, 'WAVE');
  text(12, 'fmt ');
  bytes.setUint32(16, 16, true);
  bytes.setUint16(20, 1, true);
  bytes.setUint16(22, channels.length, true);
  bytes.setUint32(24, sampleRate, true);
  bytes.setUint32(28, sampleRate * channels.length * 2, true);
  bytes.setUint16(32, channels.length * 2, true);
  bytes.setUint16(34, 16, true);
  text(36, 'data');
  bytes.setUint32(40, frames * channels.length * 2, true);
  let offset = 44;
  for (let i = 0; i < frames; i++) {
    for (const channel of channels) {
      bytes.setInt16(offset, Math.max(-1, Math.min(1, channel[i])) * 32767, true);
      offset += 2;
    }
  }
  return bytes.buffer;
}
