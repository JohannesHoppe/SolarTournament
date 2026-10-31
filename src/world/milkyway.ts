import * as THREE from 'three';
import { srgbByte } from '../srgb';
import { celestial, cubeDirection, galactic, galacticVector } from './celestial';
import { magnitudeFlux, starColor, type StarList } from './starfile';

/**
 * The Milky Way of the real sky, generated in code: a band of light along the galactic plane
 * (see celestial's galactic frame), wider and brighter towards the galactic center in
 * Sagittarius and faint towards the anticenter, with its bulge, its great star clouds, its dark
 * lanes of dust (the Great Rift from Cygnus through Aquila to Sagittarius, the Coalsack beside
 * the Southern Cross, the dark clouds of Ophiuchus) and the two Magellanic Clouds, all at their
 * real places; clumped and torn by noise from integer hashing, so every browser bakes the same
 * sky. Baked once into a cube map in the celestial frame (bakeMilkyWay, in a worker, see
 * milkyway.worker) that world/starmap draws behind the stars.
 */

/**
 * The edges (texels) of the baked cube maps: the smaller with the page, the larger only once the
 * picture's quality asks for it (see Space.setDetail). At 512 a texel spans 0.18° in the middle of
 * a face, at 1024 0.09°; the band's finest clumps and lanes are some 0.5° across.
 */
export const MILKY_WAY_SIZES = [512, 1024];

/** Degrees to radians. */
const DEG = Math.PI / 180;

/** A hash of three integers and a seed to 0..1, the same on every machine. */
function hash(x: number, y: number, z: number, seed: number): number {
  let h = Math.imul(x, 0x27d4eb2d) ^ Math.imul(y, 0x165667b1) ^ Math.imul(z, 0x9e3779b1) ^ Math.imul(seed, 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d);
  h = Math.imul(h ^ (h >>> 12), 0x297a2d39);
  return ((h ^ (h >>> 15)) >>> 0) / 4294967296;
}

