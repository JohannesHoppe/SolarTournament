import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { createImpostors, createRocks, createRockShapes, DETAIL_RES, detailMap, DISTANT_DETAIL, EDGE_SLOPE, FAR_DETAIL, IMPOSTOR_RES, NEAR_DETAIL, RELIEF_RES, reliefMap, reliefNormal, reliefShade, rockRecipe } from './rocks';
import { impostorViews, IMPOSTOR_VIEWS } from '../view/impostor';
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

describe("a rock's billboard", () => {
  const impostors = createImpostors();
  const far = createRocks(FAR_DETAIL);
  const shapes = createRockShapes(NEAR_DETAIL);
  const views = impostorViews();
  const R = IMPOSTOR_RES;
  const uniforms = (index: number) => (impostors[index].material as THREE.ShaderMaterial).uniforms;
  /** A cell of a view as the GPU reads the array texture: layer by layer, row j from the bottom (uv.y = 0), cell i from the left. */
  const cellOf = (index: number, layer: number, i: number, j: number) => {
    const data = (uniforms(index).atlas.value as THREE.DataArrayTexture).image.data as Uint8Array;
    const o = ((layer * R + j) * R + i) * 4;
    return { direction: new THREE.Vector3(data[o], data[o + 1], data[o + 2]).divideScalar(127.5).subScalar(1), alpha: data[o + 3] };
  };
  /** Where the ray through a cell's center meets the drawn rock (its near mesh), from the view's side, or null. */
  const raycaster = new THREE.Raycaster();
  const rayHit = (index: number, layer: number, i: number, j: number) => {
    const radius = uniforms(index).radius.value as number;
    const { direction, right, up } = views[layer];
    const u = ((i + 0.5) / R) * 2 - 1, v = ((j + 0.5) / R) * 2 - 1;
    const origin = right.clone().multiplyScalar(u * radius).addScaledVector(up, v * radius).addScaledVector(direction, radius * 4);
    raycaster.set(origin, direction.clone().negate());
    return raycaster.intersectObject(shapes[index])[0]?.point ?? null;
  };

  it('shows the drawn rock where the GPU keeps it (alpha at least half), within its edge everywhere else', () => {
    let cells = 0, agree = 0, mirrored = 0;
    for (const index of [0, 7, 15]) {
      for (let layer = 0; layer < views.length; layer++) {
        for (let j = 1; j < R; j += 3) {
          for (let i = 1; i < R; i += 3) {
            const { alpha } = cellOf(index, layer, i, j);
            const hit = rayHit(index, layer, i, j) !== null;
            cells++;
            if (hit === cellOf(index, layer, R - 1 - i, j).alpha >= 128) mirrored++;
            if (hit === alpha >= 128) agree++;
            // where the two differ, the cell lies on the edge's ramp, within two cells of the silhouette
            else expect(Math.abs(alpha - 127.5)).toBeLessThan(EDGE_SLOPE * 2 * 255);
          }
        }
      }
    }
    expect(agree / cells).toBeGreaterThan(0.97);
    // read mirrored, the silhouettes would not fit
    expect(1 - mirrored / cells).toBeGreaterThan(5 * (1 - agree / cells));
  });

  it("holds, read where the GPU reads it, the place on the rock its ray meets, as the relief map is read there", () => {
    const angles: number[] = [];
    for (const index of [0, 7, 15]) {
      const { axes } = rockRecipe(index);
      for (let layer = 0; layer < views.length; layer++) {
        for (let j = 2; j < R; j += 4) {
          for (let i = 2; i < R; i += 4) {
            const { direction, alpha } = cellOf(index, layer, i, j);
            const point = rayHit(index, layer, i, j);
            if (alpha < 160 || !point) continue;
            // a direction, unit length to 8 bits; the relief map is read at the point over the shape's axes
            expect(Math.abs(direction.length() - 1)).toBeLessThan(0.02);
            angles.push(direction.angleTo(point.divide(axes).normalize()));
          }
        }
      }
    }
    expect(angles.length).toBeGreaterThan(500);
    // the near mesh's triangles stand a little off the shape it is marched through
    expect(median(angles)).toBeLessThan(0.02);
    expect([...angles].sort((a, b) => a - b)[Math.floor(angles.length * 0.95)]).toBeLessThan(0.08);
  });

  it('points just off its edge where the rock lies nearest, so filtering there blends neighbouring places of it', () => {
    // across the edge: a cell the GPU keeps and its neighbour it drops
    const across: number[] = [];
    for (const index of [0, 7, 15]) {
      for (let layer = 0; layer < views.length; layer++) {
        for (let j = 0; j < R; j++) {
          for (let i = 0; i + 1 < R; i++) {
            const a = cellOf(index, layer, i, j), b = cellOf(index, layer, i + 1, j);
            if (a.alpha >= 128 !== b.alpha >= 128) across.push(a.direction.angleTo(b.direction));
          }
        }
      }
    }
    expect(across.length).toBeGreaterThan(100);
    // the limb turns away fast, so neighbours there lie some degrees apart, never on unrelated sides of the rock
    expect(median(across)).toBeLessThan(0.25);
    expect([...across].sort((a, b) => a - b)[Math.floor(across.length * 0.95)]).toBeLessThan(0.6);
  });

  it("is painted from the far mesh's very relief map, in its color, roughness and metalness, by its code", () => {
    for (const index of [0, 7, 15]) {
      const own = uniforms(index);
      const mesh = far[index].material as THREE.MeshStandardMaterial;
      expect(own.reliefMap.value).toBe(reliefMap(index));
      expect((own.baseColor.value as THREE.Color).getHex()).toBe(mesh.color.getHex());
      expect(own.roughness.value).toBe(mesh.roughness);
      expect(own.metalness.value).toBe(mesh.metalness);
      expect((impostors[index].material as THREE.ShaderMaterial).fragmentShader).toContain('rockMultiplier');
      const atlas = own.atlas.value as THREE.DataArrayTexture;
      expect([atlas.image.width, atlas.image.height, atlas.image.depth]).toEqual([R, R, IMPOSTOR_VIEWS]);
      expect(atlas.generateMipmaps).toBe(true);
      expect(atlas.minFilter).toBe(THREE.LinearMipmapLinearFilter);
      expect(atlas.colorSpace).toBe(THREE.NoColorSpace);
    }
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
