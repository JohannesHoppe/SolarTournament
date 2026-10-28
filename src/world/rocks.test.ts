import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { Randomizer } from '../random';
import { createRocks, createRockShapes, DETAIL_RES, detailMap, DISTANT_DETAIL, RELIEF_RES, reliefMap, reliefNormal, reliefShade } from './rocks';

/**
 * The texel a direction picks in a cube map, as WebGL picks it (the OpenGL ES 3.0 cube map
 * table: the major axis chooses the face in the order +x, −x, +y, −y, +z, −z, and sc, tc / |ma|
 * the place on it, row 0 at tc = −1). `mirror` flips s, as a bake with its faces the wrong way
 * round would read.
 */
function cubeTexel(d: THREE.Vector3, res: number, mirror = false): { face: number; i: number; j: number } {
  const ax = Math.abs(d.x), ay = Math.abs(d.y), az = Math.abs(d.z);
  let face: number, sc: number, tc: number, ma: number;
  if (ax >= ay && ax >= az) [face, sc, tc, ma] = d.x > 0 ? [0, -d.z, -d.y, ax] : [1, d.z, -d.y, ax];
  else if (ay >= az) [face, sc, tc, ma] = d.y > 0 ? [2, d.x, d.z, ay] : [3, d.x, -d.z, ay];
  else [face, sc, tc, ma] = d.z > 0 ? [4, d.x, -d.y, az] : [5, -d.x, -d.y, az];
  if (mirror) sc = -sc;
  const cell = (c: number) => Math.min(res - 1, Math.floor(((c / ma + 1) / 2) * res));
  return { face, i: cell(sc), j: cell(tc) };
}

/** The direction at the center of a texel, the same table read backwards. */
function texelCenter(face: number, i: number, j: number, res: number): THREE.Vector3 {
  const sc = ((i + 0.5) / res) * 2 - 1, tc = ((j + 0.5) / res) * 2 - 1;
  const axis = [[1, -tc, -sc], [-1, -tc, sc], [sc, 1, tc], [sc, -1, -tc], [sc, -tc, 1], [-sc, -tc, -1]][face];
  return new THREE.Vector3(...axis).normalize();
}

/** A texel of a face of a cube map, as its data lies row by row. */
function texel(map: THREE.CubeTexture, face: number, i: number, j: number): number[] {
  const { data, width } = (map.image as THREE.DataTexture[])[face].image as { data: Uint8Array; width: number };
  const o = (j * width + i) * 4;
  return [data[o], data[o + 1], data[o + 2], data[o + 3]];
}

const decode = ([r, g, b]: number[]) => new THREE.Vector3(r, g, b).divideScalar(255).multiplyScalar(2).subScalar(1).normalize();

/** Directions spread over the sphere, the same on every run. */
function directions(count: number): THREE.Vector3[] {
  const r = new Randomizer(77);
  return Array.from({ length: count }, () => new THREE.Vector3(r.range(-1, 1), r.range(-1, 1), r.range(-1, 1)).normalize());
}

const median = (values: number[]) => values.sort((a, b) => a - b)[values.length >> 1];

