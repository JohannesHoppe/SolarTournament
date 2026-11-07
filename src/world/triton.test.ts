import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { GEYSER_COLUMNS, GEYSER_HEIGHT, GEYSER_PUSH, GEYSER_RADIUS, GEYSERS_AT, GROUND_HALF, groundPlacement, groundRelief, STATION_AT, surfaceHeight, TRITON_FALL } from './triton';
import { TRITON_TYPE } from './yard';
import { groundField, reliefOutside, testField } from '../test/field';
import { arenaById } from './arenas';
import { DETAIL } from './rocks';
import { ARENA_LIMIT } from './arena';

describe('Memorial on Triton', () => {
  it('collides as its ground, its dimples and ridges, its relief inside its box over the whole square', () => {
    expect(reliefOutside(groundRelief, GROUND_HALF, 1000)).toEqual([]);
    const { misses } = groundField('triton-test', groundPlacement(TRITON_TYPE), surfaceHeight, [[0, 0], [30000, -20000], [-40000, 30000], [50000, 50000]]);
    expect(misses).toEqual([]);
  });

  it('raises its geysers inside the arena, apart from each other; a column pushes a ship up on its axis harder than Triton pulls it down, and nothing beside it or over it', () => {
    const field = testField(DETAIL);
    field.generate(arenaById('triton')!.layout);
    const g = new THREE.Vector3();
    for (const geyser of GEYSERS_AT) {
      expect(Math.sqrt(geyser.x * geyser.x + geyser.z * geyser.z)).toBeLessThan(ARENA_LIMIT);
      expect(field.gravity(geyser.clone().setY(geyser.y + 2000), g).y).toBeGreaterThan(GEYSER_PUSH * 0.9 - TRITON_FALL);
      expect(field.gravity(geyser.clone().setY(geyser.y + 2000).add(new THREE.Vector3(GEYSER_RADIUS + 10, 0, 0)), g).y).toBe(-TRITON_FALL);
      expect(field.gravity(geyser.clone().setY(geyser.y + GEYSER_HEIGHT + 10), g).y).toBe(-TRITON_FALL);
    }
    expect(GEYSER_COLUMNS.length).toBe(GEYSERS_AT.length);
  });

  it('stands the Memorial Station on the plain, solid', () => {
    const field = testField(DETAIL);
    field.generate(arenaById('triton')!.layout);
    expect(field.raycast(STATION_AT.clone().setY(STATION_AT.y + 20000), new THREE.Vector3(0, -1, 0), 40000)).not.toBeNull();
    expect(field.overlap(STATION_AT.clone().setY(STATION_AT.y + 400), 200)).not.toBeNull();
  });
});
