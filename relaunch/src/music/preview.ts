import { Band } from './band';
import { barSeconds, createSong, STEPS_PER_BAR, type Energy, type Flavor } from './songs';
import { loadVoice } from './voice';

/**
 * Development tool: renders a stretch of a track offline, voice included, and returns it as
 * a 16-bit stereo WAV file, base64-encoded. Used to listen to tracks without playing the game.
 */
export async function renderPreview(title: string, energy: Energy, flavor: Flavor | undefined, from: number, seconds: number) {
  const T = await import('tone');
  const song = createSong(title, energy, 300, flavor);
  const voice = await loadVoice();
  const sampleRate = 32000;
  const buffer = await T.Offline(async (context) => {
    const band = new Band(T);
    band.output.toDestination();
    await band.ready();
    band.setVoice(voice);
    band.prepare(song);
    context.transport.bpm.value = song.bpm;
    const sixteenth = barSeconds(song) / STEPS_PER_BAR;
    const first = Math.ceil(from / sixteenth);
    const last = Math.floor((from + seconds) / sixteenth);
    for (let step = first; step < last; step++) band.play(song, step, step * sixteenth - from + 0.05);
  }, seconds + 1.5, 2, sampleRate);
  return {
    title: song.title,
    flavor: song.flavor,
    strategy: song.strategy,
    bpm: song.bpm,
    form: song.form.map((s) => `${s.kind}:${s.bars}${s.groove !== 'four' ? '/' + s.groove : ''}${s.fake ? '/fake' : ''}`).join(' '),
    surprises: song.surprises.map((s) => `${s.type}@${s.bar}`).join(' '),
    voice: song.voice.map((v) => `${v.bar}:${v.language}:${v.style}`).join(' '),
    wav: encodeWav(buffer.toArray() as Float32Array[], sampleRate),
  };
}

function encodeWav(channels: Float32Array[], sampleRate: number): string {
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
  let binary = '';
  const array = new Uint8Array(bytes.buffer);
  for (let i = 0; i < array.length; i += 0x8000) binary += String.fromCharCode(...array.subarray(i, i + 0x8000));
  return btoa(binary);
}