describe("a rock's relief map", () => {
  // the step to either side for the reference normal: one texel
  const step = Math.PI / 2 / RELIEF_RES;

  it('is six square faces whose edge halves down to one texel, so WebGL builds its mipmaps', () => {
    const map = reliefMap(0);
    const faces = map.image as THREE.DataTexture[];
    expect(faces).toHaveLength(6);
    for (const face of faces) expect([face.image.width, face.image.height]).toEqual([RELIEF_RES, RELIEF_RES]);
    expect(Math.log2(RELIEF_RES) % 1).toBe(0);
    expect(map.generateMipmaps).toBe(true);
  });

  it('holds, read as the GPU picks a texel for a direction, the surface normal there, and mirrored it would not', () => {
    for (const index of [0, 7, 15]) {
      const map = reliefMap(index);
      const angles: number[] = [], mirrored: number[] = [];
      let outward = 0;
      const sample = directions(600);
      for (const d of sample) {
        const { face, i, j } = cubeTexel(d, RELIEF_RES);
        // the direction the picked texel's center stands for, so the reference is taken where the texel was baked
        const center = texelCenter(face, i, j, RELIEF_RES);
        const reference = reliefNormal(index, center, step);
        const normal = decode(texel(map, face, i, j));
        angles.push(Math.acos(Math.min(1, normal.dot(reference))));
        if (normal.dot(d) > 0.3) outward++;
        const m = cubeTexel(center, RELIEF_RES, true);
        mirrored.push(Math.acos(Math.min(1, decode(texel(map, m.face, m.i, m.j)).dot(reference))));
      }
      // crater walls, grooves and cracks tilt a normal, but the surface faces outward almost everywhere
      expect(outward / sample.length).toBeGreaterThan(0.95);
      // the texel holds the normal of the place it stands for to a few degrees; read from the mirrored place, it would not
      process.stderr.write(`\nANG ${index} ${median([...angles])} ${median([...mirrored])}\n`);
      expect(median(angles)).toBeLessThan(0.1);
      expect(median(mirrored)).toBeGreaterThan(5 * median(angles));
    }
  });

  it("holds the shade there in its alpha, half the multiplier of the composition's color", () => {
    const map = reliefMap(3);
    const differences = directions(400).map((d) => {
      const { face, i, j } = cubeTexel(d, RELIEF_RES);
      return Math.abs((texel(map, face, i, j)[3] / 255) * 2 - reliefShade(3, d));
    });
    expect(median(differences)).toBeLessThan(0.05);
  });
});

describe('the detail map every rock shares up close', () => {
  const { data, width, height } = detailMap().image as { data: Uint8Array; width: number; height: number };
  const at = (x: number, y: number, channel: number) => data[(((y + height) % height) * width + ((x + width) % width)) * 4 + channel];

  it('is a square tile, repeated and mipmapped', () => {
    expect([width, height]).toEqual([DETAIL_RES, DETAIL_RES]);
    expect(Math.log2(DETAIL_RES) % 1).toBe(0);
    expect(detailMap().wrapS).toBe(THREE.RepeatWrapping);
    expect(detailMap().wrapT).toBe(THREE.RepeatWrapping);
    expect(detailMap().generateMipmaps).toBe(true);
  });

  it('runs on across its edges as smoothly as within, so the tiles show no seam', () => {
    let edge = 0, inner = 0;
    for (let k = 0; k < width; k++) {
      for (let c = 0; c < 3; c++) {
        edge += Math.abs(at(0, k, c) - at(-1, k, c)) + Math.abs(at(k, 0, c) - at(k, -1, c));
        inner += Math.abs(at(width / 2, k, c) - at(width / 2 - 1, k, c)) + Math.abs(at(k, height / 2, c) - at(k, height / 2 - 1, c));
      }
    }
    expect(edge).toBeLessThan(inner * 1.5);
  });

  it('keeps a rock its tone and its tilt on average, so it fades out with distance unseen', () => {
    let shade = 0, slopeX = 0, slopeY = 0;
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        shade += (at(x, y, 2) / 255) * 2;
        slopeX += (at(x, y, 0) / 255) * 2 - 1;
        slopeY += (at(x, y, 1) / 255) * 2 - 1;
      }
    }
    const cells = width * height;
    expect(Math.abs(shade / cells - 1)).toBeLessThan(0.08);
    expect(Math.abs(slopeX / cells)).toBeLessThan(0.02);
    expect(Math.abs(slopeY / cells)).toBeLessThan(0.02);
  });
});

describe('the shapes the collisions measure', () => {
  it('are the drawn rocks vertex for vertex, without normals or a material of their own', () => {
    const drawn = createRocks(DISTANT_DETAIL);
    const shapes = createRockShapes(DISTANT_DETAIL);
    expect(shapes).toHaveLength(drawn.length);
    shapes.forEach((shape, i) => {
      expect(Array.from(shape.geometry.getAttribute('position').array)).toEqual(Array.from(drawn[i].geometry.getAttribute('position').array));
      expect(shape.geometry.getAttribute('normal')).toBeUndefined();
      expect(shape.material).toBe(shapes[0].material);
    });
  });
});
