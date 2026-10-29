import * as THREE from 'three';
import { expect } from 'vitest';
import { Randomizer } from '../random';

/**
 * Reading a baked cube map back the way the GPU does, for the tests of the relief maps of rock
 * and ice (see world/rocks, world/ice).
 */

/**
 * The texel a direction picks in a cube map, as WebGL picks it (the OpenGL ES 3.0 cube map
 * table: the major axis chooses the face in the order +x, −x, +y, −y, +z, −z, and sc, tc / |ma|
 * the place on it, row 0 at tc = −1). `mirror` flips s, as a bake with its faces the wrong way
 * round would read.
 */
export function cubeTexel(d: THREE.Vector3, res: number, mirror = false): { face: number; i: number; j: number } {
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
export function texelCenter(face: number, i: number, j: number, res: number): THREE.Vector3 {
  const sc = ((i + 0.5) / res) * 2 - 1, tc = ((j + 0.5) / res) * 2 - 1;
  const axis = [[1, -tc, -sc], [-1, -tc, sc], [sc, 1, tc], [sc, -1, -tc], [sc, -tc, 1], [-sc, -tc, -1]][face];
  return new THREE.Vector3(...axis).normalize();
}

/** A texel of a face of a cube map, as its data lies row by row. */
export function texel(map: THREE.CubeTexture, face: number, i: number, j: number): number[] {
  const { data, width } = (map.image as THREE.DataTexture[])[face].image as { data: Uint8Array; width: number };
  const o = (j * width + i) * 4;
  return [data[o], data[o + 1], data[o + 2], data[o + 3]];
}

/** The texel a direction picks, as the GPU picks it (see cubeTexel). */
export function texelAt(map: THREE.CubeTexture, d: THREE.Vector3, res: number): number[] {
  const { face, i, j } = cubeTexel(d, res);
  return texel(map, face, i, j);
}

/** A relief map of a shape's own (ice's, the comet nucleus's): not `other`'s, six square faces of `res` texels, mipmapped by WebGL. */
export function expectOwnCubeMap(map: THREE.CubeTexture, other: THREE.CubeTexture, res: number) {
  expect(map).not.toBe(other);
  const faces = map.image as THREE.DataTexture[];
  expect(faces).toHaveLength(6);
  for (const face of faces) expect([face.image.width, face.image.height]).toEqual([res, res]);
  expect(map.generateMipmaps).toBe(true);
}

/** Two bakes of a relief map alike byte for byte. */
export function expectSameBake(a: Uint8Array[], b: Uint8Array[]) {
  a.forEach((face, i) => expect(Buffer.from(face).equals(Buffer.from(b[i]))).toBe(true));
}

/** A texel's normal, decoded from 0.5 + 0.5 · n. */
export const decode = ([r, g, b]: number[]) => new THREE.Vector3(r, g, b).divideScalar(255).multiplyScalar(2).subScalar(1).normalize();

/** Directions spread over the sphere, the same on every run. */
export function directions(count: number, seed = 77): THREE.Vector3[] {
  const r = new Randomizer(seed);
  return Array.from({ length: count }, () => new THREE.Vector3(r.range(-1, 1), r.range(-1, 1), r.range(-1, 1)).normalize());
}

export const median = (values: number[]) => [...values].sort((a, b) => a - b)[values.length >> 1];

/**
 * How well a cube map holds a reference normal (`reference(direction)`) where the GPU reads it:
 * the median angle (radians) between the texel's normal and the reference at the texel's
 * center, and the same read at the mirrored place; and the share of texels facing outward.
 */
export function normalFit(map: THREE.CubeTexture, res: number, reference: (d: THREE.Vector3) => THREE.Vector3, count = 600) {
  const angles: number[] = [], mirrored: number[] = [];
  let outward = 0;
  const sample = directions(count);
  for (const d of sample) {
    const { face, i, j } = cubeTexel(d, res);
    // the direction the picked texel's center stands for, so the reference is taken where the texel was baked
    const center = texelCenter(face, i, j, res);
    const expected = reference(center);
    const normal = decode(texel(map, face, i, j));
    angles.push(Math.acos(Math.min(1, normal.dot(expected))));
    if (normal.dot(d) > 0.3) outward++;
    const m = cubeTexel(center, res, true);
    mirrored.push(Math.acos(Math.min(1, decode(texel(map, m.face, m.i, m.j)).dot(expected))));
  }
  return { angle: median(angles), mirrored: median(mirrored), outward: outward / sample.length };
}

/** A detail tile's channel at a texel, its edges wrapping round. */
export function tileAt(tile: THREE.DataTexture) {
  const { data, width, height } = tile.image as { data: Uint8Array; width: number; height: number };
  return (x: number, y: number, channel: number) => data[(((y + height) % height) * width + ((x + width) % width)) * 4 + channel];
}

/** How a detail tile runs on across its edges against within (summed differences of rgb), and its mean b and slopes. */
export function tileStats(tile: THREE.DataTexture) {
  const { width, height } = tile.image as { width: number; height: number };
  const at = tileAt(tile);
  let edge = 0, inner = 0;
  for (let k = 0; k < width; k++) {
    for (let c = 0; c < 3; c++) {
      edge += Math.abs(at(0, k, c) - at(-1, k, c)) + Math.abs(at(k, 0, c) - at(k, -1, c));
      inner += Math.abs(at(width / 2, k, c) - at(width / 2 - 1, k, c)) + Math.abs(at(k, height / 2, c) - at(k, height / 2 - 1, c));
    }
  }
  let b = 0, slopeX = 0, slopeY = 0;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      b += at(x, y, 2) / 255;
      slopeX += (at(x, y, 0) / 255) * 2 - 1;
      slopeY += (at(x, y, 1) / 255) * 2 - 1;
    }
  }
  const cells = width * height;
  return { edge, inner, b: b / cells, slopeX: slopeX / cells, slopeY: slopeY / cells };
}
