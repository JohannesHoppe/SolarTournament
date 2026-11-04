import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { OrbitPath } from './orbitpath';
import { wellMu } from '../game/orbit';
import { arenaById } from '../world/arenas';

describe('the orbit drawn into space', () => {
  const hole = arenaById('hole')!.layout.well!;
  const mu = wellMu(hole);

  /** How far a point lies from the drawn line, the nearest of its stretches. */
  const drawn = (path: OrbitPath) => {
    const array = path.line.geometry.attributes.instanceStart.array as Float32Array;
    const points: THREE.Vector3[] = [];
    for (let i = 0; i < array.length; i += 3) points.push(new THREE.Vector3(array[i], array[i + 1], array[i + 2]));
    const stretch = new THREE.Line3();
    const closest = new THREE.Vector3();
    return (at: THREE.Vector3) =>
      Math.min(...points.map((p, i) => stretch.set(p, points[(i + 1) % points.length]).closestPointToPoint(at, true, closest).distanceTo(at)));
  };

  it('lies where free drift flies: a whole turn about the hole stays on the ellipse drawn at its start', () => {
    const position = hole.position.clone().add(new THREE.Vector3(0, 24000, 0));
    // a little faster than a circle there, and a little inward: an ellipse, tilted
    const velocity = new THREE.Vector3(Math.sqrt(mu / 24000) * 1.15, -300, 400);
    const path = new OrbitPath();
    path.show(hole, position, velocity);
    expect(path.line.visible).toBe(true);
    const nearest = drawn(path);
    const step = 1 / 240;
    let farthest = 0;
    let swept = 0;
    let before = position.clone().sub(hole.position);
    while (swept < Math.PI * 2) {
      const arm = position.clone().sub(hole.position);
      const r = arm.length();
      velocity.addScaledVector(arm, (-mu / (r * r * r)) * step);
      position.addScaledVector(velocity, step);
      const now = position.clone().sub(hole.position);
      swept += now.angleTo(before);
      before = now;
      farthest = Math.max(farthest, nearest(position));
    }
    // within half a ship's length of the line all the way round
    expect(farthest).toBeLessThan(350);
  });

  it('draws nothing for a path that is no ellipse, or without a well', () => {
    const path = new OrbitPath();
    const position = hole.position.clone().add(new THREE.Vector3(0, 24000, 0));
    path.show(hole, position, new THREE.Vector3(Math.sqrt((2 * mu) / 24000) * 1.1, 0, 0));
    expect(path.line.visible).toBe(false);
    path.show(null, position, new THREE.Vector3(1000, 0, 0));
    expect(path.line.visible).toBe(false);
  });
});
