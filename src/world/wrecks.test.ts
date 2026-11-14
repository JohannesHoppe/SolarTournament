import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { Wrecks } from './wrecks';
import { ARENAS } from './arenas';
import { testField } from '../test/field';
import { MASS } from './bodies';

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

  it('weighs what it is: a hulk and plates by their area, never more than the ship, keeping its momentum', () => {
    for (const blast of [false, true]) {
      for (let deaths = 0; deaths < 20; deaths++) {
        const wrecks = new Wrecks();
        const velocity = new THREE.Vector3(3000, -400, 200);
        wrecks.spawn('p:abc', deaths, new THREE.Vector3(), velocity, 350, 0, blast);
        const [hulk, ...plates] = wrecks.list;
        expect(hulk.hulk).toBe(true);
        expect(hulk.mass).toBe(24_000);
        for (const plate of plates) {
          expect(plate.hulk).toBe(false);
          // a plate of 1.7 to 3.5 m radius at 200 kg/m²: 1.8 to 7.7 t
          expect(plate.mass).toBeGreaterThan(1_500);
          expect(plate.mass).toBeLessThan(8_000);
        }
        const mass = wrecks.list.reduce((sum, piece) => sum + piece.mass, 0);
        expect(mass).toBeLessThan(MASS.ship);
        // their momentum together is the ship's at its death
        const momentum = wrecks.list.reduce((sum, piece) => sum.addScaledVector(piece.velocity, piece.mass), new THREE.Vector3());
        expect(momentum.distanceTo(velocity.clone().multiplyScalar(mass))).toBeLessThan(1e-6 * mass * velocity.length());
        // a ship crushed whole drifts apart slowly, one blown apart fast
        const fastest = Math.max(...plates.map((plate) => plate.velocity.distanceTo(velocity)));
        if (blast) expect(fastest).toBeGreaterThan(300);
        else expect(fastest).toBeLessThan(250);
      }
    }
  });

  it('clangs off rock slowly and crumples on it fast', () => {
    const field = testField();
    field.generate(ARENAS[0].layout);
    const rock = [...field.asteroids.values()].find((piece) => !piece.ground)!;
    const meet = (speed: number) => {
      const wrecks = new Wrecks();
      const from = rock.object.position.clone().add(new THREE.Vector3(rock.radius + 600, 0, 0));
      wrecks.spawn('p:abc', 1, from, new THREE.Vector3(-speed, 0, 0), 350, 0);
      for (let now = 1 / 60; now < 8; now += 1 / 60) wrecks.update(1 / 60, now, field);
      return wrecks;
    };
    // at 5 m/s the pieces that reach it bounce off and fly on; at 60 m/s they are gone on it
    const slow = meet(100);
    expect(slow.list.length).toBe(5);
    expect(slow.list.some((piece) => piece.velocity.x > 0)).toBe(true);
    expect(meet(1200).list.length).toBeLessThan(5);
  });

  it('takes laser hits: a plate shatters on its second, the hulk on its sixth, a hit short of that shoves it', () => {
    const wrecks = new Wrecks();
    wrecks.spawn('p:abc', 1, new THREE.Vector3(), new THREE.Vector3(), 350, 0);
    const [hulk, plate] = wrecks.list;
    const along = new THREE.Vector3(1, 0, 0);
    const before = plate.velocity.x;
    expect(wrecks.hit(plate, along)).toBe(false);
    expect(plate.velocity.x).toBeGreaterThan(before);
    expect(wrecks.hit(plate, along)).toBe(true);
    for (let i = 0; i < 5; i++) expect(wrecks.hit(hulk, along)).toBe(false);
    expect(wrecks.hit(hulk, along)).toBe(true);
  });

  it('flies the same path at any frame rate, falling towards a massive body', () => {
    const field = testField();
    // the Event Horizon's black hole pulls; the field's pieces pull nobody
    field.generate(ARENAS.find((a) => a.id === 'hole')!.layout);
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
    // and the hole did pull them
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
