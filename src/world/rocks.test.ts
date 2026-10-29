import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { createRocks, createRockShapes, DETAIL_RES, detailMap, DISTANT_DETAIL, RELIEF_RES, reliefMap, reliefNormal, reliefShade } from './rocks';
import { directions, median, normalFit, texelAt, tileStats } from '../test/cube';

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
      const fit = normalFit(reliefMap(index), RELIEF_RES, (d) => reliefNormal(index, d, step));
      // crater walls, grooves and cracks tilt a normal, but the surface faces outward almost everywhere
      expect(fit.outward).toBeGreaterThan(0.95);
      // the texel holds the normal of the place it stands for to a few degrees; read from the mirrored place, it would not
      expect(fit.angle).toBeLessThan(0.1);
      expect(fit.mirrored).toBeGreaterThan(5 * fit.angle);
    }
  });

  it("holds the shade there in its alpha, half the multiplier of the composition's color", () => {
    const map = reliefMap(3);
    const differences = directions(400).map((d) => Math.abs((texelAt(map, d, RELIEF_RES)[3] / 255) * 2 - reliefShade(3, d)));
    expect(median(differences)).toBeLessThan(0.05);
  });
});

describe('the detail map every rock shares up close', () => {
  const tile = detailMap();

  it('is a square tile, repeated and mipmapped', () => {
    expect([tile.image.width, tile.image.height]).toEqual([DETAIL_RES, DETAIL_RES]);
    expect(Math.log2(DETAIL_RES) % 1).toBe(0);
    expect(tile.wrapS).toBe(THREE.RepeatWrapping);
    expect(tile.wrapT).toBe(THREE.RepeatWrapping);
    expect(tile.generateMipmaps).toBe(true);
  });

  it('runs on across its edges as smoothly as within, so the tiles show no seam', () => {
    const { edge, inner } = tileStats(tile);
    expect(edge).toBeLessThan(inner * 1.5);
  });

  it('keeps a rock its tone and its tilt on average, so it fades out with distance unseen', () => {
    const { b, slopeX, slopeY } = tileStats(tile);
    expect(Math.abs(b * 2 - 1)).toBeLessThan(0.08);
    expect(Math.abs(slopeX)).toBeLessThan(0.02);
    expect(Math.abs(slopeY)).toBeLessThan(0.02);
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
