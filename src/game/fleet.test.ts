import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { BATTERY_PERIOD, FIRST_ARRIVAL, Fleet, PLUME_REACH, RESPITE, type Target } from './fleet';

/** A battleship in the arena, its bow along -z at the center, unturned. */
function battleship() {
  const fleet = new Fleet(7);
  fleet.arrivesAt = 0;
  fleet.position.set(0, 0, 0);
  fleet.quaternion.identity();
  fleet.velocity.set(0, 0, 0);
  fleet.root.updateMatrixWorld();
  return fleet;
}

const zonesOf = (fleet: Fleet, kind: string) => fleet.zones.flatMap((zone, i) => (zone.kind === kind ? [i] : []));
const breakAll = (fleet: Fleet, zones: number[]) => zones.flatMap((zone) => Array.from({ length: fleet.hitsOf(zone) }, () => fleet.hit(zone, fleet.wave)).flat());
const down = new THREE.Vector3(0, -1, 0);

describe("the President's fleet", () => {
  it('takes a beam on its armor, its batteries, and its reactor only once the dome is open', () => {
    const fleet = battleship();
    const reactor = zonesOf(fleet, 'reactor')[0];
    const above = fleet.zones[reactor].at.clone().setY(20000);
    expect(fleet.raycast(above, down, 40000, 1)?.zone).toBe(-1);
    const battery = zonesOf(fleet, 'battery')[0];
    expect(fleet.raycast(fleet.zones[battery].at.clone().setY(20000), down, 40000, 1)?.zone).toBe(battery);
    // a battery that is broken lets the beam through to the armor below it
    breakAll(fleet, [battery]);
    expect(fleet.raycast(fleet.zones[battery].at.clone().setY(20000), down, 40000, 1)?.zone).toBe(-1);
    breakAll(fleet, zonesOf(fleet, 'battery'));
    expect(fleet.phase).toBe(3);
    expect(fleet.raycast(above, down, 40000, 1)?.zone).toBe(reactor);
    // far beside it, nothing
    expect(fleet.raycast(new THREE.Vector3(30000, 20000, 0), down, 40000, 1)).toBeNull();
  });

  it('turns to its plume at half its batteries, and goes down with its reactor', () => {
    const fleet = battleship();
    const batteries = zonesOf(fleet, 'battery');
    const events = breakAll(fleet, batteries.slice(0, batteries.length / 2));
    expect(fleet.phase).toBe(2);
    expect(events.filter((e) => e.kind === 'phase')).toHaveLength(1);
    breakAll(fleet, batteries);
    // hits on the sealed reactor count nothing until the dome is open
    const reactor = zonesOf(fleet, 'reactor')[0];
    const hits = fleet.hitsOf(reactor);
    const sunk = breakAll(fleet, [reactor]).filter((e) => e.kind === 'sunk');
    expect(sunk).toHaveLength(1);
    expect(fleet.wave).toBe(2);
    expect(fleet.hits.every((h) => h === 0)).toBe(true);
    expect(fleet.hitsOf(reactor)).toBeGreaterThan(hits);
    expect(fleet.arrivesAt).toBeCloseTo(RESPITE);
  });

  it('fires each battery once a period, at the same moments everywhere', () => {
    const fleet = battleship();
    let shots = 0;
    for (let clock = 0; clock <= BATTERY_PERIOD * 10; clock += 1 / 60) shots += fleet.firing(clock).length;
    expect(shots).toBeGreaterThanOrEqual(zonesOf(fleet, 'battery').length * 9);
    expect(shots).toBeLessThanOrEqual(zonesOf(fleet, 'battery').length * 11);
  });

  it('pushes a ship out of its hull', () => {
    const fleet = battleship();
    const center = new THREE.Vector3(0, 700, 0);
    const normal = fleet.resolve(center, 300, 1)!;
    expect(normal.y).toBeCloseTo(1);
    expect(center.y).toBeGreaterThan(800 + 300);
  });

  it('turns its stern on the nearest pilot in its second phase and burns it', () => {
    const fleet = battleship();
    const batteries = zonesOf(fleet, 'battery');
    breakAll(fleet, batteries.slice(0, batteries.length / 2));
    const pilot: Target = { id: 'p:a', alive: true, flight: { position: new THREE.Vector3(15000, 0, 0) } };
    for (let t = 0; t < 30; t += 0.1) fleet.lead(0.1, 1 + t, [pilot]);
    expect(fleet.target).toBe('p:a');
    expect(fleet.burning).toBe(true);
    expect(fleet.plumeAt(pilot.flight.position, 300)).toBeGreaterThan(0);
    // beyond the plume's reach it burns nothing
    expect(fleet.plumeAt(pilot.flight.position.clone().setLength(PLUME_REACH * 2), 300)).toBe(0);
  });

  it('is followed by the other browsers as the lead flies it', () => {
    const lead = battleship();
    const other = new Fleet(7);
    expect(other.present(FIRST_ARRIVAL - 1)).toBe(false);
    const battery = zonesOf(lead, 'battery')[0];
    breakAll(lead, [battery]);
    let events = other.follow(JSON.parse(JSON.stringify(lead.toState())));
    expect(other.broken(battery)).toBe(true);
    expect(events.map((e) => e.kind)).toEqual(['broken']);
    expect(other.position.distanceTo(lead.position)).toBeLessThan(1);
    breakAll(lead, zonesOf(lead, 'battery'));
    breakAll(lead, zonesOf(lead, 'reactor'));
    events = other.follow(JSON.parse(JSON.stringify(lead.toState())));
    expect(events.map((e) => e.kind)).toContain('sunk');
    expect(other.wave).toBe(2);
  });
});