/** The lattice of the noise: a shuffle of LATTICE places and a value (0 to 1) at each, from the hash, the same on every machine. */
const LATTICE = 512;
const shuffle = (() => {
  const order = Array.from({ length: LATTICE }, (_, i) => i);
  for (let i = LATTICE - 1; i > 0; i--) {
    const j = Math.floor(hash(i, 7, 3, 1) * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  return Int32Array.from([...order, ...order]);
})();
const lattice = Float32Array.from({ length: LATTICE }, (_, i) => hash(i, 11, 5, 2));
const wrap = (i: number) => i & (LATTICE - 1);
const corner = (x: number, y: number, z: number) => lattice[shuffle[shuffle[shuffle[wrap(x)] + wrap(y)] + wrap(z)]];

/** Smooth value noise in space (0 to 1): the lattice's values, blended by a quintic; `seed` shifts it to another place of the lattice. */
function noise(x: number, y: number, z: number, seed: number): number {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const iz = Math.floor(z);
  const fx = x - ix;
  const fy = y - iy;
  const fz = z - iz;
  const u = fx * fx * fx * (fx * (fx * 6 - 15) + 10);
  const v = fy * fy * fy * (fy * (fy * 6 - 15) + 10);
  const w = fz * fz * fz * (fz * (fz * 6 - 15) + 10);
  const x0 = ix + seed * 101;
  const a = corner(x0, iy, iz);
  const b = corner(x0 + 1, iy, iz);
  const c = corner(x0, iy + 1, iz);
  const d = corner(x0 + 1, iy + 1, iz);
  const e = corner(x0, iy, iz + 1);
  const f = corner(x0 + 1, iy, iz + 1);
  const g = corner(x0, iy + 1, iz + 1);
  const h = corner(x0 + 1, iy + 1, iz + 1);
  const near = a + (b - a) * u + (c + (d - c) * u - a - (b - a) * u) * v;
  const far = e + (f - e) * u + (g + (h - g) * u - e - (f - e) * u) * v;
  return near + (far - near) * w;
}

/** Noise of `octaves` octaves on the unit sphere at `frequency` (cycles across a radian, about), each half as strong as the last (0 to 1). */
function fbm(d: THREE.Vector3, frequency: number, octaves: number, seed: number): number {
  let sum = 0;
  let weight = 0;
  let amplitude = 1;
  let f = frequency;
  for (let o = 0; o < octaves; o++) {
    sum += amplitude * noise(d.x * f + 17.3 * o, d.y * f - 5.1 * o, d.z * f + 9.7 * o, seed + o);
    weight += amplitude;
    amplitude *= 0.5;
    f *= 2.03;
  }
  return sum / weight;
}

/** A bell over `x` (degrees) of width `width` (its standard deviation). */
const bell = (x: number, width: number) => Math.exp((-0.5 * x * x) / (width * width));
/** A galactic longitude's distance (degrees, -180 to 180) from `l0`. */
const along = (l: number, l0: number) => ((l - l0 + 540) % 360) - 180;
/** A round patch at galactic longitude `l0`, latitude `b0`, `width` degrees wide (its standard deviation). */
const patch = (l: number, b: number, l0: number, b0: number, width: number) => bell(along(l, l0), width) * bell(b - b0, width);

/** The Magellanic Clouds (right ascension, declination), their light and their size (degrees). */
const CLOUDS = [
  { at: celestial(80.9, -69.8), light: 0.55, size: 2.6 },
  { at: celestial(13.2, -72.8), light: 0.3, size: 1.3 },
];

/** How strongly the dust's reddening holds back green and blue against red, per unit of its depth. */
const REDDENING = [0, 0.18, 0.4];
/** The light that the baked map holds as its brightest: the Large Sagittarius Star Cloud comes to about this. */
const PEAK = 2.5;
/** The band's reach from the galactic plane (degrees): beyond it the disk's light is gone. */
const BAND = 30;
/** How much finer the noise runs across the galactic plane than along it. */
const STRETCH = 2.2;
/** The noise's place for a direction (see milkyWayLight). */
const flat = new THREE.Vector3();
const warped = new THREE.Vector3();

/**
 * The Milky Way's light (linear RGB, 0 to about 1) in the unit direction `d` of the celestial
 * frame, into `out`.
 */
export function milkyWayLight(d: THREE.Vector3, out: Float32Array | Uint8Array | number[]) {
  const { l, b } = galactic(d);
  // towards the center (1) or the anticenter (0)
  const center = 0.5 + 0.5 * Math.cos(l * DEG);
  let light = 0;
  let warm = 0;
  let dust = 0;
  const off = Math.abs(b);
  if (off < BAND) {
    // the noise's space: the galactic frame squeezed across the plane, so star clouds and dust
    // lanes stretch along the band as the disk's rotation draws them out
    galacticVector(d, flat).z *= STRETCH;
    // the disk: its scale height swells towards the center, its light falls towards the anticenter
    const height = 3 + 4 * center;
    const disk = (0.1 + 0.9 * center ** 3) * Math.exp(-((off / height) ** 1.3));
    // the bulge around the center, flattened along the plane
    const bulge = 1.6 * Math.exp(-0.5 * ((along(l, 0) / 10) ** 2 + (b / 7) ** 2));
    // the great star clouds: Sagittarius (large and small), Scutum, Cygnus, Carina, Norma
    const clouds =
      1.3 * patch(l, b, 2.5, -4.5, 3) +
      0.6 * patch(l, b, 12, -1.2, 2) +
      0.7 * patch(l, b, 27, -2.2, 2.3) +
      0.5 * bell(along(l, 76), 8) * bell(b - 1, 3.5) +
      0.45 * bell(along(l, 287), 7) * bell(b + 0.5, 3) +
      0.3 * bell(along(l, 330), 7) * bell(b + 0.5, 2.5);
    // clumped: star clouds of many sizes in the band, a fine grain of faint stars on top
    const clump = fbm(flat, 6, 5, 11);
    const lumpy = 0.3 + 1.6 * clump * clump;
    const grain = noise(d.x * 150, d.y * 150, d.z * 150, 23);
    const stars = ((disk + clouds) * lumpy + bulge * (0.7 + 0.6 * clump)) * (0.85 + 0.3 * grain);
    // the dust, where it lies: a thin dark lane along the plane, deep towards the center and
    // patchy elsewhere; the Great Rift from Cygnus to Sagittarius north of the plane,
    // wandering; the Coalsack; Ophiuchus's dark clouds reaching north from the center
    const lane = (0.25 + 1.5 * center ** 2) * bell(b - 0.3, 0.8 + 1.2 * center);
    const riftAt = 2.5 + 3 * (noise(l * 0.05, 3.1, 0.7, 41) - 0.5);
    const rift = 2.6 * THREE.MathUtils.smoothstep(along(l, 0), 3, 16) * (1 - THREE.MathUtils.smoothstep(along(l, 0), 72, 88)) * bell(b - riftAt, 2.2);
    const coalsack = 2 * patch(l, b, 301, -1, 1.9);
    const ophiuchus = 1.5 * (patch(l, b, 4, 7, 2.6) + 0.8 * patch(l, b, 356, 15, 2.4) + 0.7 * patch(l, b, 0, 3.5, 1.5) + 0.6 * patch(l, b, 8, 12, 2.2));
    // the rift and the Coalsack are dark all through, the rest only where the dust is torn thick
    const envelope = lane + rift + coalsack + ophiuchus;
    dust = 0.6 * (rift + coalsack);
    if (envelope > 0.01) {
      // torn into clouds with sharp edges, their shapes swirled by a coarser noise, so no
      // lattice shows through
      const swirl = 0.025 * (noise(flat.x * 9, flat.y * 9, flat.z * 9, 43) - 0.5);
      warped.set(flat.x + swirl, flat.y - swirl, flat.z + 2 * swirl);
      const torn = THREE.MathUtils.smoothstep(fbm(warped, 16, 5, 37), 0.45, 0.72);
      dust += envelope * (0.15 + 1.6 * torn);
    }
    light = (stars * Math.exp(-dust) * (1 - THREE.MathUtils.smoothstep(off, BAND * 0.7, BAND))) / PEAK;
    warm = Math.min(1, 0.15 + 0.55 * (bulge / Math.max(disk + clouds + bulge, 1e-6)) + 0.3 * center ** 2);
  }
  // the Magellanic Clouds, far below the plane
  for (const cloud of CLOUDS) {
    const from = Math.acos(THREE.MathUtils.clamp(d.dot(cloud.at), -1, 1)) / DEG;
    if (from < cloud.size * 4) light += (cloud.light * bell(from, cloud.size) * (0.4 + 1.2 * fbm(d, 45, 3, 51))) / PEAK;
  }
  // a band of many old stars glows warmer towards the bulge, a cool white elsewhere; dust
  // reddens what shines through it
  const tint = [0.86 + 0.14 * warm, 0.88 + 0.04 * warm, 1 - 0.25 * warm];
  for (let c = 0; c < 3; c++) out[c] = light * tint[c] * Math.exp(-REDDENING[c] * dust);
}


/** The faint stars below the catalogue's limit (see faintStars), and the magnitudes they span. */
const FAINT_COUNT = 24000;
const FAINT_MAGNITUDES = [6.8, 9];

/**
 * The stars too faint for the catalogue (fainter than the seventh magnitude, below what the eye
 * sees under a dark sky), generated: FAINT_COUNT of them, scattered over the sky the more
 * densely the brighter the Milky Way (see milkyWayLight) is there, a few everywhere, ever more
 * of them the fainter (as on the real sky), in the colors of ordinary stars. None of them is
 * bright enough to change a constellation's shape; together they fill the band with the grain
 * of its countless stars. The same on every machine.
 */
export function faintStars(): StarList {
  const directions = new Float32Array(FAINT_COUNT * 3);
  const colors = new Float32Array(FAINT_COUNT * 3);
  const fluxes = new Float32Array(FAINT_COUNT);
  const d = new THREE.Vector3();
  const rgb = new Float32Array(3);
  const [bright, faint] = FAINT_MAGNITUDES;
  for (let n = 0, k = 0; n < FAINT_COUNT; k++) {
    // a uniform direction on the sphere, kept by how dense the stars lie there
    const z = 2 * hash(k, 1, 0, 61) - 1;
    const phi = 2 * Math.PI * hash(k, 2, 0, 61);
    const r = Math.sqrt(1 - z * z);
    d.set(r * Math.cos(phi), r * Math.sin(phi), z);
    milkyWayLight(d, rgb);
    if (hash(k, 3, 0, 61) > 0.05 + 4 * rgb[1]) continue;
    directions.set([d.x, d.y, d.z], n * 3);
    // ever more stars the fainter: their count grows about 2.5 times a magnitude, so the
    // magnitude's share below m grows as 10^(0.4 m)
    const u = hash(k, 4, 0, 61);
    const m = Math.log10(10 ** (0.4 * bright) + u * (10 ** (0.4 * faint) - 10 ** (0.4 * bright))) / 0.4;
    fluxes[n] = magnitudeFlux(m);
    colors.set(starColor(-0.1 + 1.6 * hash(k, 5, 0, 61) ** 1.5), n * 3);
    n++;
  }
  return { count: FAINT_COUNT, directions, colors, fluxes };
}

/** Two lists of stars as one, the first's first. */
export function joinStars(a: StarList, b: StarList): StarList {
  const join = (x: Float32Array, y: Float32Array) => {
    const both = new Float32Array(x.length + y.length);
    both.set(x);
    both.set(y, x.length);
    return both;
  };
  return { count: a.count + b.count, directions: join(a.directions, b.directions), colors: join(a.colors, b.colors), fluxes: join(a.fluxes, b.fluxes) };
}

/**
 * The Milky Way as the six faces of a cube map in the celestial frame, `size` texels on an edge,
 * in the order and orientation WebGL reads them (see celestial's cubeTexel), each face RGBA in
 * sRGB, its top row first. Each texel holds the light at its center. Only the faces `faces` (indices into CUBE_FACES) when given.
 */
export function bakeMilkyWay(size: number, faces = [0, 1, 2, 3, 4, 5]): Uint8Array[] {
  const direction = new THREE.Vector3();
  const rgb = new Float32Array(3);
  return faces.map((face) => {
    const data = new Uint8Array(size * size * 4);
    for (let j = 0; j < size; j++) {
      for (let i = 0; i < size; i++) {
        milkyWayLight(cubeDirection(face, (i + 0.5) / size, (j + 0.5) / size, direction).normalize(), rgb);
        const at = (j * size + i) * 4;
        for (let c = 0; c < 3; c++) data[at + c] = srgbByte(rgb[c]);
        data[at + 3] = 255;
      }
    }
    return data;
  });
}

/** The baked faces (see bakeMilkyWay) as a cube map the GPU reads in the celestial frame, with mipmaps. */
export function milkyWayTexture(faces: Uint8Array[], size: number): THREE.CubeTexture {
  const texture = new THREE.CubeTexture(faces.map((data) => new THREE.DataTexture(data, size, size)) as unknown as HTMLImageElement[]);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.generateMipmaps = true;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.needsUpdate = true;
  return texture;
}

/** The faces each background worker bakes: three workers of two faces each. */
const WORKER_FACES = [
  [0, 1],
  [2, 3],
  [4, 5],
];

/** Bakes the Milky Way at `size` in background workers (see milkyway.worker), here and now where there are none. */
export async function bakeMilkyWayTexture(size: number): Promise<THREE.CubeTexture> {
  if (typeof Worker === 'undefined') return milkyWayTexture(bakeMilkyWay(size), size);
  const parts = await Promise.all(
    WORKER_FACES.map(
      (faces) =>
        new Promise<Uint8Array[]>((resolve, reject) => {
          const worker = new Worker(new URL('./milkyway.worker.ts', import.meta.url), { type: 'module' });
          worker.onmessage = (event: MessageEvent<Uint8Array[]>) => {
            worker.terminate();
            resolve(event.data);
          };
          worker.onerror = (error) => {
            worker.terminate();
            reject(new Error(`The Milky Way was not baked: ${error.message}`));
          };
          worker.postMessage({ size, faces });
        }),
    ),
  );
  return milkyWayTexture(parts.flat(), size);
}
