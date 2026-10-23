import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { ARENA_LIMIT } from '../world/arena';
import { FIELD_RADIUS } from '../world/asteroids';
import { SUN_DIRECTION } from '../world/space';
import { CLONES, clonesLeft, FLARE_APPROACH, FLARE_APPROACH_REACH, FLARE_END, FLARE_FRONT_END, FLARE_START, flareClearance, flareFront, flarePocket, isOut } from './survival';

/** A point on the axis through the sun, `along` units from the arena's center towards it. */
const onAxis = (along: number) => SUN_DIRECTION.clone().multiplyScalar(along);

describe('Last Clone Standing', () => {
  it('lets the flare come at the arena from the sun, then eat into it evenly, and hold', () => {
    expect(flareFront(0)).toBe(ARENA_LIMIT + FLARE_APPROACH_REACH);
    expect(flareFront(FLARE_START - FLARE_APPROACH)).toBe(ARENA_LIMIT + FLARE_APPROACH_REACH);
    expect(flareFront(FLARE_START - FLARE_APPROACH / 2)).toBeCloseTo(ARENA_LIMIT + FLARE_APPROACH_REACH / 2);
    expect(flareFront(FLARE_START)).toBe(ARENA_LIMIT);
    expect(flareFront((FLARE_START + FLARE_END) / 2)).toBeCloseTo((ARENA_LIMIT + FLARE_FRONT_END) / 2);
    expect(flareFront(FLARE_END)).toBe(FLARE_FRONT_END);
    expect(flareFront(FLARE_END + 100)).toBe(FLARE_FRONT_END);
  });

  it('burns the side towards the sun first and leaves a pocket on the far side, among the outer rocks', () => {
    const late = FLARE_END + 1;
    // towards the sun: plasma; the center too, in the end
    expect(flareClearance(onAxis(ARENA_LIMIT * 0.9), (FLARE_START + FLARE_END) / 2)).toBeLessThan(0);
    expect(flareClearance(onAxis(0), late)).toBeLessThan(0);
    // the far side stays clear, from the front out to the arena's edge
    expect(flareClearance(onAxis(FLARE_FRONT_END - 100), late)).toBeGreaterThan(0);
    expect(flareClearance(onAxis(-ARENA_LIMIT), late)).toBeGreaterThan(0);
    // the outer rocks on the far side lie in the pocket: there is cover
    expect(flareClearance(onAxis(-FIELD_RADIUS), late)).toBeGreaterThan(0);
    // before the flare the whole arena is clear
    expect(flareClearance(onAxis(ARENA_LIMIT), FLARE_START - 1)).toBeGreaterThan(0);
  });

  it('keeps the bots and new clones in the pocket: the whole arena before, the far side after', () => {
    const at = new THREE.Vector3();
    expect(flarePocket(0, at)).toBe(ARENA_LIMIT);
    expect(at.length()).toBe(0);
    const radius = flarePocket(FLARE_END, at);
    expect(radius).toBeCloseTo((FLARE_FRONT_END + ARENA_LIMIT) / 2);
    expect(at.dot(SUN_DIRECTION)).toBeCloseTo((FLARE_FRONT_END - ARENA_LIMIT) / 2);
    // the pocket's ball lies clear of the plasma
    expect(flareClearance(at, FLARE_END)).toBeGreaterThan(radius * 0.9);
  });

  it('counts the clones down to out', () => {
    expect(clonesLeft({ deaths: 0 })).toBe(CLONES);
    expect(isOut({ deaths: CLONES - 1 })).toBe(false);
    expect(isOut({ deaths: CLONES })).toBe(true);
    expect(clonesLeft({ deaths: CLONES + 2 })).toBe(0);
  });
});
