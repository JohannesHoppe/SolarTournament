import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { ARENAS } from './arenas';
import { HULL_BOXES } from './shapes';
import { testField } from '../test/field';
import { DISTANT_DETAIL } from './rocks';
import { FALL_STEP, FreeFall, GRAVITATION, HALF_MASS, hullClearance, METERS, WRECK, wreckPotential, wreckPull } from './wreckgravity';

describe("the Derelict's gravity", () => {
  it('weighs each half as the field does: its boxes by the hull density', () => {
    const field = testField(DISTANT_DETAIL, HULL_BOXES);
    field.generate(ARENAS.find((arena) => arena.id === 'derelict')!.layout);
    for (const weld of [0, 1]) {
      const piece = [...field.asteroids.values()].find((a) => a.weld === weld)!;
      expect(HALF_MASS[weld] / field.bodyMass(piece)).toBeCloseTo(1, 12);
    }
    // the bow 49.8 million tonnes, the stern 45.1
    expect(HALF_MASS[0] / 1e9).toBeCloseTo(49.8, 0);
    expect(HALF_MASS[1] / 1e9).toBeCloseTo(45.1, 0);
  });

  it('pulls as its rods do: the potential falls along the pull, and a rod is the sum of its slices', () => {
    const pull = new THREE.Vector3();
    const step = 0.01;
    for (const at of [
      [-450, 20, 30],
      [-530, 0, 0],
      [-1500, 200, -300],
      [300, -80, 400],
      [-200, 180, 100],
    ]) {
      const p = new THREE.Vector3(...at);
      if (hullClearance(p) < 10) continue;
      wreckPull(p, pull);
      // the pull is minus the potential's slope, on every axis
      for (const axis of [new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 0, 1)]) {
        const slope = (wreckPotential(p.clone().addScaledVector(axis, step)) - wreckPotential(p.clone().addScaledVector(axis, -step))) / (2 * step);
        expect(Math.abs(-slope - pull.dot(axis))).toBeLessThan(1e-6 * pull.length() + 1e-12);
      }
      // the rods against 20,000 point masses along each
      const slices = new THREE.Vector3();
      for (const rod of WRECK) {
        const n = 20000;
        for (let i = 0; i < n; i++) {
          const q = rod.from.clone().addScaledVector(rod.along, ((i + 0.5) / n) * rod.length);
          const d = q.sub(p);
          const r = d.length();
          slices.addScaledVector(d, (GRAVITATION * rod.mass) / n / (r * r * r));
        }
      }
      expect(slices.distanceTo(pull)).toBeLessThan(1e-4 * pull.length());
    }
  });

  it('keeps a falling body on its loop: its energy only wobbles, and its steps are the same bits however it is stepped', () => {
    // 200 m off the bow's torn end, across the pull at about the speed that holds it there
    const start = new THREE.Vector3(-500 + 200, 30, 40);
    const g = wreckPull(start, new THREE.Vector3());
    const speed = new THREE.Vector3(0, 0, 1).addScaledVector(g, -g.z / g.lengthSq()).setLength(Math.sqrt(g.length() * 200));
    const fall = new FreeFall(start, speed);
    const energy = fall.energy();
    expect(energy).toBeLessThan(0);
    let worst = 0;
    for (let t = 0; t < 4 * 3600; t += FALL_STEP) {
      fall.advance();
      worst = Math.max(worst, Math.abs(fall.energy() - energy) / Math.abs(energy));
    }
    expect(worst).toBeLessThan(1e-5);
    // stepped frame by frame, jumped to straight away, run back: alike to the bit
    const a = new FreeFall(start, speed);
    const b = new FreeFall(start, speed);
    const out = new THREE.Vector3();
    for (let t = 0; t < 600; t += 0.0167 + (t % 0.05)) a.at(t, out);
    const there = a.at(600, new THREE.Vector3());
    expect(b.at(600, new THREE.Vector3()).toArray()).toEqual(there.toArray());
    b.at(10, out);
    expect(b.at(600, new THREE.Vector3()).toArray()).toEqual(there.toArray());
    expect(METERS).toBe(0.05);
  });
});
