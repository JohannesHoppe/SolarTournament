import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { DECOY_LIFE, DECOY_LURE, Decoys } from './decoys';
import type { Ship } from '../ship/ship';
import type { Torpedo } from './torpedoes';

const ship = (id: string) => ({ id, name: id }) as unknown as Ship;
const torpedo = (target: Ship, x: number) => ({ target, position: new THREE.Vector3(x, 0, 0) }) as unknown as Torpedo;

describe('decoys', () => {
  it('lure every torpedo coming for their ship within reach while they burn, launched before the drop or after', () => {
    const decoys = new Decoys(new THREE.Texture());
    const owner = ship('a');
    const other = ship('b');
    const before = torpedo(owner, DECOY_LURE / 2);
    const torpedoes = [before];
    const decoy = decoys.drop('d1', owner, new THREE.Vector3(), new THREE.Vector3(), 0, torpedoes);
    expect(before.target).toBe(decoy);
    // launched after the drop: one far off, one at another ship, one within reach
    const far = torpedo(owner, DECOY_LURE * 3);
    const elsewhere = torpedo(other, 100);
    const after = torpedo(owner, DECOY_LURE / 4);
    torpedoes.push(far, elsewhere, after);
    decoys.update(0.1, 0.1, torpedoes);
    expect(after.target).toBe(decoy);
    expect(far.target).toBe(owner);
    expect(elsewhere.target).toBe(other);
    // burnt down, it lures none
    decoys.update(0.1, DECOY_LIFE + 0.1, torpedoes);
    const late = torpedo(owner, 10);
    torpedoes.push(late);
    decoys.update(0.1, DECOY_LIFE + 0.2, torpedoes);
    expect(late.target).toBe(owner);
  });
});
