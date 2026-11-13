import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { BATTLE_GROUND_HALF, battleHeight, battleProbe, battleRelief, BOUNDS, BRIDGE_AT, BRIDGE_HALF, CROSS, HALL, HALL_Y, HALVES, HULL_HALF, onHalf, PAD_AT } from './battlefield';
import { FIGHT_WORLDS } from './arenas';
import { reliefOutside, testField } from '../test/field';
import { DETAIL } from './rocks';
import { HOVER_HEIGHT } from '../ship/flight';
import { outsideArena } from './arena';
import { LAND } from './callisto';

/** A ship's radius in these tests (units, 17 m). */
const SHIP = 340;
const M = 20;

const valhalla = FIGHT_WORLDS.find((arena) => arena.id === 'valhalla')!;
const field = testField(DETAIL);
field.generate(valhalla.layout);
const up = new THREE.Vector3();
/** Whether a ship at `at` touches anything solid. */
const touches = (at: THREE.Vector3) => !!field.overlap(at, SHIP);

describe('Valhalla as a world fought over', () => {
  it('keeps its relief inside its box', () => {
    expect(reliefOutside(battleRelief, BATTLE_GROUND_HALF, 2000)).toEqual([]);
  });

  it('raises scarps of 100 m to 250 m and cuts gorges at their feet within the arena', () => {
    let high = -Infinity;
    let low = Infinity;
    for (let x = -BOUNDS.radius; x <= BOUNDS.radius; x += 200) {
      // across the ground beside the furrow, along it
      const h = battleHeight(x, 600 * M) - LAND;
      high = Math.max(high, h);
      low = Math.min(low, h);
    }
    console.info(`Valhalla's ground 600 m off the furrow: ${(low / M).toFixed(0)} m to ${(high / M).toFixed(0)} m`);
    expect(high).toBeGreaterThan(150 * M);
    expect(high).toBeLessThan(330 * M);
    expect(low).toBeLessThan(-50 * M);
  });

  it("lets a ship fly through each half of the cruiser from end to end along its hall, and across it through its tunnel, and nowhere through its hull", () => {
    const point = new THREE.Vector3();
    for (const half of HALVES) {
      for (let x = -HULL_HALF.x - 400; x <= HULL_HALF.x + 400; x += 200) {
        expect(touches(onHalf(half, point.set(x, HALL_Y, 0), point)), `along the hall at ${x}`).toBe(false);
      }
      for (let z = -HULL_HALF.z - 400; z <= HULL_HALF.z + 400; z += 200) {
        expect(touches(onHalf(half, point.set(0, HALL_Y, z), point)), `across the tunnel at ${z}`).toBe(false);
      }
      // the hull is solid beside the hall and under the roof
      expect(touches(onHalf(half, point.set(HULL_HALF.x / 2, HALL_Y, HALL.width / 2 + 600), point))).toBe(true);
      expect(touches(onHalf(half, point.set(-HULL_HALF.x / 2, HULL_HALF.y - 300, 0), point))).toBe(true);
      expect(CROSS).toBeGreaterThan(SHIP * 3);
    }
  });

  it('carries a ship through a hall on the hover field: its floor is ground', () => {
    for (const half of HALVES) {
      const at = onHalf(half, new THREE.Vector3(HULL_HALF.x / 2, HALL_Y - HALL.height / 2 + SHIP + HOVER_HEIGHT, 0));
      const height = field.groundBelow(at, up);
      expect(height).not.toBeNull();
      expect(Math.abs(height! - SHIP - HOVER_HEIGHT)).toBeLessThan(40);
    }
  });

  it('leaves 50 m or more of open gorge under every ice bridge, and the bridges solid', () => {
    for (const at of BRIDGE_AT) {
      const under = new THREE.Vector3(at.x, at.y - BRIDGE_HALF.y - SHIP - 200, at.z);
      expect(touches(under), `under the bridge at ${at.toArray()}`).toBe(false);
      expect(under.y - SHIP - battleHeight(under.x, under.z)).toBeGreaterThan(0);
      expect(at.y - BRIDGE_HALF.y - battleHeight(at.x, at.z)).toBeGreaterThan(50 * M);
      expect(touches(at)).toBe(true);
    }
  });

  it('prints its clones on pads inside the arena, each resting a ship at the ride height clear of anything solid', () => {
    expect(PAD_AT.length).toBe(8);
    for (const top of PAD_AT) {
      const ship = top.clone().setY(top.y + SHIP + HOVER_HEIGHT);
      expect(outsideArena(ship, BOUNDS)).toBe(false);
      expect(touches(ship)).toBe(false);
      expect(field.groundBelow(ship, up)! - SHIP).toBeCloseTo(HOVER_HEIGHT, -1);
      expect(up.y).toBeGreaterThan(0.999);
    }
  });

  it('puts its sponsor probes inside the arena, most of them at the cruiser', () => {
    const out = new THREE.Vector3();
    let near = 0;
    const n = 400;
    for (let i = 0; i < n; i++) {
      let k = 0;
      const h = () => ((i * 7919 + ++k * 104729) % 1000) / 1000;
      battleProbe(h, out);
      expect(outsideArena(out, BOUNDS), `${out.toArray()}`).toBe(false);
      expect(out.y).toBeGreaterThan(battleHeight(out.x, out.z));
      if (Math.abs(out.x) < HULL_HALF.x * 2.6 && Math.abs(out.z) < 200 * M) near++;
    }
    expect(near / n).toBeGreaterThan(0.5);
  });

  it('holds a ship inside low and tight: 1.25 km round its middle, under a ceiling 550 m over the plain', () => {
    expect(outsideArena(new THREE.Vector3(BOUNDS.radius * 0.99, LAND + 500 * M, 0), BOUNDS)).toBe(false);
    expect(outsideArena(new THREE.Vector3(BOUNDS.radius * 1.01, LAND, 0), BOUNDS)).toBe(true);
    expect(outsideArena(new THREE.Vector3(0, LAND + 560 * M, 0), BOUNDS)).toBe(true);
  });
});
