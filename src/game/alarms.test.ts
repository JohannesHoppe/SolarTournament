import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { AlarmTones, Alarms, escapeLoad, WELL_CAUTION, WELL_CRITICAL, WELL_LOST, WELL_WARNING, wellLevel } from './alarms';
import { arenaById } from '../world/arenas';
import { MAIN_THRUST } from '../ship/flight';

/** One frame of the game's alarms: raise, rank, start the next. */
function frame(alarms: Alarms, raise: () => void) {
  raise();
  alarms.finish();
  const list = alarms.list.map((alarm) => ({ id: alarm.id, level: alarm.level, rose: alarms.rose(alarm) }));
  alarms.begin();
  return list;
}

describe('the alarms', () => {
  it('rank the worst first, and the soonest countdown first within a level', () => {
    const alarms = new Alarms();
    const list = frame(alarms, () => {
      alarms.raise({ id: 'laser', level: 'caution', text: 'LASER OVERHEATED' });
      alarms.raise({ id: 'comet', level: 'critical', text: 'COMET', seconds: 6 });
      alarms.raise({ id: 'impact', level: 'critical', text: 'IMPACT', seconds: 1.2 });
      alarms.raise({ id: 'torpedo', level: 'warning', text: 'TORPEDO INBOUND' });
    });
    expect(list.map((alarm) => alarm.id)).toEqual(['impact', 'comet', 'torpedo', 'laser']);
  });

  it('keep the worst level of a danger raised twice in a frame', () => {
    const alarms = new Alarms();
    alarms.raise({ id: 'flare', level: 'critical', text: 'A' });
    alarms.raise({ id: 'flare', level: 'caution', text: 'B' });
    alarms.finish();
    expect(alarms.top?.level).toBe('critical');
    expect(alarms.top?.text).toBe('A');
  });

  it('tell a new or a worse alarm from one that stays, and drop one no longer raised', () => {
    const alarms = new Alarms();
    expect(frame(alarms, () => alarms.raise({ id: 'well', level: 'caution', text: '' }))).toEqual([{ id: 'well', level: 'caution', rose: true }]);
    expect(frame(alarms, () => alarms.raise({ id: 'well', level: 'caution', text: '' }))).toEqual([{ id: 'well', level: 'caution', rose: false }]);
    expect(frame(alarms, () => alarms.raise({ id: 'well', level: 'warning', text: '' }))).toEqual([{ id: 'well', level: 'warning', rose: true }]);
    expect(frame(alarms, () => alarms.raise({ id: 'well', level: 'caution', text: '' }))).toEqual([{ id: 'well', level: 'caution', rose: false }]);
    expect(frame(alarms, () => {})).toEqual([]);
    expect(alarms.top).toBeNull();
  });

  it('copy a direction, so the raiser may reuse its vector', () => {
    const alarms = new Alarms();
    const direction = new THREE.Vector3(1, 0, 0);
    alarms.raise({ id: 'comet', level: 'warning', text: 'COMET', direction });
    direction.set(0, 1, 0);
    alarms.finish();
    expect(alarms.top?.hasDirection).toBe(true);
    expect(alarms.top?.direction.x).toBe(1);
  });

  it('sound only the worst alarm, at once when it takes over', () => {
    const alarms = new Alarms();
    const tones = new AlarmTones();
    const heard: number[] = [];
    const sound = { beep: (frequency: number) => void heard.push(frequency) };
    alarms.raise({ id: 'laser', level: 'caution', text: '' });
    alarms.raise({ id: 'torpedo', level: 'warning', text: '', tone: 'torpedo' });
    alarms.finish();
    tones.play(alarms.top, 0, sound);
    expect(heard).toEqual([1480]);
    tones.play(alarms.top, 0.05, sound);
    expect(heard).toEqual([1480]);
    alarms.begin();
    alarms.raise({ id: 'impact', level: 'critical', text: '' });
    alarms.finish();
    tones.play(alarms.top, 0.06, sound);
    expect(heard.length).toBe(2);
  });
});

describe('the escape load of a gravity well', () => {
  const hole = arenaById('hole')!.layout.well!;
  const rest = new THREE.Vector3();

  it('is the pull over the thrust for a ship at rest', () => {
    // 1 g at 1 km from the black hole
    expect(escapeLoad(hole, new THREE.Vector3(20000, 0, 0), rest, MAIN_THRUST)).toBeCloseTo(196.2 / MAIN_THRUST, 4);
  });

  it('grows with the fall towards the body, and not with a climb away from it', () => {
    const at = new THREE.Vector3(20000, 0, 0);
    const still = escapeLoad(hole, at, rest, MAIN_THRUST);
    const falling = escapeLoad(hole, at, new THREE.Vector3(-4000, 0, 0), MAIN_THRUST);
    const climbing = escapeLoad(hole, at, new THREE.Vector3(4000, 0, 0), MAIN_THRUST);
    // 200 m/s towards the hole with 825 m to its horizon: 4000² / (2 · 16500) units/s² more to brake
    expect(falling).toBeCloseTo(still + (4000 * 4000) / (2 * 16500) / MAIN_THRUST, 4);
    expect(climbing).toBeCloseTo(still, 6);
  });

  it('doubles when the drive is down to half', () => {
    const at = new THREE.Vector3(9000, 0, 0);
    expect(escapeLoad(hole, at, rest, MAIN_THRUST / 2)).toBeCloseTo(2 * escapeLoad(hole, at, rest, MAIN_THRUST), 6);
  });

  it('raises the alarm in tiers, before the point of no return', () => {
    expect(wellLevel(WELL_CAUTION - 0.01)).toBeNull();
    expect(wellLevel(WELL_CAUTION)).toBe('caution');
    expect(wellLevel(WELL_WARNING)).toBe('warning');
    expect(wellLevel(WELL_CRITICAL)).toBe('critical');
    expect(wellLevel(WELL_LOST)).toBe('critical');
    expect(WELL_CAUTION < WELL_WARNING && WELL_WARNING < WELL_CRITICAL && WELL_CRITICAL < WELL_LOST).toBe(true);
  });

  it('warns a ship drifting at rest towards the black hole in time to burn out', () => {
    // where the pull alone reaches each tier, a full burn still gets out: the caution comes hundreds of meters before the horizon
    const distanceAt = (load: number) => hole.radius * Math.sqrt(hole.surfaceGravity / (load * MAIN_THRUST));
    expect(distanceAt(WELL_CAUTION) - hole.radius).toBeGreaterThan(10000);
    expect(distanceAt(WELL_LOST)).toBeGreaterThan(hole.radius);
  });
});
