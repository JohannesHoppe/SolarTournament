import { describe, expect, it } from 'vitest';
import { encodeWav } from './preview';

describe('the pressing as a WAV file', () => {
  const left = new Float32Array([0, 0.5, -0.5, 2]);
  const right = new Float32Array([1, -1, 0.25, -3]);
  const wav = new DataView(encodeWav([left, right], 44100));
  const text = (offset: number, length: number) => String.fromCharCode(...new Uint8Array(wav.buffer, offset, length));

  it('has the header of 16-bit stereo PCM at its rate', () => {
    expect(wav.byteLength).toBe(44 + 4 * 2 * 2);
    expect(text(0, 4)).toBe('RIFF');
    expect(wav.getUint32(4, true)).toBe(wav.byteLength - 8);
    expect(text(8, 8)).toBe('WAVEfmt ');
    expect(wav.getUint16(20, true)).toBe(1);
    expect(wav.getUint16(22, true)).toBe(2);
    expect(wav.getUint32(24, true)).toBe(44100);
    expect(wav.getUint32(28, true)).toBe(44100 * 4);
    expect(wav.getUint16(32, true)).toBe(4);
    expect(wav.getUint16(34, true)).toBe(16);
    expect(text(36, 4)).toBe('data');
    expect(wav.getUint32(40, true)).toBe(16);
  });

  it('interleaves the channels and clips each sample to full scale', () => {
    const samples = Array.from({ length: 8 }, (_, i) => wav.getInt16(44 + 2 * i, true));
    expect(samples).toEqual([0, 32767, 16383, -32767, -16383, 8191, 32767, -32767]);
  });
});
