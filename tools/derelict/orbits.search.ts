import { writeFileSync } from 'node:fs';
import * as THREE from 'three';
import { test } from 'vitest';
import { Randomizer } from '../../src/random';
import { cos, sin } from '../../src/detmath';
import { FALL_STEP, FreeFall, hullClearance, WRECK, wreckPull } from '../../src/world/wreckgravity';

/**
 * Searches start states of the Derelict's free dead whose loops about the wreck last (see README
 * here): under the wreck's own gravity (src/world/wreckgravity, both halves' rods), stepped exactly
 * as the game steps them (FreeFall), each candidate is kept only if it is bound and its path stays
 * at least CLEAR (m) off every box of the hull and no farther than FAR (m) from it for DAYS days of
 * field time. Candidates start NEAR to FAR off the hull about one of the halves, moving across the
 * pull at about the speed that holds a body going round that half, in every sense and inclination.
 * Deterministic: the same SEED finds the same states. Writes src/world/wreckorbits.ts.
 */
const SEED = Number(process.env.ORBIT_SEED ?? 2584);
const DAYS = Number(process.env.ORBIT_DAYS ?? 365);
const COUNT = Number(process.env.ORBIT_COUNT ?? 24);
const WRITE = process.env.ORBIT_WRITE !== '0';
const CLEAR = 30;
const NEAR = 150;
const FAR = 1500;
/** The clearance is looked at every CHECK steps (30 s, in which a body moves less than 3 m). */
const CHECK = 3;
const DAY = 86400;

/** Each half's centre of mass (m). */
const centers = [0, 1].map((weld) => {
  const rods = WRECK.filter((rod) => rod.weld === weld);
  const mass = rods.reduce((sum, rod) => sum + rod.mass, 0);
  return rods.reduce((sum, rod) => sum.addScaledVector(rod.center, rod.mass / mass), new THREE.Vector3());
});

/** How long (s) a fall stays clear and near, up to `horizon`; the nearest it came. */
function lasts(fall: FreeFall, horizon: number): { time: number; nearest: number } {
  let nearest = Infinity;
  const steps = horizon / FALL_STEP;
  for (let k = 1; k <= steps; k++) {
    fall.advance();
    if (k % CHECK) continue;
    const off = hullClearance(fall.position);
    nearest = Math.min(nearest, off);
    if (off < CLEAR || off > FAR + 500) return { time: k * FALL_STEP, nearest };
  }
  return { time: horizon, nearest };
}

test(
  'the free dead: start states that last',
  () => {
    const r = new Randomizer(SEED);
    const found: { half: number; start: THREE.Vector3; speed: THREE.Vector3; nearest: number }[] = [];
    let tried = 0;
    const began = Date.now();
    const pull = new THREE.Vector3();
    while (found.length < COUNT) {
      // the halves in turn, so both keep some
      const half = found.length % 2;
      const theta = r.range(0, 6.2832);
      const z = r.range(-1, 1);
      const ring = Math.sqrt(1 - z * z);
      const toward = new THREE.Vector3(ring * cos(theta), z, ring * sin(theta));
      const start = centers[half].clone().addScaledVector(toward, r.range(1000, 2600));
      const off = hullClearance(start);
      if (off < NEAR || off > FAR) continue;
      const g = wreckPull(start, pull).length();
      const speed = new THREE.Vector3(r.range(-1, 1), r.range(-1, 1), r.range(-1, 1));
      speed.addScaledVector(pull, -speed.dot(pull) / (g * g));
      if (speed.lengthSq() < 1e-4) continue;
      speed.setLength(Math.sqrt(g * start.distanceTo(centers[half])) * r.range(0.8, 1.15));
      tried++;
      const fall = new FreeFall(start.clone(), speed.clone());
      if (fall.energy() >= 0) continue;
      const { time, nearest } = lasts(fall, DAYS * DAY);
      if (time < DAYS * DAY) continue;
      found.push({ half, start, speed, nearest });
      console.log(`${found.length}/${COUNT} after ${tried} tried, ${((Date.now() - began) / 1000).toFixed(0)} s: half ${half}, ${off.toFixed(0)} m off, nearest ${nearest.toFixed(0)} m`);
    }
    console.log(`found ${found.length} of ${tried} tried in ${((Date.now() - began) / 1000).toFixed(0)} s`);
    if (!WRITE) return;
    const rows = found.map(({ half, start, speed, nearest }) => `  [${[...start.toArray(), ...speed.toArray()].join(', ')}, ${half}], // ${nearest.toFixed(0)} m off the hull at the nearest`);
    writeFileSync(
      new URL('../../src/world/wreckorbits.ts', import.meta.url),
      `/**
 * Start states of the Derelict's free dead at field time 0 (m and m/s, as laid out; the half
 * they ride with), found by tools/derelict (npm run orbits; seed ${SEED}): each bound to the
 * wreck, and stepped as the game steps it (world/wreckgravity, FreeFall) it stays at least ${CLEAR} m
 * off every box of the hull and within ${FAR + 500} m of it for ${DAYS} days of field time. Written by the
 * tool; not edited by hand.
 */
export const WRECK_ORBITS_DAYS = ${DAYS};
export const WRECK_ORBITS: readonly (readonly [number, number, number, number, number, number, 0 | 1])[] = [
${rows.join('\n')}
];
`,
    );
  },
  7 * DAY * 1000,
);
