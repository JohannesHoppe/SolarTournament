import { Band, type Voice } from './band';
import { barSeconds, createSong, STEPS_PER_BAR, type Energy, type Flavor, type Song } from './songs';
import { loadVoice } from './voice';

/** Length of a tournament track in seconds: the round, then the outro. */
export function trackSeconds(song: Song): number {
  const outro = song.form[song.form.length - 1];
  return (outro.start + outro.bars) * barSeconds(song);
}

/** Rendering time grows faster than the music, so long tracks are pressed in chunks. */
const CHUNK = 20;
/** Each chunk starts this early, so reverbs, echoes and voice lines are already sounding at its seam (s). */
const PREROLL = 8;
/** Chunks overlap by this much and crossfade, so no seam clicks (s). */
const FADE = 0.05;
/** A seam lies this far before a beat (s). */
const SEAM_LEAD = 0.06;
/** Events are scheduled this far after the start of a render (s). */
const LEAD = 0.05;
/** The last chunk keeps ringing for this long (s), and its last FADE_OUT seconds fade to silence. */
const TAIL = 4;
const FADE_OUT = 1;

/**
 * Renders a stretch of a track offline, voice included, as 16-bit stereo WAV. The radio page
 * uses it for downloads; in development it lets you listen to tracks without playing.
 */
export async function renderTrack(song: Song, from: number, seconds: number, sampleRate = 44100, onProgress: (done: number) => void = () => {}): Promise<ArrayBuffer> {
  const T = await import('tone');
  const voice = await loadVoice();
  const total = Math.round((seconds + TAIL) * sampleRate);
  const out = [new Float32Array(total), new Float32Array(total)];
  const fade = Math.round(FADE * sampleRate);
  // the chunks' free-running oscillators are out of phase with each other: a seam sits just
  // before a beat, where the last kick has died away and the next has not begun
  const beat = barSeconds(song) / 4;
  const seams: number[] = [];
  for (let t = CHUNK; t < seconds; t += CHUNK) {
    const seam = Math.ceil((from + t + SEAM_LEAD) / beat) * beat - SEAM_LEAD - from;
    if (seam < seconds && seam > (seams[seams.length - 1] ?? 0)) seams.push(seam);
  }
  const bounds = [0, ...seams, seconds];
  for (let k = 0; k + 1 < bounds.length; k++) {
    const start = bounds[k];
    const last = k + 2 === bounds.length;
    const length = bounds[k + 1] - start;
    const pre = Math.min(PREROLL, from + start);
    const chunk = await renderChunk(T, song, voice, from + start - pre, pre + length, last ? TAIL : FADE, sampleRate);
    const skip = Math.round((pre + LEAD) * sampleRate);
    const at = Math.round(start * sampleRate);
    for (let c = 0; c < 2; c++) {
      const source = chunk[c];
      const target = out[c];
      for (let i = 0; skip + i < source.length && at + i < total; i++) {
        // the first samples blend with the overlap the previous chunk left behind
        const weight = start > 0 && i < fade ? i / fade : 1;
        target[at + i] = target[at + i] * (1 - weight) + source[skip + i] * weight;
      }
    }
    onProgress(Math.min(1, (start + length) / seconds));
  }
  // the rumble of the last bars dies away instead of being cut off
  const fadeOut = Math.round(FADE_OUT * sampleRate);
  for (const channel of out) for (let i = 0; i < fadeOut; i++) channel[total - 1 - i] *= i / fadeOut;
  return encodeWav(out, sampleRate);
}

async function renderChunk(T: typeof import('tone'), song: Song, voice: Voice, from: number, seconds: number, extra: number, sampleRate: number): Promise<Float32Array[]> {
  const buffer = await T.Offline(async (context) => {
    const band = new Band(T);
    band.output.toDestination();
    await band.ready();
    band.setVoice(voice);
    band.prepare(song);
    context.transport.bpm.value = song.bpm;
    const sixteenth = barSeconds(song) / STEPS_PER_BAR;
    const first = Math.ceil(from / sixteenth - 1e-9);
    const last = Math.ceil((from + seconds) / sixteenth - 1e-9);
    for (let step = first; step < last; step++) band.play(song, step, step * sixteenth - from + LEAD);
  }, LEAD + seconds + extra, 2, sampleRate);
  return buffer.toArray() as Float32Array[];
}

/** Development tool: a stretch of a track as base64 WAV plus what the generator decided. */
export async function renderPreview(title: string, energy: Energy, flavor: Flavor | undefined, from: number, seconds: number) {
  const song = createSong(title, energy, 300, flavor);
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

function encodeWav(channels: Float32Array[], sampleRate: number): ArrayBuffer {
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
