import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { Wrecks } from './wrecks';
import { ARENAS } from './arenas';
import { testField } from '../test/field';

describe('wreckage', () => {
  it('breaks into the same pieces on every browser and travels to a browser that joins', () => {
    const owner = new Wrecks();
    owner.spawn('p:abc', 2, new THREE.Vector3(1000, 0, 0), new THREE.Vector3(0, 100, 0), 350, 5);
    owner.remove(owner.list[1]);
    const newcomer = new Wrecks();
    newcomer.restore(owner.snapshot(5), 350, 5);
    const pieces = (w: Wrecks) => w.list.map((piece) => `${piece.id}:${piece.mesh.position.toArray().map(Math.round).join()}:${piece.radius.toFixed(2)}`);
    expect(pieces(newcomer)).toEqual(pieces(owner));
    expect(newcomer.find('p:abc.2.1')).toBeNull();
  });

  it('flies the same path at any frame rate, falling towards the rocks', () => {
    const field = testField();
    field.generate(ARENAS[0].layout);
    const fly = (frames: (i: number) => number) => {
      const wrecks = new Wrecks();
      wrecks.spawn('p:abc', 1, new THREE.Vector3(30000, 0, 0), new THREE.Vector3(-200, 50, 0), 350, 0);
      let now = 0;
      for (let i = 0; now < 6; i++) {
        const dt = frames(i);
        now += dt;
        wrecks.update(dt, now, field);
      }
      // the same moment for both: a last frame up to 6.5 s
      wrecks.update(6.5 - now, 6.5, field);
      return wrecks.list.map((piece) => piece.mesh.position.clone());
    };
    const smooth = fly(() => 1 / 60);
    const stuttering = fly((i) => [0.05, 0.003, 0.021, 0.011][i % 4]);
    expect(stuttering).toHaveLength(smooth.length);
    smooth.forEach((position, i) => expect(position.distanceTo(stuttering[i])).toBeLessThan(1e-6));
    // and gravity did pull them
    expect(field.gravity(new THREE.Vector3(30000, 0, 0)).length()).toBeGreaterThan(0);
  });
});
