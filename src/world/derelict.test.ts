import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { ARENAS, sternAt } from './arenas';
import { Derelict, JET_WELDS, mistDensity } from './derelict';
import { testField } from '../test/field';
import { HULL_PAINT } from './shapes';
import { stencilable } from '../view/lettering';

/** The middle of the gap between the world ship's torn ends. */
const GAP = new THREE.Vector3(-14200, 0, 0).add(new THREE.Vector3(...sternAt(9200), 3000)).multiplyScalar(0.5);

describe('the derelict', () => {
  it('lets its mist escape from both torn ends into the gap, thick on the jets and nowhere else', () => {
    // just off each torn end, on its jet's axis
    expect(mistDensity(new THREE.Vector3(-13000, 0, 0))).toBeGreaterThan(0.5);
    const stern = new THREE.Vector3(...sternAt(8000), 3000);
    expect(mistDensity(stern)).toBeGreaterThan(0.5);
    // inside the hull behind a torn end, far off to the side, and far beyond the jets' reach
    expect(mistDensity(new THREE.Vector3(-20000, 0, 0))).toBe(0);
    expect(mistDensity(new THREE.Vector3(-10000, 0, 8000))).toBe(0);
    expect(mistDensity(new THREE.Vector3(-30000, 0, 0))).toBe(0);
    expect(mistDensity(new THREE.Vector3(0, 20000, 0))).toBe(0);
  });

  it('lets the mist follow its half of the hull when a comet shoves it', () => {
    const field = testField();
    field.generate(ARENAS.find((arena) => arena.id === 'derelict')!.layout);
    const wreck = new Derelict(new THREE.Color(1, 1, 1));
    const motions = JET_WELDS.map(() => new THREE.Matrix4());
    const settle = () => {
      JET_WELDS.forEach((weld, i) => expect(field.weldMotion(weld, motions[i])).toBe(true));
      wreck.moveJets(motions);
    };
    settle();
    const start = wreck.jets.map((jet) => jet.from.clone());
    expect(start[0].distanceTo(new THREE.Vector3(-14200, 0, 0))).toBeLessThan(1e-6);
    // a comet strikes the bow: the whole half drifts on at 171 units/s for two minutes
    const hull = [...field.asteroids.values()].find((rock) => rock.weld === 0)!;
    field.shove(hull.id, 0, new THREE.Vector3(0, 0, 171), new THREE.Vector3(0, 1, 0), 0, 3);
    field.setClock(120);
    settle();
    expect(wreck.jets[0].from.distanceTo(start[0].clone().add(new THREE.Vector3(0, 0, 171 * 120)))).toBeLessThan(1);
    expect(wreck.jets[1].from.distanceTo(start[1])).toBeLessThan(1e-6);
    // the mist thickens at the end where it is now and is gone from where it was
    expect(wreck.mistAt(wreck.jets[0].from.clone().add(new THREE.Vector3(1200, 0, 0)))).toBeGreaterThan(0.5);
    expect(wreck.mistAt(new THREE.Vector3(-13000, 0, 0))).toBe(0);
  });

  it('mixes the instance color into the dead\'s vertex color by their clothes: the skin stays bare', () => {
    const wreck = new Derelict(new THREE.Color(1, 1, 1));
    const mesh = wreck.group.children.find((child): child is THREE.InstancedMesh => child instanceof THREE.InstancedMesh)!;
    const material = mesh.material as THREE.MeshStandardMaterial;
    // the shader as three hands it over: the includes are not resolved yet
    const shader = { vertexShader: '#include <common>\n#include <color_vertex>\nvoid main() {}' } as unknown as Parameters<typeof material.onBeforeCompile>[0];
    material.onBeforeCompile(shader, {} as THREE.WebGLRenderer);
    expect(shader.vertexShader).toContain('attribute float cloth;');
    expect(shader.vertexShader).toContain('mix(vec3(1.0), instanceColor.rgb, cloth)');
  });

  it('keeps its dead drifting slowly about the break, turning, never wandering off', () => {
    const wreck = new Derelict(new THREE.Color(1, 1, 1));
    const dead = wreck.group.children.filter((child): child is THREE.InstancedMesh => child instanceof THREE.InstancedMesh);
    expect(dead.reduce((sum, mesh) => sum + mesh.count, 0)).toBeGreaterThanOrEqual(30);
    const matrix = new THREE.Matrix4();
    const at = (mesh: THREE.InstancedMesh, i: number) => new THREE.Vector3().setFromMatrixPosition((mesh.getMatrixAt(i, matrix), matrix));
    const turn = (mesh: THREE.InstancedMesh, i: number) => new THREE.Quaternion().setFromRotationMatrix((mesh.getMatrixAt(i, matrix), matrix));
    for (const time of [0, 100, 1000, 10000]) {
      wreck.update(time);
      const before = dead.flatMap((mesh) => Array.from({ length: mesh.count }, (_, i) => ({ at: at(mesh, i), turn: turn(mesh, i) })));
      wreck.update(time + 1);
      let k = 0;
      for (const mesh of dead) {
        for (let i = 0; i < mesh.count; i++, k++) {
          const now = at(mesh, i);
          // within 800 m of the gap's middle (the torn ends are 600 m apart)
          expect(now.distanceTo(GAP)).toBeLessThan(16000);
          // drifting at no more than 2 m/s, turning at no more than 0.12 rad/s
          expect(now.distanceTo(before[k].at)).toBeLessThan(40);
          expect(turn(mesh, i).angleTo(before[k].turn)).toBeLessThan(0.121);
        }
      }
    }
  });

  it('paints its name, motto and registry only in letters its stencil has', () => {
    for (const lettering of Object.values(HULL_PAINT)) {
      expect(stencilable(`${lettering.name ?? ''}${lettering.registry ?? ''}`)).toBe(true);
    }
    expect(HULL_PAINT[5].name).toBe('PER ASPERA');
    expect(HULL_PAINT[7].name).toBe('AD ASTRA');
  });
});
