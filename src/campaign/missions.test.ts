import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { RACE_SPEED } from '../ship/bots';
import { RacingLine } from '../game/racingline';
import { type Attempt, clearOfRock, PIPE_BORE, type SchoolContext } from '../game/school';
import { arenaById } from '../world/arenas';
import { DETAIL } from '../world/rocks';
import { testField } from '../test/field';
import { flyRings } from '../test/pilot';
import { MISSIONS, PEAK_COURSE, PEAK_LAPS, PEAK_RINGS } from './missions';

/** A middling bot: what a Host is asked to fly, it must manage (see CLAUDE.md, Plausibility). */
const SKILL = 0.5;
/** The Peak Run's laps are flown within this many seconds by a middling bot (its rivals fly at skill 0.2). */
const PEAK_SECONDS = 240;

describe('the Peak Run on Rheasilvia', () => {
  it('is flown by a middling bot: both laps through the bore of every pipe round the claims, nothing missed, without a crash', () => {
    const field = testField(DETAIL);
    field.generate(arenaById('rheasilvia')!.layout);
    // the pipes laid clear of rock, as the game lays them, facing along the loop
    const rings = PEAK_COURSE.map((pipe) => clearOfRock(field, pipe.clone(), PIPE_BORE * 2));
    const facings = rings.map((_, i) => rings[(i + 1) % PEAK_RINGS].clone().sub(rings[(i + PEAK_RINGS - 1) % PEAK_RINGS]).normalize());
    // both laps as one course: the same pipes twice over, the closed loop's line through them
    const points = Array.from({ length: PEAK_RINGS * PEAK_LAPS }, (_, i) => rings[i % PEAK_RINGS]);
    const normals = Array.from({ length: PEAK_RINGS * PEAK_LAPS }, (_, i) => facings[i % PEAK_RINGS]);
    const line = new RacingLine(rings, true);
    // from the place's start, where the clone is printed
    const start = new THREE.Vector3(...arenaById('rheasilvia')!.start!.at);
    const flight = flyRings(field, { points, normals, radius: PIPE_BORE, core: 0, line, open: false }, start, rings[0].clone().sub(start).normalize(), SKILL, RACE_SPEED, PEAK_SECONDS);
    expect(flight.passed, `${flight.passed} of ${points.length} in ${flight.seconds.toFixed(0)} s`).toBe(points.length);
    expect(flight.missed).toBe(0);
  });
});

describe('the Saw Brothers’ music', () => {
  it('stays the claim’s calm while the brothers saw undisturbed and turns to the fight once the pilot comes near or one is down', () => {
    const drill = MISSIONS.find((mission) => mission.id === 'sawBrothers')!.drills.find((d) => d.turn)!;
    const site = new THREE.Vector3(1000, 0, 0);
    const at = (x: number, jumpersDown = 0) => drill.turn!({ me: { flight: { position: new THREE.Vector3(x, 0, 0) } }, jumpersDown } as unknown as SchoolContext, { site } as Attempt);
    expect(at(1000 + 30000)).toBeUndefined();
    expect(at(1000 + 20000)).toBe('fight');
    expect(at(1000 + 30000, 1)).toBe('fight');
  });
});
