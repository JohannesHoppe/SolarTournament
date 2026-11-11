import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { DECOY_LIFE, DECOY_LURE, Decoys } from './decoys';
import type { Ship } from '../ship/ship';
import type { Torpedo } from './torpedoes';

const ship = (id: string) => ({ id, name: id }) as unknown as Ship;
const torpedo = (target: Ship, x: number) => ({ target, position: new THREE.Vector3(x, 0, 0) }) as unknown as Torpedo;

describe('decoys', () => {
  it('draw one torpedo each, the nearest coming for their ship within reach while they burn, launched before the drop or after', () => {
    const decoys = new Decoys(new THREE.Texture());
    const owner = ship('a');
    const other = ship('b');
    // launched after the drop: one far off, one at another ship, one within reach
    const far = torpedo(owner, DECOY_LURE * 3);
    const elsewhere = torpedo(other, 100);
    const torpedoes: Torpedo[] = [far, elsewhere];
    const decoy = decoys.drop('d1', owner, new THREE.Vector3(), new THREE.Vector3(), 0, torpedoes);
    const after = torpedo(owner, DECOY_LURE / 2);
    const nearer = torpedo(owner, DECOY_LURE / 4);
    torpedoes.push(after, nearer);
    decoys.update(0.1, 0.1, torpedoes);
    expect(nearer.target).toBe(decoy);
    expect(after.target).toBe(owner);
    expect(far.target).toBe(owner);
    expect(elsewhere.target).toBe(other);
    // a second decoy takes the second torpedo
    const second = decoys.drop('d2', owner, new THREE.Vector3(), new THREE.Vector3(), 0.1, torpedoes);
    expect(after.target).toBe(second);
    // the torpedo it drew is gone: the decoy is spent, the next one after its ship goes on
    torpedoes.splice(torpedoes.indexOf(nearer), 1);
    const salvo = torpedo(owner, 10);
    torpedoes.push(salvo);
    decoys.update(0.1, 0.2, torpedoes);
    expect(decoys.list).not.toContain(decoy);
    expect(decoy.alive).toBe(false);
    expect(salvo.target).toBe(owner);
  });

  it('draw another torpedo once the one they drew lost sight of them, and none once burnt down', () => {
    const decoys = new Decoys(new THREE.Texture());
    const owner = ship('a');
    const first = torpedo(owner, 100);
    const torpedoes = [first];
    const decoy = decoys.drop('d1', owner, new THREE.Vector3(), new THREE.Vector3(), 0, torpedoes);
    expect(first.target).toBe(decoy);
    // behind a rock its seeker lost the decoy
    first.target = null;
    const next = torpedo(owner, 200);
    torpedoes.push(next);
    decoys.update(0.1, 0.1, torpedoes);
    expect(next.target).toBe(decoy);
    // burnt down, it lures none
    next.target = null;
    decoys.update(0.1, DECOY_LIFE + 0.1, torpedoes);
    const late = torpedo(owner, 10);
    torpedoes.push(late);
    decoys.update(0.1, DECOY_LIFE + 0.2, torpedoes);
    expect(late.target).toBe(owner);
  });
});
