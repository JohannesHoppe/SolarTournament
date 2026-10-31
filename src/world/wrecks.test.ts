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

  it('draws each piece about as far as its collisions reach, a plate with its skin outside and its innards inside', () => {
    const wrecks = new Wrecks();
    for (let deaths = 0; deaths < 20; deaths++) wrecks.spawn('p:abc', deaths, new THREE.Vector3(), new THREE.Vector3(), 350, 0);
    const corner = new THREE.Vector3();
    for (const { mesh } of wrecks.list) {
      const { position, normal } = mesh.geometry.attributes;
      let reach = 0;
      for (let i = 0; i < position.count; i++) reach = Math.max(reach, corner.fromBufferAttribute(position, i).length());
      expect(reach).toBeGreaterThan(0.7);
      expect(reach).toBeLessThan(1.3);
      // the skin's faces and the innards' face away from each other: up and down the plate
      const [skin, innards] = mesh.geometry.groups;
      expect(skin.materialIndex).toBe(0);
      expect(innards.materialIndex).toBe(1);
      expect(normal.getY(0)).toBeGreaterThan(0.9);
      expect(normal.getY(innards.start)).toBeLessThan(-0.9);
      // every triangle wound to face where its normal points, so none is culled from the side it shows
      const [a, b, c, n] = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
      let turned = 0;
      for (let i = 0; i < position.count; i += 3) {
        a.fromBufferAttribute(position, i);
        b.fromBufferAttribute(position, i + 1).sub(a);
        c.fromBufferAttribute(position, i + 2).sub(a);
        const face = b.cross(c);
        if (face.lengthSq() > 1e-12 && face.dot(n.fromBufferAttribute(normal, i)) <= 0) turned++;
      }
      expect(turned).toBe(0);
    }
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

  it('clangs two ships\' plates off each other at the same moment and place at any frame rate', () => {
    const field = testField();
    field.generate(ARENAS[0].layout);
    const fly = (frames: (i: number) => number, both = true) => {
      const wrecks = new Wrecks();
      // two large ships broken up head-on, their debris clouds flying into each other at 40 m/s
      wrecks.spawn('p:abc', 1, new THREE.Vector3(30000, 0, 0), new THREE.Vector3(400, 0, 0), 3500, 0.013);
      if (both) wrecks.spawn('p:xyz', 1, new THREE.Vector3(33000, 0, 0), new THREE.Vector3(-400, 0, 0), 3500, 0.04);
      let now = 0.04;
      for (let i = 0; now < 6; i++) {
        const dt = frames(i);
        now += dt;
        wrecks.update(dt, now, field);
      }
      wrecks.update(6.5 - now, 6.5, field);
      return wrecks.list.filter((piece) => piece.id.startsWith('p:abc')).map((piece) => piece.velocity.clone());
    };
    const smooth = fly(() => 1 / 60);
    const slow = fly((i) => [0.05, 0.045, 0.06][i % 3]);
    // they did meet: some of the one ship's plates fly otherwise than alone
    const alone = fly(() => 1 / 60, false);
    expect(smooth.some((velocity, i) => velocity.distanceTo(alone[i]) > 10)).toBe(true);
    expect(slow).toHaveLength(smooth.length);
    smooth.forEach((velocity, i) => expect(velocity.distanceTo(slow[i])).toBeLessThan(1e-6));
  });
});
