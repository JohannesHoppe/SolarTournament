import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { directions } from '../test/cube';
import { impostorMaterial, impostorViews, IMPOSTOR_BLEND, IMPOSTOR_SUN, IMPOSTOR_VIEWS } from './impostor';

describe("a billboard's views and light", () => {
  const atlas = () => new THREE.DataArrayTexture(new Uint8Array(4 * IMPOSTOR_VIEWS), 1, 1, IMPOSTOR_VIEWS);
  const look = { relief: new THREE.CubeTexture(), color: new THREE.Color(0.2, 0.2, 0.2), roughness: 0.9, metalness: 0, pars: '', chunk: '' };

  it('looks from the corners of a cube, each view with a right and an up across it as a camera has them', () => {
    const views = impostorViews();
    expect(views).toHaveLength(IMPOSTOR_VIEWS);
    for (const { direction, right, up } of views) {
      expect(direction.length()).toBeCloseTo(1, 9);
      expect(Math.abs(direction.x) * Math.sqrt(3)).toBeCloseTo(1, 9);
      expect(right.dot(direction)).toBeCloseTo(0, 9);
      expect(up.dot(direction)).toBeCloseTo(0, 9);
      // right × up = the direction the view looks from: not mirrored
      expect(new THREE.Vector3().crossVectors(right, up).distanceTo(direction)).toBeLessThan(1e-9);
    }
  });

  it('blends at most four views, so a turning shape never makes one jump in', () => {
    // the shader blends the nearest four by how close each comes to the nearest: a fifth must never come within IMPOSTOR_BLEND
    const views = impostorViews();
    let fifth = Infinity, fourth = Infinity;
    for (const d of directions(4000)) {
      const near = views.map((v) => v.direction.dot(d)).sort((a, b) => b - a);
      fifth = Math.min(fifth, near[0] - near[4]);
      fourth = Math.min(fourth, near[0] - near[3]);
    }
    expect(fifth).toBeGreaterThan(IMPOSTOR_BLEND * 1.5);
    // towards a face of the cube four views do come that close: three would not be enough
    expect(fourth).toBeLessThan(IMPOSTOR_BLEND);
  });

  it("is lit by the sun and the sky every billboard shares, and glows and lets the sun through only with a glow of its own", () => {
    const rock = impostorMaterial(atlas(), 100, look).uniforms;
    const ice = impostorMaterial(atlas(), 100, { ...look, glow: { emissive: 0x0d1a2e, translucent: new THREE.Color(0.03, 0.09, 0.2) } }).uniforms;
    // Space moves every billboard's light at once (see IMPOSTOR_SUN)
    for (const uniforms of [rock, ice]) {
      expect(uniforms.sunDirection).toBe(IMPOSTOR_SUN.direction);
      expect(uniforms.sunColor).toBe(IMPOSTOR_SUN.color);
      expect(uniforms.skyColor).toBe(IMPOSTOR_SUN.sky);
      expect(uniforms.groundColor).toBe(IMPOSTOR_SUN.ground);
      expect(uniforms.skyUp).toBe(IMPOSTOR_SUN.up);
    }
    expect(ice.emissive.value.getHex()).toBe(0x0d1a2e);
    expect(ice.translucent.value.b).toBeCloseTo(0.2, 6);
    // a rock's own billboard shows its relief map's colors and nothing else
    expect(rock.emissive.value.getHex()).toBe(0);
    expect(rock.translucent.value.getHex()).toBe(0);
  });
});
