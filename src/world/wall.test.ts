import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { arenaById } from './arenas';
import { ARENA_LIMIT } from './arena';
import { hullInLight, inLight, LIGHT_REACH, lightAim, lightAt, LIGHTS, WALL_TOP } from './wall';

/**
 * A barge crossing the wall on a straight way at 25 m/s, `over` units above its top edge, at
 * `z` along it, setting out at field time `start`: how often the searchlights see it, as Wall
 * Run counts (3 s held, adding up, fading at half that pace, a moment's grace after each).
 */
function crossings(over: number, z: number, start: number): number {
  const middle = new THREE.Vector3();
  const way = new THREE.Vector3(1, 0, 0);
  let held = 0;
  let seen = 0;
  let grace = 0;
  for (let t = 0; t < 120; t += 0.1) {
    middle.set(-30000 + 500 * t, WALL_TOP + over, z);
    if (middle.x > 30000) break;
    const lit = hullInLight(middle, way, start + t) && t >= grace;
    held = lit ? held + 0.1 : Math.max(0, held - 0.05);
    if (held >= 3) {
      seen++;
      held = 0;
      grace = t + 3;
    }
  }
  return seen;
}

/** The share of crossings `over` units above the edge, at every 100 m along it and every second of a sweep, that are seen fewer than twice. */
function made(over: number): number {
  let made = 0;
  let all = 0;
  for (let start = 0; start < 24; start++) {
    for (let z = -40000; z <= 40000; z += 2000) {
      all++;
      if (crossings(over, z, start) < 2) made++;
    }
  }
  return made / all;
}

describe('the Solar Wall', () => {
  it('stands across the arena: no way round it or under it inside the arena, its top within reach', () => {
    const place = arenaById('wall')!;
    expect(WALL_TOP).toBeLessThan(ARENA_LIMIT);
    const pieces = place.layout.placements!;
    expect(pieces.some((piece) => piece.solid && piece.kind === 'rack')).toBe(true);
  });

  it('sweeps its searchlights up and out, never down at the wall: no light’s axis lower than some 12° over the level', () => {
    const aim = new THREE.Vector3();
    for (let i = 0; i < LIGHTS; i++) for (let t = 0; t < 60; t += 0.5) expect(lightAim(i, t, aim).y).toBeGreaterThan(0.2);
    expect(inLight(lightAt(7, new THREE.Vector3()).add(new THREE.Vector3(0, LIGHT_REACH * 2, 0)), 0)).toBe(false);
  });

  it('lets a barge led low over the edge through most of the time, and sees one led high over it', () => {
    expect(made(1000)).toBeGreaterThan(0.6);
    expect(made(6000)).toBeLessThan(0.15);
  });
});
