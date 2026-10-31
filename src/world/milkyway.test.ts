import { afterEach, describe, expect, it, vi } from 'vitest';
import { bakeMilkyWay, bakeSky, faintStars } from './milkyway';

const SIZE = 8;

/** The faces of a cube texture, as bytes. */
const facesOf = (texture: { image: { image: { data: Uint8Array } }[] }) => texture.image.map((face) => Array.from(face.image.data));

describe('baking the sky in background workers', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });
  const expected = bakeMilkyWay(SIZE).map((face) => Array.from(face));

  it('bakes here, all the same, where workers are missing', async () => {
    vi.stubGlobal('Worker', undefined);
    const { texture, faint } = await bakeSky(SIZE, true);
    expect(facesOf(texture as never)).toEqual(expected);
    expect(faint!.directions).toEqual(faintStars().directions);
  });

  it('bakes here a share whose worker cannot start', async () => {
    vi.stubGlobal('Worker', class { constructor() { throw new Error('no module workers'); } });
    const { texture, faint } = await bakeSky(SIZE, true);
    expect(facesOf(texture as never)).toEqual(expected);
    expect(faint!.fluxes).toEqual(faintStars().fluxes);
  });

  it('bakes here a share whose worker fails', async () => {
    vi.stubGlobal('Worker', class {
      onerror: (() => void) | null = null;
      onmessage = null;
      onmessageerror = null;
      terminate() {}
      postMessage() { queueMicrotask(() => this.onerror?.()); }
    });
    const { texture } = await bakeSky(SIZE);
    expect(facesOf(texture as never)).toEqual(expected);
  });

  it('gives up a worker that stays silent', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('Worker', class {
      onerror = null;
      onmessage = null;
      onmessageerror = null;
      terminate() {}
      postMessage() {}
    });
    const baking = bakeSky(SIZE);
    await vi.advanceTimersByTimeAsync(31000);
    expect(facesOf((await baking).texture as never)).toEqual(expected);
  });

  it('puts the faces of the workers back in their order', async () => {
    // a worker that bakes what it is sent, on its own thread's behalf
    vi.stubGlobal('navigator', { hardwareConcurrency: 4 });
    vi.stubGlobal('Worker', class {
      onmessage: ((event: { data: unknown }) => void) | null = null;
      onerror = null;
      onmessageerror = null;
      terminate() {}
      postMessage(job: { size: number; faces: number[] }) {
        const faces = bakeMilkyWay(job.size, job.faces);
        queueMicrotask(() => this.onmessage?.({ data: { faces, faint: null } }));
      }
    });
    const { texture } = await bakeSky(SIZE);
    expect(facesOf(texture as never)).toEqual(expected);
  });
});
