import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { ARENAS, arenaById, SATURN_CENTER } from './arenas';
import { climbOf, closure, footOf, heightOf, referencesOf, skyPointer } from './reference';

const view = (pitch: number, yaw: number, roll: number) => new THREE.Quaternion().setFromEuler(new THREE.Euler(pitch, yaw, roll, 'YXZ'));
const degrees = (radians: number) => THREE.MathUtils.radToDeg(radians);

describe('the reference plane', () => {
  it('tells the height above it and the climb away from it, below and sinking negative', () => {
    expect(heightOf(new THREE.Vector3(300, 2000, -500))).toBe(2000);
    expect(heightOf(new THREE.Vector3(0, -750, 0))).toBe(-750);
    expect(climbOf(new THREE.Vector3(900, -40, 0))).toBe(-40);
    expect(footOf(new THREE.Vector3(300, 2000, -500), new THREE.Vector3()).toArray()).toEqual([300, 0, -500]);
  });

  it('holds every arena: its rings and disks lie in it, its giant straight below, the derelict along it', () => {
    for (const arena of ARENAS) {
      // a flat field is a disk in the plane
      if (arena.layout.flat !== undefined) expect(arena.layout.flat).toBeLessThan(arena.layout.radius / 5);
      // a massive body lies in the middle of the plane or straight below the center
      const well = arena.layout.well;
      if (well) expect(Math.hypot(well.position.x, well.position.z)).toBe(0);
    }
    expect(heightOf(SATURN_CENTER)).toBe(0);
    expect(heightOf(arenaById('giant')!.layout.well!.position)).toBeLessThan(0);
    expect(heightOf(arenaById('hole')!.layout.well!.position)).toBe(0);
    expect(heightOf(arenaById('derelict')!.references[0].position)).toBe(0);
  });
});

describe('the sky pointer of the bank scale', () => {
  it('stands straight up with the wings level, whatever the heading and the climb', () => {
    expect(skyPointer(view(0, 0, 0))).toBeCloseTo(0);
    expect(skyPointer(view(0.5, 2, 0))).toBeCloseTo(0);
    expect(skyPointer(view(-0.7, -1, 0))).toBeCloseTo(0);
  });

  it('swings against the bank: banked left, the sky lies to the right', () => {
    expect(degrees(skyPointer(view(0, 0, THREE.MathUtils.degToRad(30))))).toBeCloseTo(30);
    expect(degrees(skyPointer(view(0, 1, THREE.MathUtils.degToRad(-45))))).toBeCloseTo(-45);
    expect(Math.abs(degrees(skyPointer(view(0, 0, Math.PI))))).toBeCloseTo(180);
  });

  it('means nothing looking straight up or down', () => {
    expect(skyPointer(view(Math.PI / 2, 0, 0.3))).toBeNaN();
    expect(skyPointer(view(-Math.PI / 2 + 0.05, 1, 0))).toBeNaN();
  });
});

describe('the closure rate of a target', () => {
  const at = (x: number, y = 0, z = 0) => new THREE.Vector3(x, y, z);
  it('is positive while the range shrinks, negative while it opens', () => {
    expect(closure(at(0), at(10), at(100), at(-5))).toBeCloseTo(15);
    expect(closure(at(0), at(-10), at(100), at(5))).toBeCloseTo(-15);
  });

  it('counts only the motion along the line of sight', () => {
    expect(closure(at(0), at(0, 0, 30), at(100), at(0))).toBeCloseTo(0);
    expect(closure(at(0), at(0), at(0), at(5))).toBe(0);
  });
});

describe('the fixed references of an arena', () => {
  it('mark the field center once in every arena, as the black hole where it lies there', () => {
    for (const arena of ARENAS) {
      const centered = referencesOf(arena).filter((reference) => reference.position.lengthSq() === 0);
      expect(centered.map((reference) => reference.glyph)).toEqual([arena.id === 'hole' ? 'hole' : 'center']);
    }
  });

  it('mark the world ship by its bow and stern, and the gas giant straight below', () => {
    expect(referencesOf(arenaById('derelict')!).map((reference) => reference.label)).toEqual(['Center', 'Bow', 'Stern']);
    const giant = referencesOf(arenaById('giant')!).find((reference) => reference.glyph === 'giant')!;
    expect(giant.position.x).toBe(0);
    expect(giant.position.z).toBe(0);
    // its distance is measured to the clouds, 2.25 km below the center
    expect(giant.position.length() - giant.radius!).toBeCloseTo(45000);
  });
});
