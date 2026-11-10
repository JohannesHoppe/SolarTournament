import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { cos, hypot, sin } from '../detmath';
import { planOf, type SceneName } from './scenes';
import { MISSIONS } from './missions';
import { FlightSchool } from '../game/school';
import { CAB } from '../world/office';
import { GALLEY } from '../world/galley';
import { GULLET } from '../world/gullet';
import { CAB_RADIUS } from '../world/yard';
import { DOME_RADIUS } from '../world/moon';

/**
 * A scene's plan: the clone and everyone inside its room, the people close enough to talk (2 to
 * 6 m, 40 to 120 units) and facing the clone, the clone's first look on `first`.
 */
function expectPlan(scene: SceneName, inside: (point: THREE.Vector3) => boolean, first: string) {
  const { people, eye, look } = planOf(scene);
  expect(inside(eye)).toBe(true);
  for (const { who, at, facing } of people) {
    expect(inside(at), who).toBe(true);
    const apart = hypot(at.x - eye.x, at.z - eye.z);
    expect(apart, who).toBeGreaterThan(40);
    expect(apart, who).toBeLessThan(120);
    // a figure faces +z; turned by `facing` it looks at the clone
    const face = new THREE.Vector3(sin(facing), 0, cos(facing));
    const toEye = new THREE.Vector3(eye.x - at.x, 0, eye.z - at.z).normalize();
    expect(face.dot(toEye), who).toBeGreaterThan(0.99);
  }
  // the camera's first look (along -z, turned by `look`) goes to `first`
  const view = new THREE.Vector3(-sin(look), 0, -cos(look));
  const person = people.find((p) => p.who === first)!;
  expect(view.dot(new THREE.Vector3(person.at.x - eye.x, 0, person.at.z - eye.z).normalize())).toBeGreaterThan(0.99);
}

describe('the scenes in person', () => {
  it("Rask's office: everyone inside the cab, the people a few meters off and facing the clone, the clone looking at Rask", () => {
    expectPlan('office', (point) => hypot(point.x - CAB.x, point.z - CAB.z) < CAB_RADIUS - 40, 'rask');
  });

  it('Patience’s galley: everyone inside the room, the people a few meters off and facing the clone, the clone looking at Hedda', () => {
    // the room: 9 m long, 6 m wide round its middle
    expectPlan('galley', (point) => Math.abs(point.x - GALLEY.x) < 90 && Math.abs(point.z - GALLEY.z) < 60, 'hedda');
  });

  it('Bellamy Crisp’s visit: in Patience’s galley, Crisp at the counter, the clone looking at Hedda', () => {
    expectPlan('sponsor', (point) => Math.abs(point.x - GALLEY.x) < 90 && Math.abs(point.z - GALLEY.z) < 60, 'hedda');
    expect(planOf('sponsor').people.map((person) => person.who)).toEqual(['hedda', 'crisp']);
  });

  it('the Gullet: everyone inside the cave, Kesh behind her counter facing the clone, the clone looking at her; shut in the rock', () => {
    // the room: 14 m long, 9 m wide round its middle
    expectPlan('gullet', (point) => Math.abs(point.x - GULLET.x) < 140 && Math.abs(point.z - GULLET.z) < 90, 'kesh');
    expect(planOf('gullet').indoors).toBe(true);
    expect(planOf('galley').indoors).toBeFalsy();
  });

  it('the Ballroom: everyone under the dome, the President and Quill a few meters off and facing the clone, the clone looking up at the President', () => {
    expectPlan('ballroom', (point) => hypot(point.x, point.z) < DOME_RADIUS, 'president');
    // the President stands on his dais, above the clone's floor
    const { people, eye } = planOf('ballroom');
    expect(people[0].at.y).toBeGreaterThan(eye.y - 34);
  });
});

describe('a mission resumed in a scene in person', () => {
  it('starts in the room the clone climbed out into, and in the cockpit once it climbed back in', () => {
    let staged = 0;
    for (const mission of MISSIONS) {
      let inside: SceneName | null = null;
      mission.drills.forEach((drill, i) => {
        expect(new FlightSchool(null, i, mission).startsStaged).toBe(inside);
        if (drill.sceneAfter !== undefined) inside = drill.sceneAfter;
        if (inside) staged++;
      });
    }
    expect(staged).toBeGreaterThan(0);
  });
});
