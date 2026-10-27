import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { impostorGeometry, impostorMaterial, IMPOSTOR_SUN, paintedImpostor } from './impostor';

describe('a painted billboard', () => {
  const atlas = () => new THREE.DataTexture(new Uint8Array(4), 1, 1);
  const template = new THREE.Mesh(impostorGeometry(100), impostorMaterial(atlas(), atlas(), 20, 100));

  it("keeps the shape's quad, atlases and the shared sun, and shows the paint's color and glow", () => {
    const painted = paintedImpostor(template, { color: 0xf2f7ff, emissive: 0x0d1a2e });
    const own = (template.material as THREE.ShaderMaterial).uniforms;
    const { uniforms } = painted.material as THREE.ShaderMaterial;
    expect(painted.geometry).toBe(template.geometry);
    expect(uniforms.albedoAtlas.value).toBe(own.albedoAtlas.value);
    expect(uniforms.normalAtlas.value).toBe(own.normalAtlas.value);
    expect(uniforms.inset.value).toBeCloseTo(own.inset.value, 9);
    expect(uniforms.radius.value).toBe(100);
    // the sun moves every billboard at once (see IMPOSTOR_SUN)
    expect(uniforms.sunDirection).toBe(IMPOSTOR_SUN.direction);
    expect(uniforms.painted.value).toBe(1);
    expect(uniforms.paint.value.getHex()).toBe(0xf2f7ff);
    expect(uniforms.emissive.value.getHex()).toBe(0x0d1a2e);
    // a rock's own billboard shows its baked colors and does not glow
    expect(own.painted.value).toBe(0);
    expect(own.emissive.value.getHex()).toBe(0);
  });
});
