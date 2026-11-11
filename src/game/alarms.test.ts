import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { AlarmTones, Alarms, ESCAPE_REACTION, escapeLoad, WELL_CAUTION, WELL_CRITICAL, WELL_LOST, WELL_WARNING, wellEscape, wellLevel } from './alarms';
import { arenaById } from '../world/arenas';
import { MAIN_THRUST, MAX_SPEED, OVERDRIVE_DRIVE_COOLDOWN, OVERDRIVE_PUSH } from '../ship/flight';

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

  it("beat a torpedo's tone faster as its seconds to the hit run out: a sixth of them, from 0.6 s down to 0.07 s", () => {
    const beats = (seconds: number | null) => {
      const alarms = new Alarms();
      const tones = new AlarmTones();
      const heard: number[] = [];
      alarms.raise({ id: 'torpedo', level: 'warning', text: '', seconds, tone: 'torpedo' });
      alarms.finish();
      for (let now = 0; now < 1.2; now += 0.01) tones.play(alarms.top, now, { beep: () => void heard.push(now) });
      return heard[1] - heard[0];
    };
    expect(beats(null)).toBeCloseTo(0.6, 1);
    expect(beats(10)).toBeCloseTo(0.6, 1);
    expect(beats(1.8)).toBeCloseTo(0.3, 1);
    expect(beats(0.2)).toBeCloseTo(0.07, 1);
  });
});

