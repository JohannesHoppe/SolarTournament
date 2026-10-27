import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { EARTH_ALTITUDE, EARTH_CENTER, EARTH_DOWN, EARTH_RADIUS } from './arenas';
import { BELT_INNER } from './belt';
import { junkData } from './junkyard';
import { SUN_DIRECTION } from './space';

describe('the Satellite Junkyard', () => {
  it('lies in sunlight above Earth at night: the point beneath it in the dark, the arena itself lit', () => {
    const up = EARTH_DOWN.clone().negate();
    const elevation = THREE.MathUtils.radToDeg(Math.asin(up.dot(SUN_DIRECTION)));
    // the sun 14.6° below the horizon of the point beneath the arena: night there
    expect(elevation).toBeCloseTo(-14.6, 1);
    // the way from the field's center to the sun passes Earth by
    const toCenter = EARTH_CENTER.clone();
    const along = toCenter.dot(SUN_DIRECTION);
    const miss = Math.sqrt(toCenter.lengthSq() - Math.max(along, 0) ** 2);
    expect(miss).toBeGreaterThan(EARTH_RADIUS);
    expect(EARTH_CENTER.length()).toBeCloseTo(EARTH_RADIUS + EARTH_ALTITUDE);
  });

  it('keeps every piece of junk where no ship reaches it, and within the camera\'s reach', () => {
    const { orbit, body } = junkData();
    const up = EARTH_DOWN.clone().negate();
    const height = EARTH_RADIUS + EARTH_ALTITUDE;
    const axis = new THREE.Vector3();
    expect(body.length / 4).toBeGreaterThan(3000);
    for (let i = 0; i < body.length / 4; i++) {
      axis.fromArray(orbit, i * 4);
      const radius = body[i * 4];
      // the nearest its circle comes to the field's center
      const tilt = Math.asin(Math.min(1, Math.abs(axis.dot(up))));
      const nearest = Math.sqrt((radius - height) ** 2 + 2 * radius * height * (1 - Math.cos(tilt)));
      expect(nearest).toBeGreaterThan(BELT_INNER);
      expect(nearest).toBeLessThan(400000);
    }
  });
});
