import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { impostorMaterial, IMPOSTOR_SUN } from './impostor';

describe("a billboard's own light", () => {
  const atlas = () => new THREE.DataTexture(new Uint8Array(4), 1, 1);

  it('shares the sun of every billboard, and glows and lets the sun through only with a glow of its own', () => {
    const rock = impostorMaterial(atlas(), atlas(), 20, 100).uniforms;
    const ice = impostorMaterial(atlas(), atlas(), 20, 100, { emissive: 0x0d1a2e, translucent: new THREE.Color(0.03, 0.09, 0.2) }).uniforms;
    // the sun moves every billboard at once (see IMPOSTOR_SUN)
    expect(ice.sunDirection).toBe(IMPOSTOR_SUN.direction);
    expect(rock.sunDirection).toBe(IMPOSTOR_SUN.direction);
    expect(ice.inset.value).toBeCloseTo(0.5 / 20, 9);
    expect(ice.emissive.value.getHex()).toBe(0x0d1a2e);
    expect(ice.translucent.value.b).toBeCloseTo(0.2, 6);
    // a rock's own billboard shows its baked colors and nothing else
    expect(rock.emissive.value.getHex()).toBe(0);
    expect(rock.translucent.value.getHex()).toBe(0);
  });
});
