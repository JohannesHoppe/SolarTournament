import { describe, expect, it } from 'vitest';
import { coursesFrom, SCHOOL_COURSES } from './school';

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
