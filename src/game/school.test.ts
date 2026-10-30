import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { coursesFrom, DRILL, judge, SCHOOL_COURSES } from './school';

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
    const kill = { bot: { alive: false }, me: { overheated: true } };
    expect(judged(DRILL.bursts, kill, {})).toBe(true);
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
