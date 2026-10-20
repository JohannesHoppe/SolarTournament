import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { Wrecks } from './wrecks';

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
});
