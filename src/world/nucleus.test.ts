import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { bakeNucleusRelief, LIGHT_RANGE, NUCLEUS_COLOR, nucleusGeometry, nucleusMaterial, nucleusNormal, nucleusReliefMap, nucleusTexel, nucleusVents } from './nucleus';
import { RELIEF_RES, reliefMap } from './rocks';
import { directions, expectOwnCubeMap, expectSameBake, median, normalFit, texelAt } from '../test/cube';

/** The brightness multipliers a map's alpha holds, texel by texel. */
function lights(map: THREE.CubeTexture): number[] {
  const all: number[] = [];
  for (const face of map.image as THREE.DataTexture[]) {
    const data = face.image.data as Uint8Array;
    for (let o = 3; o < data.length; o += 4) all.push((data[o] / 255) * LIGHT_RANGE);
  }
  return all;
}

describe("the comet nucleus's relief map", () => {
  const step = Math.PI / 2 / RELIEF_RES;

  it("is a cube map of its own beside the rocks', six square faces WebGL builds mipmaps for", () => {
    expectOwnCubeMap(nucleusReliefMap(), reliefMap(0), RELIEF_RES);
  });

  it('is baked the same on every call, from integer hashing and seeds alone', () => {
    expectSameBake(bakeNucleusRelief(), bakeNucleusRelief());
  });

  it('holds, read as the GPU picks a texel for a direction, the surface normal there, and mirrored it would not', () => {
    const fit = normalFit(nucleusReliefMap(), RELIEF_RES, (d) => nucleusNormal(d, step));
    // cliffs, pits and the neck tilt a normal, but the surface faces outward almost everywhere
    expect(fit.outward).toBeGreaterThan(0.9);
    expect(fit.angle).toBeLessThan(0.1);
    expect(fit.mirrored).toBeGreaterThan(5 * fit.angle);
  });

  it('holds the brightness there in its alpha', () => {
    const map = nucleusReliefMap();
    const differences = directions(400).map((d) => Math.abs(texelAt(map, d, RELIEF_RES)[3] / 255 - nucleusTexel(d).value));
    expect(median(differences)).toBeLessThan(0.01);
  });

  it('is a dark crust reflecting about 4 % of the light, with a little bright ice exposed', () => {
    const all = lights(nucleusReliefMap());
    const typical = median(all);
    const albedo = (typical * (NUCLEUS_COLOR[0] + NUCLEUS_COLOR[1] + NUCLEUS_COLOR[2])) / 3;
    expect(albedo).toBeGreaterThan(0.025);
    expect(albedo).toBeLessThan(0.055);
    // ice: several times brighter than the crust, on a few hundredths of the surface
    const ice = all.filter((light) => light > 4 * typical).length / all.length;
    expect(ice).toBeGreaterThan(0.005);
    expect(ice).toBeLessThan(0.06);
  });
});

describe("the comet nucleus's mesh", () => {
  const radius = 1400;
  const geometry = nucleusGeometry(12, radius);
  const position = geometry.getAttribute('position');
  const index = geometry.getIndex()!;

  it('is one closed surface: every edge shared by exactly two triangles', () => {
    const edges = new Map<string, number>();
    for (let k = 0; k < index.count; k += 3) {
      for (let e = 0; e < 3; e++) {
        const a = index.getX(k + e), b = index.getX(k + ((e + 1) % 3));
        const key = a < b ? `${a}-${b}` : `${b}-${a}`;
        edges.set(key, (edges.get(key) ?? 0) + 1);
      }
    }
    expect([...edges.values()].every((n) => n === 2)).toBe(true);
  });

  it('never folds over itself: every triangle faces out from the center, so none cuts through another', () => {
    const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), normal = new THREE.Vector3();
    for (let k = 0; k < index.count; k += 3) {
      a.fromBufferAttribute(position, index.getX(k));
      b.fromBufferAttribute(position, index.getX(k + 1));
      c.fromBufferAttribute(position, index.getX(k + 2));
      normal.crossVectors(b.clone().sub(a), c.clone().sub(a));
      expect(normal.dot(a.add(b).add(c))).toBeGreaterThan(0);
    }
  });

  it('is elongated, about as large as the head it draws, and pinched into two lobes by a neck', () => {
    const point = new THREE.Vector3();
    let longest = 0, shortest = Infinity, sum = 0;
    // the body's girth (its farthest reach from the long axis) in slices along it
    const slices = new Array(12).fill(0);
    const box = new THREE.Box3().setFromBufferAttribute(position as THREE.BufferAttribute);
    for (let i = 0; i < position.count; i++) {
      point.fromBufferAttribute(position, i);
      const r = point.length();
      longest = Math.max(longest, r);
      shortest = Math.min(shortest, r);
      sum += r;
      const slice = Math.min(11, Math.floor(((point.x - box.min.x) / (box.max.x - box.min.x)) * 12));
      slices[slice] = Math.max(slices[slice], Math.hypot(point.y, point.z));
    }
    const mean = sum / position.count;
    expect(mean / radius).toBeGreaterThan(0.85);
    expect(mean / radius).toBeLessThan(1.1);
    expect(longest / radius).toBeLessThan(1.6);
    expect(longest / shortest).toBeGreaterThan(1.8);
    // the neck: a slice in the middle far thinner than the lobes on either side of it
    const inner = slices.slice(2, 10);
    const at = 2 + inner.indexOf(Math.min(...inner));
    expect(slices[at]).toBeLessThan(0.85 * Math.max(...slices.slice(0, at)));
    expect(slices[at]).toBeLessThan(0.85 * Math.max(...slices.slice(at + 1)));
  });

  it('is built the same on every call', () => {
    expect(Array.from(nucleusGeometry(12, radius).getAttribute('position').array)).toEqual(Array.from(position.array));
  });

  it('has its vents on its surface, their way out facing away from the body', () => {
    const vents = nucleusVents(radius);
    expect(vents.length).toBeGreaterThan(3);
    for (const vent of vents) {
      expect(vent.normal.dot(vent.point.clone().normalize())).toBeGreaterThan(0.3);
      expect(vent.point.length() / radius).toBeGreaterThan(0.5);
    }
  });

  it('shades with its relief map in a program of its own, the detail tile only up close', () => {
    const near = nucleusMaterial(true), far = nucleusMaterial(false);
    expect(near.customProgramCacheKey()).toBe('relief-nucleus');
    expect(near.defines?.RELIEF_DETAIL).toBe('');
    expect(far.defines?.RELIEF_DETAIL).toBeUndefined();
  });
});
