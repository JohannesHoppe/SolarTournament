import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { cos, hypot, sin } from '../detmath';
import { planOf } from './scenes';
import { CAB } from '../world/office';
import { CAB_RADIUS } from '../world/yard';

describe('the scenes in person', () => {
  it("Rask's office: everyone inside the cab, the people a few meters off and facing the clone, the clone looking at Rask", () => {
    const { people, eye, look } = planOf('office');
    const inCab = (point: THREE.Vector3) => hypot(point.x - CAB.x, point.z - CAB.z) < CAB_RADIUS - 40;
    expect(inCab(eye)).toBe(true);
    for (const { who, at, facing } of people) {
      expect(inCab(at), who).toBe(true);
      // close enough to talk: 2 to 6 m (40 to 120 units)
      const apart = hypot(at.x - eye.x, at.z - eye.z);
      expect(apart, who).toBeGreaterThan(40);
      expect(apart, who).toBeLessThan(120);
      // a figure faces +z; turned by `facing` it looks at the clone
      const face = new THREE.Vector3(sin(facing), 0, cos(facing));
      const toEye = new THREE.Vector3(eye.x - at.x, 0, eye.z - at.z).normalize();
      expect(face.dot(toEye), who).toBeGreaterThan(0.99);
    }
    // the camera's first look (along -z, turned by `look`) goes to the first person, Rask
    const view = new THREE.Vector3(-sin(look), 0, -cos(look));
    const rask = people.find((person) => person.who === 'rask')!;
    expect(view.dot(new THREE.Vector3(rask.at.x - eye.x, 0, rask.at.z - eye.z).normalize())).toBeGreaterThan(0.99);
  });
});