describe('the escape load of a gravity well', () => {
  const hole = arenaById('hole')!.layout.well!;
  const rest = new THREE.Vector3();

  it('is the pull over the thrust for a ship at rest', () => {
    // 1 g at 2 km from the black hole, 4 g at 1 km
    expect(escapeLoad(hole, new THREE.Vector3(40000, 0, 0), rest, MAIN_THRUST)).toBeCloseTo(196.2 / MAIN_THRUST, 4);
    expect(escapeLoad(hole, new THREE.Vector3(20000, 0, 0), rest, MAIN_THRUST)).toBeCloseTo((4 * 196.2) / MAIN_THRUST, 4);
  });

  it('grows with the fall towards the body, and not with a climb away from it', () => {
    const at = new THREE.Vector3(20000, 0, 0);
    const still = escapeLoad(hole, at, rest, MAIN_THRUST);
    const falling = escapeLoad(hole, at, new THREE.Vector3(-4000, 0, 0), MAIN_THRUST);
    const climbing = escapeLoad(hole, at, new THREE.Vector3(4000, 0, 0), MAIN_THRUST);
    // 200 m/s towards the hole with 650 m to its horizon: 4000² / (2 · 13000) units/s² more to brake
    expect(falling).toBeCloseTo(still + (4000 * 4000) / (2 * 13000) / MAIN_THRUST, 4);
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

describe("the overdrive's last chance at a well", () => {
  const hole = arenaById('hole')!.layout.well!;
  /**
   * A fall flown straight out, 1D and on its own, as the alarm's flight ahead must agree with,
   * the nose away from the hole: the drive at `drive` of its thrust (from the start when the Host
   * burns away already, else after the reaction), which the speed limit stops from pushing faster
   * away; with the overdrive the shove after the reaction and the drive cold for its cooldown;
   * out where the burning drive outpulls the pull, climbing.
   */
  const flownOut = (distance: number, inward: number, drive: number, overdrive: boolean, burning = false) => {
    const thrust = MAIN_THRUST * drive;
    const free = hole.radius * Math.sqrt(hole.surfaceGravity / thrust);
    let r = distance;
    let v = -inward;
    const step = 1 / 240;
    for (let t = 0; t < 60; t += step) {
      const cold = overdrive && t >= ESCAPE_REACTION && t < ESCAPE_REACTION + OVERDRIVE_DRIVE_COOLDOWN;
      const warm = (burning || t >= ESCAPE_REACTION) && !cold;
      // out once the burning drive outpulls the pull, climbing: a cold drive lets the ship fall back
      if (r >= free && v >= 0 && warm && (!overdrive || t >= ESCAPE_REACTION)) return true;
      if (r <= hole.radius) return false;
      if (overdrive && t >= ESCAPE_REACTION && t < ESCAPE_REACTION + step) v += OVERDRIVE_PUSH;
      const push = warm && !(v >= MAX_SPEED) ? thrust : 0;
      v += (push - (hole.surfaceGravity * hole.radius * hole.radius) / (r * r)) * step;
      r += v * step;
    }
    return true;
  };
  const away = new THREE.Vector3(1, 0, 0);

  it('calls the overdrive exactly where only its shove gets a ship out, its cold drive after it reckoned in', () => {
    const said = { drive: 0, overdrive: 0, lost: 0 };
    /** The margin on either side of a fall judged (units, 7.5 m). */
    const EDGE = 150;
    let judged = 0;
    for (const drive of [1, 0.6, 0.3]) for (const burning of [false, true]) {
      for (let distance = hole.radius * 1.05; distance < hole.radius * 4; distance += 300) {
        for (const inward of [0, 500, 1000, 2000, 4000]) {
          const at = new THREE.Vector3(distance, 0, 0);
          const velocity = new THREE.Vector3(-inward, 0, 0);
          const escape = wellEscape(hole, at, velocity, away, drive, 0, burning, true);
          said[escape]++;
          // judged only where the fall comes out the same a few meters nearer and farther: right on
          // the edge the two reckonings' steps decide, not the rule
          const fate = (overdrive: boolean) => [-EDGE, 0, EDGE].map((off) => flownOut(distance + off, inward, drive, overdrive, burning));
          const clear = (fates: boolean[]) => fates.every((each) => each === fates[0]);
          const byDrive = fate(false);
          const byOverdrive = fate(true);
          const where = `${distance} units out, ${inward} units/s inward, drive ${drive}${burning ? ', burning away' : ''}`;
          if (!clear(byDrive)) continue;
          judged++;
          expect(escape === 'drive', where).toBe(byDrive[1]);
          if (!byDrive[1] && clear(byOverdrive)) expect(escape === 'overdrive', where).toBe(byOverdrive[1]);
        }
      }
    }
    // nearly all of them judged; the rescue is real, with a hurt drive above all: falls the drive alone has lost
    expect(judged).toBeGreaterThan(0.9 * (said.drive + said.overdrive + said.lost));
    expect(said.overdrive).toBeGreaterThan(0);
    expect(said.lost).toBeGreaterThan(0);
  });

  it('gets a hurt drive, burning flat out away and still slowly falling in, out with the overdrive', () => {
    // a drive at 30 %: no return from about 1 km, where the pull is weak enough for the shove to carry the ship out cold
    const free = hole.radius * Math.sqrt(hole.surfaceGravity / (MAIN_THRUST * 0.3));
    const at = new THREE.Vector3(free * 0.95, 0, 0);
    const velocity = new THREE.Vector3(-200, 0, 0);
    expect(escapeLoad(hole, at, velocity, MAIN_THRUST * 0.3)).toBeGreaterThan(WELL_LOST);
    expect(wellEscape(hole, at, velocity, away, 0.3, 0, true, true)).toBe('overdrive');
    // without the overdrive ready, nothing gets it out
    expect(wellEscape(hole, at, velocity, away, 0.3, 0, true, false)).toBe('lost');
  });

  it('never calls it for a whole drive at rest past its point of no return, nor where the drive alone still gets out', () => {
    // at rest 500 m from the hole, burning away: the shove carries the ship up, the cold drive lets it fall back in
    expect(wellEscape(hole, new THREE.Vector3(10000, 0, 0), new THREE.Vector3(), away, 1, 0, true, true)).toBe('lost');
    // at rest 620 m from it, CRITICAL, burning away: the drive gets out, so the overdrive is not called
    const critical = new THREE.Vector3(12400, 0, 0);
    expect(escapeLoad(hole, critical, new THREE.Vector3(), MAIN_THRUST)).toBeGreaterThan(WELL_CRITICAL);
    expect(flownOut(12400, 0, 1, false, true)).toBe(true);
    expect(wellEscape(hole, critical, new THREE.Vector3(), away, 1, 0, true, true)).toBe('drive');
  });

  it('turns the nose first: a ship facing the hole needs longer than one facing away', () => {
    let later = 0;
    for (let distance = hole.radius * 1.05; distance < hole.radius * 3; distance += 200) {
      const at = new THREE.Vector3(distance, 0, 0);
      const velocity = new THREE.Vector3(-1000, 0, 0);
      const facingAway = wellEscape(hole, at, velocity, away, 1, 0, false, true);
      const facingIn = wellEscape(hole, at, velocity, new THREE.Vector3(-1, 0, 0), 1, 0, false, true);
      const rank = { drive: 0, overdrive: 1, lost: 2 };
      expect(rank[facingIn]).toBeGreaterThanOrEqual(rank[facingAway]);
      if (rank[facingIn] > rank[facingAway]) later++;
    }
    expect(later).toBeGreaterThan(0);
  });
});
