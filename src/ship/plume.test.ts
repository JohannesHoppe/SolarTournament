import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { PLUME_CORE, PLUME_REACH, plumeReach, plumeStrength } from './plume';
import { DRIVE_STEP, LEVELS, ONLINE_LEVEL } from '../game/hangar';

const nozzle = new THREE.Vector3();
const backward = new THREE.Vector3(0, 0, 1);
const behind = (distance: number) => new THREE.Vector3(0, 0, distance);

describe('a drive plume by the main drive’s push', () => {
  it('grills a stock drive’s plume as it always did: full in its core, a hundredth at a kilometer, gone past it', () => {
    expect(plumeStrength(nozzle, backward, 1, behind(PLUME_CORE / 2), 300, 1)).toBe(1);
    expect(plumeStrength(nozzle, backward, 1, behind(PLUME_REACH - 1), 300, 1)).toBeCloseTo(0.01, 3);
    expect(plumeStrength(nozzle, backward, 1, behind(PLUME_REACH + 1), 300, 1)).toBe(0);
  });

  it('grills harder by the push and reaches √push farther, to where it falls to a stock plume’s last heat', () => {
    const power = 1 + DRIVE_STEP * LEVELS;
    expect(plumeStrength(nozzle, backward, 1, behind(PLUME_CORE / 2), 300, power)).toBeCloseTo(power);
    const reach = plumeReach(power);
    expect(reach / 20).toBeCloseTo(1072, 0);
    expect(plumeReach(1 + DRIVE_STEP * ONLINE_LEVEL) / 20).toBeCloseTo(1025, 0);
    expect(plumeStrength(nozzle, backward, 1, behind(reach - 1), 300, power)).toBeCloseTo(plumeStrength(nozzle, backward, 1, behind(PLUME_REACH - 1), 300, 1), 4);
    expect(plumeStrength(nozzle, backward, 1, behind(reach + 1), 300, power)).toBe(0);
  });
});
