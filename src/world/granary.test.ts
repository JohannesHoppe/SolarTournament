import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { COMET_AT, COURIER_BUOYS, GRANARY_FROM, inCone, SENSOR_ANGLE, SENSOR_REACH, sensorAim, TUGS } from './granary';
import { ARENA_LIMIT } from './arena';
import { tan } from '../detmath';

describe('Lantern and Granary', () => {
  it('lays the settlers’ beacons at Kiln, the Feeders’ tugs, the comet and the way in, all inside the arena', () => {
    for (const point of [...COURIER_BUOYS, ...TUGS, COMET_AT, GRANARY_FROM]) expect(point.length()).toBeLessThan(ARENA_LIMIT);
  });

  it('holds a point on a tug’s sensor axis, and lets one behind the tug, past the cone’s reach or beside its edge go', () => {
    const aim = new THREE.Vector3();
    const side = new THREE.Vector3();
    for (const time of [0, 7.5, 13]) {
      sensorAim(0, time, aim);
      side.set(0, 1, 0).cross(aim).normalize();
      expect(inCone(0, TUGS[0].clone().addScaledVector(aim, SENSOR_REACH / 2), time)).toBe(true);
      expect(inCone(0, TUGS[0].clone().addScaledVector(aim, -SENSOR_REACH / 2), time)).toBe(false);
      expect(inCone(0, TUGS[0].clone().addScaledVector(aim, SENSOR_REACH * 1.2), time)).toBe(false);
      const beside = TUGS[0].clone().addScaledVector(aim, SENSOR_REACH / 2).addScaledVector(side, (SENSOR_REACH / 2) * tan(SENSOR_ANGLE) * 1.2);
      expect(inCone(0, beside, time)).toBe(false);
    }
  });
});
