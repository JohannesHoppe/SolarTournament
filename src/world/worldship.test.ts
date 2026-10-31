import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { frosted, weldFrost } from './worldship';
import { ARENAS } from './arenas';
import { testField } from '../test/field';

/** What three.js hands a material's onBeforeCompile, as far as frosted reads it. */
const shaderOf = (material: THREE.Material) => {
  const shader = {
    uniforms: {} as Record<string, { value: unknown }>,
    vertexShader: '#include <common>\n#include <project_vertex>',
    fragmentShader: '#include <common>\n#include <map_fragment>\n#include <roughnessmap_fragment>\n#include <metalnessmap_fragment>\n#include <emissivemap_fragment>',
  };
  material.onBeforeCompile(shader as unknown as THREE.WebGLProgramParametersWithUniforms, null as unknown as THREE.WebGLRenderer);
  return shader;
};

describe("the world ship's frost", () => {
  it("lies where the hull was laid out: a welded body's pieces take materials of their own whose patches follow the body's drift", () => {
    const plating = frosted(new THREE.MeshStandardMaterial(), true);
    const plain = new THREE.MeshBasicMaterial();
    const piece = (material: THREE.Material) => new THREE.Group().add(new THREE.Mesh(new THREE.BoxGeometry(), material));
    const [a, b, other] = [piece(plating), piece(plating), piece(plating)];
    const bare = piece(plain);
    const drift = weldFrost(a, 0);
    expect(weldFrost(b, 0)).toBe(drift);
    expect(weldFrost(other, 1)).not.toBe(drift);
    weldFrost(bare, 0);
    const material = (group: THREE.Group) => (group.children[0] as THREE.Mesh).material as THREE.MeshStandardMaterial;
    // one copy per body, the plating still the plating; what is not frosted stays as it is
    expect(material(a)).not.toBe(plating);
    expect(material(b)).toBe(material(a));
    expect(material(other)).not.toBe(material(a));
    expect(material(a).defines?.PLATING).toBe('');
    expect(material(bare)).toBe(plain);
    // the patches are placed by the world position less the body's drift
    const shader = shaderOf(material(a));
    expect(shader.uniforms.frostDrift.value).toBe(drift);
    expect(shader.vertexShader).toContain('- frostDrift');
    expect(shaderOf(material(other)).uniforms.frostDrift.value).not.toBe(drift);
  });

  it("rides on a half of the derelict a comet shoves", () => {
    const field = testField();
    field.generate(ARENAS.find((arena) => arena.id === 'derelict')!.layout);
    const pieces = [...field.asteroids.values()].filter((piece) => piece.weld === 0);
    expect(pieces.length).toBeGreaterThan(1);
    const laidOut = pieces.map((piece) => piece.object.position.clone());
    const drift = weldFrost(new THREE.Group(), 0);
    expect(drift.length()).toBe(0);
    field.shove(pieces[0].id, 10, new THREE.Vector3(400, -100, 250), new THREE.Vector3(0, 1, 0), 0, 7);
    field.setClock(70);
    // every piece of the half has moved by that very drift
    expect(drift.length()).toBeGreaterThan(1000);
    pieces.forEach((piece, i) => expect(piece.object.position.clone().sub(laidOut[i]).distanceTo(drift)).toBeLessThan(1e-6));
  });
});
