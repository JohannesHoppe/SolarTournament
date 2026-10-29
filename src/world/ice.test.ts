import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { bakeIceRelief, ICE_KIND, iceDetailMap, iceFacets, iceNormal, iceReliefMap, iceSet, iceTexel } from './ice';
import { createImpostors, createRocks, createRockShapes, DETAIL_RES, DISTANT_DETAIL, FAR_DETAIL, RELIEF_RES, reliefMap, rockRecipe } from './rocks';
import { cubeTexel, decode, directions, expectOwnCubeMap, expectSameBake, median, normalFit, texel, texelAt, texelCenter, tileStats } from '../test/cube';

/** The share of a map's texels of each kind of ice, rounded to the ramp's steps (fracture, glass, frost, dusty, dust). */
function kinds(map: THREE.CubeTexture): number[] {
  const bins = [0, 0, 0, 0, 0];
  let count = 0;
  for (const face of map.image as THREE.DataTexture[]) {
    const data = face.image.data as Uint8Array;
    for (let o = 3; o < data.length; o += 4, count++) bins[Math.round((data[o] / 255) * 4)]++;
  }
  return bins.map((b) => b / count);
}

describe("an ice chunk's relief map", () => {
  const step = Math.PI / 2 / RELIEF_RES;

  it("is a cube map of its own beside the rock's, six square faces WebGL builds mipmaps for", () => {
    expectOwnCubeMap(iceReliefMap(0), reliefMap(0), RELIEF_RES);
  });

  it('is baked the same on every call, from integer hashing and seeds alone', () => {
    expectSameBake(bakeIceRelief(2), bakeIceRelief(2));
  });

  it('holds, read as the GPU picks a texel for a direction, the surface normal there, and mirrored it would not', () => {
    for (const index of [0, 7, 15]) {
      const fit = normalFit(iceReliefMap(index), RELIEF_RES, (d) => iceNormal(index, d, step));
      expect(fit.outward).toBeGreaterThan(0.95);
      expect(fit.angle).toBeLessThan(0.1);
      expect(fit.mirrored).toBeGreaterThan(5 * fit.angle);
    }
  });

  it('holds the kind of ice there in its alpha', () => {
    const map = iceReliefMap(3);
    const differences = directions(400).map((d) => Math.abs(texelAt(map, d, RELIEF_RES)[3] / 255 - iceTexel(3, d).value));
    expect(median(differences)).toBeLessThan(0.02);
  });

  it('is mostly frost, with glassy fracture planes, cracks and dust on every chunk', () => {
    for (let index = 0; index < 16; index += 5) {
      const [fracture, glass, frost, dusty, dust] = kinds(iceReliefMap(index));
      expect(frost).toBeGreaterThan(0.5);
      expect(glass).toBeGreaterThan(0.01);
      expect(fracture).toBeGreaterThan(0.001);
      expect(dusty + dust).toBeGreaterThan(0.02);
    }
  });

  it('lies flat on a fracture plane: a glassy texel there holds the plane\'s normal', () => {
    for (const index of [1, 6, 11]) {
      const map = iceReliefMap(index);
      const { axes } = rockRecipe(index);
      const facets = iceFacets(index);
      const angles: number[] = [];
      for (const d of directions(4000, 5)) {
        const { face, i, j } = cubeTexel(d, RELIEF_RES);
        const center = texelCenter(face, i, j, RELIEF_RES);
        const { bump, value } = iceTexel(index, center);
        if (Math.abs(value - ICE_KIND.glass) > 0.05) continue;
        const point = center.clone().multiply(axes).multiplyScalar(1 + bump);
        const facet = facets.find((f) => Math.abs(point.dot(f.normal) - f.cut) < 0.5);
        if (!facet) continue;
        angles.push(Math.acos(Math.min(1, decode(texel(map, face, i, j)).dot(facet.normal))));
      }
      expect(angles.length).toBeGreaterThan(20);
      // flat to a couple of degrees, its edges and fine cracks aside
      expect(median(angles)).toBeLessThan(0.04);
    }
  });
});

describe('the detail tile every ice chunk shares up close', () => {
  const tile = iceDetailMap();

  it('is a square tile, repeated and mipmapped, without a seam', () => {
    expect([tile.image.width, tile.image.height]).toEqual([DETAIL_RES, DETAIL_RES]);
    expect(tile.wrapS).toBe(THREE.RepeatWrapping);
    expect(tile.generateMipmaps).toBe(true);
    const { edge, inner } = tileStats(tile);
    expect(edge).toBeLessThan(inner * 1.5);
  });

  it('shifts the kind of ice and tilts the normal by nothing on average, so it fades out with distance unseen', () => {
    const { b, slopeX, slopeY } = tileStats(tile);
    expect(Math.abs(b - 0.5)).toBeLessThan(0.01);
    expect(Math.abs(slopeX)).toBeLessThan(0.02);
    expect(Math.abs(slopeY)).toBeLessThan(0.02);
  });
});

describe('the ice set', () => {
  const near = createRocks(DISTANT_DETAIL, true);
  const far = createRocks(FAR_DETAIL);
  const collision = createRockShapes(DISTANT_DETAIL);
  const impostor = createImpostors();
  const ice = iceSet({ near, far, impostor, collision });

  it("collides exactly as the rocks do and draws their very meshes: the relief lies in the maps alone", () => {
    expect(ice.collision).toBe(collision);
    ice.near.forEach((mesh, i) => expect((mesh as THREE.Mesh).geometry).toBe(near[i].geometry));
    ice.far.forEach((mesh, i) => expect((mesh as THREE.Mesh).geometry).toBe(far[i].geometry));
  });

  it("shades each shape with its own map, in programs apart from the rock's", () => {
    const material = (ice.near[4] as THREE.Mesh).material as THREE.MeshStandardMaterial;
    expect(material.customProgramCacheKey()).toBe('relief-ice');
    expect((near[4].material as THREE.MeshStandardMaterial).customProgramCacheKey()).toBe('relief-rock');
    expect(material.defines?.RELIEF_DETAIL).toBe('');
    expect(((ice.far[4] as THREE.Mesh).material as THREE.MeshStandardMaterial).defines?.RELIEF_DETAIL).toBeUndefined();
  });

  it("paints its billboards on the rock's silhouette from the ice's own relief map, as its far meshes paint it", () => {
    for (const index of [0, 9]) {
      const billboard = (ice.impostor![index] as THREE.Mesh).material as THREE.ShaderMaterial;
      const own = billboard.uniforms;
      const rock = ((impostor[index] as THREE.Mesh).material as THREE.ShaderMaterial).uniforms;
      const mesh = (ice.far[index] as THREE.Mesh).material as THREE.MeshStandardMaterial;
      // the rock's very views: its silhouette, and where each cell meets the shape
      expect(own.atlas.value).toBe(rock.atlas.value);
      expect(own.reliefMap.value).toBe(iceReliefMap(index));
      expect(own.reliefMap.value).not.toBe(reliefMap(index));
      expect((own.baseColor.value as THREE.Color).getHex()).toBe(mesh.color.getHex());
      expect(own.metalness.value).toBe(mesh.metalness);
      // the kind of ice turns into its tint as on the meshes, and the ice glows and lets the sun through
      expect(billboard.fragmentShader).toContain('mix( ICE_TINT[ iceAt ], ICE_TINT[ iceAt + 1 ], iceMix )');
      expect((own.emissive.value as THREE.Color).getHex()).toBe(mesh.emissive.getHex());
      expect((own.translucent.value as THREE.Color).b).toBeGreaterThan((own.translucent.value as THREE.Color).r);
    }
  });
});
