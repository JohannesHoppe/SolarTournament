import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { ARRIVAL, BATTERY_PERIOD, Fleet, PLUME_REACH, SINK_SECONDS, TORPEDO_HITS, type Target } from './fleet';

/** A battleship in the arena, its bow along -z at the center, unturned. */
function battleship() {
  const fleet = new Fleet(7);
  fleet.arrivesAt = 0;
  fleet.position.set(0, 0, 0);
  fleet.quaternion.identity();
  fleet.velocity.set(0, 0, 0);
  fleet.root.updateMatrixWorld();
  fleet.update(1, 0);
  return fleet;
}

const zonesOf = (fleet: Fleet, kind: string) => fleet.zones.flatMap((zone, i) => (zone.kind === kind ? [i] : []));
const breakAll = (fleet: Fleet, zones: number[]) => zones.flatMap((zone) => Array.from({ length: fleet.hitsOf(zone) }, () => fleet.hit(zone)).flat());
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

  it('turns to its plume at half its batteries, and goes down with its reactor, once a round', () => {
    const fleet = battleship();
    const batteries = zonesOf(fleet, 'battery');
    const events = breakAll(fleet, batteries.slice(0, batteries.length / 2));
    expect(fleet.phase).toBe(2);
    expect(events.filter((e) => e.kind === 'phase')).toHaveLength(1);
    breakAll(fleet, batteries);
    // hits on the sealed reactor count nothing until the dome is open
    const reactor = zonesOf(fleet, 'reactor')[0];
    const sunk = breakAll(fleet, [reactor]).filter((e) => e.kind === 'sunk');
    expect(sunk).toHaveLength(1);
    // it burns with its reactor critical, then it is over: no next one, and no more hits count
    expect(fleet.present(1)).toBe(false);
    expect(fleet.sunk(SINK_SECONDS / 2)).toBe(false);
    expect(fleet.sunk(SINK_SECONDS + 0.1)).toBe(true);
    expect(fleet.present(1000)).toBe(false);
    expect(fleet.hit(batteries[0])).toEqual([]);
  });

  it('fires each battery once a period, at the same moments everywhere', () => {
    const fleet = battleship();
    let shots = 0;
    for (let clock = 0; clock <= BATTERY_PERIOD * 10; clock += 1 / 60) shots += fleet.firing(clock).length;
    expect(shots).toBeGreaterThanOrEqual(zonesOf(fleet, 'battery').length * 9);
    expect(shots).toBeLessThanOrEqual(zonesOf(fleet, 'battery').length * 11);
  });

  it('hides what is behind its hull and sets off a torpedo that touches it', () => {
    const fleet = battleship();
    const across = new THREE.Vector3(1, 0, 0);
    expect(fleet.ray(new THREE.Vector3(-20000, 0, 0), across, 40000)).not.toBeNull();
    // a ray that stops short of it, or passes above it, sees past
    expect(fleet.ray(new THREE.Vector3(-20000, 0, 0), across, 10000)).toBeNull();
    expect(fleet.ray(new THREE.Vector3(-20000, 5000, 0), across, 40000)).toBeNull();
    expect(fleet.touches(new THREE.Vector3(0, 900, 0), 120)).toBe(true);
    expect(fleet.touches(new THREE.Vector3(0, 2000, 0), 120)).toBe(false);
    // gone up, it is gone from the field
    breakAll(fleet, zonesOf(fleet, 'battery'));
    breakAll(fleet, zonesOf(fleet, 'reactor'));
    fleet.update(SINK_SECONDS + 100, 0);
    expect(fleet.ray(new THREE.Vector3(-20000, 0, 0), across, 40000)).toBeNull();
  });

  it('counts a torpedo as TORPEDO_HITS hits on every open part it goes off near, and lets one lock on them', () => {
    const fleet = battleship();
    const battery = zonesOf(fleet, 'battery')[0];
    const reactor = zonesOf(fleet, 'reactor')[0];
    expect(fleet.beacons[battery].alive).toBe(true);
    expect(fleet.beacons[battery].flight.position.distanceTo(fleet.zoneAt(battery))).toBeLessThan(1);
    // the sealed reactor is no target
    expect(fleet.beacons[reactor].alive).toBe(false);
    const at = fleet.zoneAt(battery).add(new THREE.Vector3(0, 400, 0));
    for (const zone of fleet.blast(at)) fleet.hit(zone, TORPEDO_HITS);
    expect(fleet.blast(at)).toEqual([battery]);
    expect(fleet.hits[battery]).toBe(TORPEDO_HITS);
    // more hits than a part has left break it and count no further
    fleet.hit(battery, fleet.hitsOf(battery));
    expect(fleet.hits[battery]).toBe(fleet.hitsOf(battery));
    expect(fleet.beacons[battery].alive).toBe(false);
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
    // a bot in it flies away from its axis, out to the side
    const axis = fleet.plumeNear(pilot.flight.position, 2300, new THREE.Vector3())!;
    expect(axis.distanceTo(pilot.flight.position)).toBeLessThan(2300 + 1400 + PLUME_REACH * 0.12);
    expect(fleet.plumeNear(new THREE.Vector3(15000, 0, 20000), 2300, new THREE.Vector3())).toBeNull();
  });

  it('is followed by the other browsers as the lead flies it', () => {
    const lead = battleship();
    const other = new Fleet(7);
    expect(other.present(ARRIVAL - 1)).toBe(false);
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
    expect(other.down).toBe(true);
    // a browser that comes after it went down sees it gone, with no blast to set off
    const late = new Fleet(7);
    expect(late.follow(JSON.parse(JSON.stringify(lead.toState())))).toEqual([]);
    expect(late.down).toBe(true);
  });
});
