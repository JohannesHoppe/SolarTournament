import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { EARTH_ALTITUDE, EARTH_CENTER, EARTH_DOWN, EARTH_RADIUS } from './arenas';
import { BELT_INNER } from './belt';
import { DAY_FROM, DAY_REGION, EARTH_CAP, earthFrame, junkData } from './junkyard';
import { SUN_DIRECTION } from './space';

describe('the Satellite Junkyard', () => {
  it('lies in sunlight above Earth\'s terminator: the point beneath it at dusk, the arena itself lit', () => {
    const up = EARTH_DOWN.clone().negate();
    const elevation = THREE.MathUtils.radToDeg(Math.asin(up.dot(SUN_DIRECTION)));
    // the sun 3.2° below the horizon of the point beneath the arena: dusk there
    expect(elevation).toBeCloseTo(-3.2, 1);
    // the way from the field's center to the sun passes Earth by
    const toCenter = EARTH_CENTER.clone();
    const along = toCenter.dot(SUN_DIRECTION);
    const miss = Math.sqrt(toCenter.lengthSq() - Math.max(along, 0) ** 2);
    expect(miss).toBeGreaterThan(EARTH_RADIUS);
    expect(EARTH_CENTER.length()).toBeCloseTo(EARTH_RADIUS + EARTH_ALTITUDE);
  });

  it('shows day and night below it alike, and has its day map cover every part of the built cap the sun or the twilight reaches', () => {
    const up = EARTH_DOWN.clone().negate();
    const side = new THREE.Vector3().crossVectors(up, new THREE.Vector3(0, 0, 1)).normalize();
    const other = new THREE.Vector3().crossVectors(up, side);
    const frame = earthFrame();
    const n = new THREE.Vector3();
    const q = new THREE.Vector3();
    let lit = 0;
    let day = 0;
    let night = 0;
    for (let a = 0; a <= EARTH_CAP; a += EARTH_CAP / 60) {
      for (let b = 0; b < Math.PI * 2; b += Math.PI / 90) {
        n.copy(up).multiplyScalar(Math.cos(a)).addScaledVector(side, Math.sin(a) * Math.cos(b)).addScaledVector(other, Math.sin(a) * Math.sin(b));
        // the sun up, or more than 8° down, where the cities' lights are full
        if (n.dot(SUN_DIRECTION) > 0) day++;
        if (n.dot(SUN_DIRECTION) < Math.sin(THREE.MathUtils.degToRad(-8))) night++;
        // a little short of where daylight sets in, for the texture's filtering
        if (n.dot(SUN_DIRECTION) < DAY_FROM - 0.02) continue;
        lit++;
        q.copy(n).applyMatrix3(frame);
        // as the shader reads the map: longitude and latitude in Earth's own frame
        const x = (Math.atan2(-q.z, q.x) - DAY_REGION.x) / DAY_REGION.z;
        const y = (Math.asin(q.y) - DAY_REGION.y) / DAY_REGION.w;
        expect(x).toBeGreaterThan(0.01);
        expect(x).toBeLessThan(0.99);
        expect(y).toBeGreaterThan(0.01);
        expect(y).toBeLessThan(0.99);
      }
    }
    // the terminator runs through the cap: day and full night each take a good part of it
    expect(day).toBeGreaterThan(3000);
    expect(night).toBeGreaterThan(3000);
    expect(lit).toBeGreaterThan(day);
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
