import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { debrisSet } from './shapes';
import { networkLivery } from '../view/surfaces';

/**
 * The livery's lettering is drawn on its canvas turned, never mirrored, so it reads the right
 * way round wherever a face's texture runs the way a page does: its u (the canvas's x) and its v
 * (the canvas's up) span a frame whose cross product points out of the face, towards whoever sees
 * it. A frame the other way round shows every stencil mirrored.
 */
describe('the junk of the Orbital Freedom Network', () => {
  it('lays its livery so that the lettering reads the right way round from the side it is seen on', () => {
    const livery = networkLivery().map;
    const p = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
    const t = [new THREE.Vector2(), new THREE.Vector2(), new THREE.Vector2()];
    const n = new THREE.Vector3();
    const e1 = new THREE.Vector3();
    const e2 = new THREE.Vector3();
    const along = new THREE.Vector3();
    const up = new THREE.Vector3();
    let checked = 0;
    let mirrored = 0;
    const pieces = new Set<number>();
    debrisSet().near.forEach((template, index) =>
      template.traverse((o) => {
        if (!(o instanceof THREE.Mesh) || (o.material as THREE.MeshStandardMaterial).map !== livery) return;
        pieces.add(index);
        const { position, normal, uv } = o.geometry.attributes;
        for (let i = 0; i < position.count; i += 3) {
          n.set(0, 0, 0);
          for (let k = 0; k < 3; k++) {
            p[k].fromBufferAttribute(position, i + k);
            t[k].fromBufferAttribute(uv, i + k);
            n.add(new THREE.Vector3().fromBufferAttribute(normal, i + k));
          }
          e1.subVectors(p[1], p[0]);
          e2.subVectors(p[2], p[0]);
          const [du1, dv1, du2, dv2] = [t[1].x - t[0].x, t[1].y - t[0].y, t[2].x - t[0].x, t[2].y - t[0].y];
          const det = du1 * dv2 - du2 * dv1;
          // a triangle squeezed to a point on the axis or to a line in the texture has no frame
          if (Math.abs(det) < 1e-9 || e1.clone().cross(e2).lengthSq() < 1e-6) continue;
          // how the surface runs along the texture's u and v
          along.copy(e1).multiplyScalar(dv2).addScaledVector(e2, -dv1).divideScalar(det);
          up.copy(e2).multiplyScalar(du1).addScaledVector(e1, -du2).divideScalar(det);
          checked++;
          if (along.cross(up).dot(n) <= 0) mirrored++;
        }
      }),
    );
    // both stages and the fairing (outside and lining)
    expect([...pieces].sort()).toEqual([1, 2, 5]);
    expect(checked).toBeGreaterThan(500);
    expect(mirrored).toBe(0);
  });
});
