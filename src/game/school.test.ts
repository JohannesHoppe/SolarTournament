import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { coursesFrom, DRILL, FlightSchool, judge, ringCourse, SCHOOL_COURSES } from './school';
import { ARENA_LIMIT } from '../world/arena';
import { SCHOOL } from '../music/lines';

describe('judging a drill', () => {
  // what the judge reads of the flight school's context and the attempt, nothing more
  const judged = (drill: (typeof DRILL)[keyof typeof DRILL], ctx: object, attempt: object) => judge(drill as never, ctx as never, attempt as never, null as never);

  it('counts a hit with the last torpedo as done, not as a failure', () => {
    const lastHit = { torpedoesHit: 1, torpedoes: 0, me: { torpedoes: 0 } };
    expect(judged(DRILL.torpedo, lastHit, { count: 0 })).toBe(true);
    // both gone without a hit: once more
    expect(judged(DRILL.torpedo, { ...lastHit, torpedoesHit: 0 }, { count: 0 })).toBeTypeOf('string');
  });

  it('counts the kill whose shot overheats the laser as done', () => {
    const kill = { bot: { alive: false }, me: { overheated: true, kills: 1 } };
    expect(judged(DRILL.bursts, kill, { count: 0 })).toBe(true);
    // overheated with the bot still alive: too hot
    expect(judged(DRILL.bursts, { ...kill, bot: { alive: true } }, {})).toBeTypeOf('string');
  });

  it('counts a turn drill done for a pilot who burns to the marker, however the nose points there', () => {
    const marker = new THREE.Vector3(0, 0, -3000);
    const at = (position: THREE.Vector3) => ({ dt: 0.016, me: { flight: { position, angleTo: () => Math.PI / 2 } } });
    expect(judged(DRILL.turn, at(new THREE.Vector3(0, 0, -2600)), { points: [marker], held: 0 })).toBe(true);
    // short of it, with the nose off it: not yet
    expect(judged(DRILL.turn, at(new THREE.Vector3(0, 0, -1000)), { points: [marker], held: 0 })).toBeNull();
  });

  it('counts the fine aim drill done for a pilot who burns to its marker too', () => {
    const marker = new THREE.Vector3(0, 0, -8000);
    const at = (z: number) => ({ dt: 0.016, device: 'keyboard', me: { flight: { position: new THREE.Vector3(0, 0, z), angleTo: () => Math.PI / 2 } } });
    expect(judged(DRILL.fineAim, at(-7500), { points: [marker], held: 0 })).toBe(true);
    expect(judged(DRILL.fineAim, at(-3000), { points: [marker], held: 0 })).toBeNull();
  });

  describe('hiding from a torpedo behind a rock', () => {
    // the drone's torpedo already flies (lit); the Host started with full hull, nothing shot down yet
    const attempt = () => ({ points: [new THREE.Vector3(), new THREE.Vector3()], lit: true, reach: 100, count: 0 });
    const at = (torpedoes: number, tracked: boolean, hull = 100, torpedoesDown = 0) => ({ torpedoes, tracked, torpedoesDown, me: { hull } });

    it('passes once the torpedo loses its lock, or breaks on the rock', () => {
      expect(judged(DRILL.torpedoCover, at(1, false), attempt())).toBe(true);
      expect(judged(DRILL.torpedoCover, at(0, false), attempt())).toBe(true);
      expect(judged(DRILL.torpedoCover, at(1, true), attempt())).toBeNull();
    });

    it('starts over when the torpedo hits the hull or is shot down', () => {
      expect(judged(DRILL.torpedoCover, at(0, false, 40), attempt())).toBe(SCHOOL.torpedoCoverHit);
      expect(judged(DRILL.torpedoCover, at(0, false, 100, 1), attempt())).toBe(SCHOOL.hideInstead);
    });
  });

  it('says a torpedo got past when it is gone without a hit, and that it hit when it hit', () => {
    const attempt = { lit: true, reach: 100, count: 0 };
    expect(judged(DRILL.torpedoDown, { torpedoes: 0, torpedoesDown: 0, me: { hull: 100 } }, attempt)).toBe(SCHOOL.torpedoPast);
    expect(judged(DRILL.torpedoDown, { torpedoes: 0, torpedoesDown: 0, me: { hull: 40 } }, attempt)).toBe(SCHOOL.torpedoHit);
  });

  it('starts the flip and burn over the moment the S brake is pressed, not once the ship is at rest', () => {
    const moving = { braking: true, me: { flight: { velocity: new THREE.Vector3(0, 0, -1500) } } };
    expect(judged(DRILL.flipBurn, moving, { forward: new THREE.Vector3(0, 0, -1), usedBrake: false, brakeLetGo: true })).toBe(SCHOOL.byHand);
  });

  it('does not count a flip and burn whose first frame of the S brake already took the speed down', () => {
    const slow = { braking: true, me: { flight: { velocity: new THREE.Vector3(0, 0, -50) } } };
    const attempt = () => ({ forward: new THREE.Vector3(0, 0, -1), usedBrake: false, brakeLetGo: true });
    expect(judged(DRILL.flipBurn, slow, attempt())).toBe(SCHOOL.byHand);
    // the same speed without the brake is the drill done
    expect(judged(DRILL.flipBurn, { ...slow, braking: false }, attempt())).toBe(true);
  });

  it('fails the start drill for a drive first lit after the window, however soon the drill would count it', () => {
    const lit = { controls: { thrust: 1 }, countdown: () => {}, stall: () => {}, perfectStart: () => {}, me: {} };
    const late = { seconds: 3.5, lit: false, litAt: -Infinity, count: 0, early: false };
    expect(judged(DRILL.start, lit, late)).toBe(SCHOOL.tooLate);
    const inTime = { seconds: 3.1, lit: false, litAt: -Infinity, count: 0, early: false };
    expect(judged(DRILL.start, lit, inTime)).toBe(true);
  });

  describe('the nova drill', () => {
    const ctx = (nova: boolean, alive: boolean) => ({ me: { nova }, drone: { alive } });
    it('starts over when the core is spent and the drone lives', () => {
      expect(judged(DRILL.nova, ctx(false, true), {})).toBe(SCHOOL.again);
      expect(judged(DRILL.nova, ctx(true, true), {})).toBeNull();
    });
    it('counts the drone gone with the core', () => {
      expect(judged(DRILL.nova, ctx(false, false), {})).toBe(true);
    });
  });

  it('lays a course straight ahead, not tilted, where every tilt leaves the arena', () => {
    const position = new THREE.Vector3(0, 0, ARENA_LIMIT * 0.5);
    const orientation = new THREE.Quaternion();
    const course = [[0, 0, -ARENA_LIMIT * 3]] as const;
    const field = { overlap: () => ({}) } as never;
    const without = ringCourse(position, orientation, course);
    const stuck = ringCourse(position, orientation, course, field);
    expect(stuck[0].distanceTo(without[0])).toBeLessThan(1e-6);
  });

  describe('progress kept by the name of a drill the course no longer has', () => {
    it('goes on where the drill went on', () => {
      expect(FlightSchool.reached('tactician', 'bursts')).toBe(FlightSchool.reached('tactician', 'slideShot'));
      expect(FlightSchool.reached('tactician', 'comet')).toBe(FlightSchool.reached('tactician', 'orbit'));
      expect(FlightSchool.reached('tactician', 'orbit')).toBeTypeOf('number');
      expect(FlightSchool.reached('tactician', 'nonsense')).toBeUndefined();
    });
  });

  it('counts a sparring bot only when the pilot downed it; one that crashed on its own means once more', () => {
    const dead = (kills: number) => ({ bot: { alive: false }, me: { kills, overheated: false } });
    for (const drill of [DRILL.chase, DRILL.duel, DRILL.exam, DRILL.bursts]) {
      expect(judged(drill, dead(1), { count: 0 })).toBe(true);
      expect(judged(drill, dead(0), { count: 0 })).toBe(SCHOOL.again);
    }
  });

  it('starts the hook drill on a ship over once the runner is out of the hook’s reach', () => {
    const me = { flight: { position: new THREE.Vector3() } };
    const runner = (distance: number) => ({ hooked: false, me, bot: { alive: true, flight: { position: new THREE.Vector3(0, 0, -distance) } } });
    expect(judged(DRILL.hookShip, runner(20000), {})).toBeNull();
    expect(judged(DRILL.hookShip, runner(40000), {})).toBe(SCHOOL.again);
  });

  it('counts the impact drill done for a pilot who steered past the rock before any warning', () => {
    const rock = new THREE.Vector3(0, 0, -5000);
    const past = { dt: 1, impactAhead: false, me: { flight: { position: new THREE.Vector3(3000, 0, -6000), velocity: new THREE.Vector3(0, 0, -2000) } } };
    expect(judged(DRILL.impact, past, { points: [rock], held: 0, warned: false })).toBe(true);
  });

  it('judges the shove drill along the drift, however the nose is turned', () => {
    const rock = new THREE.Vector3(0, 0, -4000);
    const along = new THREE.Vector3(0, 0, -1);
    const at = (z: number) => ({ drone: null, me: { flight: { position: new THREE.Vector3(1500, 0, z) } } });
    expect(judged(DRILL.shove, at(-3000), { points: [rock, along], reach: 1000 })).toBeNull();
    expect(judged(DRILL.shove, at(-8000), { points: [rock, along], reach: 1000 })).toBe(SCHOOL.again);
  });

  it('sets the autopilot each drill needs, and leaves the hook’s drift alone until it bites', () => {
    for (const drill of [DRILL.turn, DRILL.drive, DRILL.brake, DRILL.fineAim, DRILL.curve, DRILL.stopAt, DRILL.impact, DRILL.freeDrift, DRILL.hook]) expect(drill.autopilot).toBe(true);
    for (const drill of [DRILL.drift, DRILL.lookBack, DRILL.flipBurn, DRILL.autopilotOn]) expect(drill.autopilot).toBe(false);
    expect(DRILL.hook.keepsDrift(null as never, { warned: false } as never)).toBe(true);
    expect(DRILL.hook.keepsDrift(null as never, { warned: true } as never)).toBe(false);
  });

  it('shows the stick wherever a drill wants the nose turned, and the drive wherever it wants the ship flown', () => {
    for (const drill of [DRILL.fineAim, DRILL.impact, DRILL.shootMoving, DRILL.shadow, DRILL.bursts, DRILL.chase, DRILL.evade, DRILL.duel, DRILL.hookShip, DRILL.nova, DRILL.cover, DRILL.torpedoCover, DRILL.exam]) {
      expect(drill.keys).toContain('turn');
    }
    for (const drill of [DRILL.hook, DRILL.hookShip, DRILL.nova, DRILL.bursts, DRILL.evade]) expect(drill.keys).toContain('drive');
    expect(DRILL.stopAt.keys).not.toContain('flip');
  });

  describe('the orbit drill', () => {
    // the pilot on a circle about the hole, a little more than a degree a frame, the readout as given
    const well = { position: new THREE.Vector3(), radius: 7000, surfaceGravity: 1 };
    const fly = (states: string[]) => {
      const attempt = { points: [new THREE.Vector3(0, 24000, 0)], swept: 0 };
      return states.map((orbit, i) => {
        const angle = ((i + 1) * 1.01 * Math.PI) / 180;
        const position = new THREE.Vector3(24000 * Math.sin(angle), 24000 * Math.cos(angle), 0);
        return judged(DRILL.orbit, { orbit, field: { well }, me: { flight: { position } } }, attempt);
      });
    };

    it('is flown at the Event Horizon, from the autopilot to free drift and back', () => {
      expect(DRILL.orbit.arena).toBe('hole');
      expect(DRILL.orbit.autopilot).toBe(true);
      expect(DRILL.orbit.keys).toEqual(expect.arrayContaining(['drive', 'turn', 'autopilot']));
    });

    it('counts half a turn about the hole in a stable orbit', () => {
      const verdicts = fly(Array(181).fill('stable'));
      expect(verdicts.indexOf(true)).toBe(178);
    });

    it('counts only while the orbit is flown: the autopilot on, or a path that falls, starts the count again', () => {
      const states = [...Array(120).fill('stable'), 'ready', ...Array(180).fill('stable')];
      expect(fly(states).indexOf(true)).toBe(120 + 1 + 178);
      expect(fly([...Array(120).fill('stable'), 'falls', ...Array(60).fill('stable')])).not.toContain(true);
    });

    it('starts over when the pilot leaves the arena', () => {
      const out = { orbit: 'leaves', field: { well }, me: { flight: { position: new THREE.Vector3(0, 70000, 0) } } };
      expect(judged(DRILL.orbit, out, { points: [new THREE.Vector3(0, 69000, 0)], swept: 0 })).toBe(SCHOOL.again);
    });
  });
});

describe('the completed courses as the browser keeps them', () => {
  it('reads back the list, nothing kept as none, and passes over a course this game does not know', () => {
    expect(coursesFrom(JSON.stringify(SCHOOL_COURSES))).toEqual(new Set(SCHOOL_COURSES));
    expect(coursesFrom(null)).toEqual(new Set());
    expect(coursesFrom(JSON.stringify(['racer', 'astronomer']))).toEqual(new Set(['racer']));
  });

  it('says when it cannot read the entry (the game takes it as no course)', () => {
    for (const text of ['nonsense', '{}', '"basic"', '[1, 2]', '["basic", null]']) expect(coursesFrom(text)).toBeNull();
  });
});
