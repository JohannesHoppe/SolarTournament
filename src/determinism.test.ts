import { createHash } from 'node:crypto';
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { testField } from './test/field';
import { DISTANT_DETAIL } from './world/rocks';
import { HULL_BOXES } from './world/shapes';
import { FIGHT_WORLDS, RACE_ARENAS, TOURNAMENT_ARENAS } from './world/arenas';
import { FieldContacts } from './world/contacts';
import { Randomizer } from './random';
import { cometEnd, cometStart, headAt, roundComets, runDown } from './game/comet';
import { Course } from './game/race';
import { Probes } from './game/items';
import { FlightModel } from './ship/flight';
import { IDLE } from './input/input';

/**
 * The shared world, bit for bit the same on every processor and system: every browser of a
 * tournament computes it itself. A minute and a half of every arena's field (a rock broken every
 * fifteen seconds, the round's comets running down what stands in their way, the pieces meeting
 * each other), its race course and racing line, the round's probes, and a ship flown by the flight
 * model, hashed to the last bit. The workflow CI runs it on x64 and ARM, Linux and macOS: a pinned
 * hash that comes out differently on one of them means something computes with a function that
 * differs between machines (see src/detmath.ts).
 */
const SECONDS = 90;
const FRAME = 1 / 30;

function digest(values: number[]): string {
  return createHash('sha256').update(new Uint8Array(Float64Array.from(values).buffer)).digest('hex').slice(0, 16);
}

function arenaWorld(index: number): string {
  const arena = TOURNAMENT_ARENAS[index];
  const field = testField(DISTANT_DETAIL, HULL_BOXES);
  field.generate(arena.layout);
  const values: number[] = [];
  // a world fought over sees no race and no comet
  const fought = FIGHT_WORLDS.includes(arena);

  // the course and its racing line as a race starts, in the arenas a race is flown in
  const course = RACE_ARENAS.includes(arena) ? new Course(field, arena.layout.seed) : null;
  const v = new THREE.Vector3();
  if (course) for (const p of course.points) values.push(p.x, p.y, p.z);
  if (course) for (let s = 0; s < course.line.length; s += 250) values.push(...course.line.clear(s, field, v).toArray());

  // the field played on: breaks, comets, contacts
  const contacts = new FieldContacts();
  const comets = roundComets(arena.layout.seed, 1, field.well, fought);
  const r = new Randomizer(arena.layout.seed + 1);
  let nextBreak = 7.5;
  while (field.clock < SECONDS) {
    field.update(Math.min(FRAME, SECONDS - field.clock));
    while (nextBreak <= field.clock) {
      const ids = [...field.asteroids.values()].filter((a) => !a.solid).map((a) => a.id).sort();
      const pick = r.nextInt();
      if (ids.length) field.shatter(ids[pick % ids.length], nextBreak);
      nextBreak += 15;
    }
    for (const comet of comets) if (field.clock >= cometStart(comet) && field.clock <= cometEnd(comet)) runDown(comet, field, field.clock, () => {});
    contacts.run(field);
    field.crumble();
  }
  const pieces = [...field.asteroids.values()].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  for (const a of pieces) values.push(...a.object.position.toArray(), ...a.velocity.toArray(), ...a.object.quaternion.toArray());
  for (const comet of comets) for (let t = cometStart(comet); t < cometEnd(comet); t += 5) values.push(...headAt(comet, t, v).toArray());
  // the racing line around the rock as it lies now
  if (course) for (let s = 0; s < course.line.length; s += 500) values.push(...course.line.clear(s, field, v).toArray());

  // the round's probes
  const probes = new Probes();
  probes.schedule(arena.layout.seed, 1, SECONDS, SECONDS, field, course?.points);
  for (const probe of probes.list) values.push(...probe.position.toArray(), ...probe.velocity.toArray());
  return digest(values);
}

/** A ship flown for half a minute with every control, through turns, rolls and burns. */
function flown(): string {
  const flight = new FlightModel();
  flight.reset(new THREE.Vector3(100, -50, 2000), new THREE.Quaternion(0.1, 0.7, -0.2, 0.6).normalize());
  const gravity = new THREE.Vector3(0, -3, 1);
  const values: number[] = [];
  for (let i = 0; i < 30 * 60; i++) {
    const t = i / 60;
    flight.update(1 / 60, { ...IDLE, yaw: t % 7 < 3 ? 1 : -0.4, pitch: t % 5 < 2 ? -0.6 : 0.8, roll: t % 11 < 4 ? 1 : 0, thrust: t % 4 < 3 ? 1 : 0, strafeX: t % 3 < 1 ? 1 : 0 }, gravity);
    if (i % 60 === 0) values.push(...flight.position.toArray(), ...flight.velocity.toArray(), ...flight.orientation.toArray(), ...flight.angularVelocity.toArray());
  }
  return digest(values);
}

describe('the shared world on every machine', () => {
  it('plays every arena to the pinned bits', { timeout: 120_000 }, () => {
    const hashes: Record<string, string> = {};
    for (let i = 0; i < TOURNAMENT_ARENAS.length; i++) hashes[TOURNAMENT_ARENAS[i].id] = arenaWorld(i);
    expect(hashes).toEqual({
      belt: '40641f7c24de47ec',
      rings: '1f7aaab5d183ef76',
      junkyard: '8cddd98d885b7876',
      giant: '9e1736d8b837a9e7',
      corona: '779cc8b302ddc5a9',
      hole: 'ce4777de180ea143',
      derelict: 'd51dc8297fd357f6',
      crack: '12c20ea39716a1e4',
      throat: '537aa54f0e3f1e19',
      valhalla: 'ccfdfa724f2e5966',
      lineae: '8ceda99699816829',
    });
  });

  it('flies a ship to the pinned bits', () => {
    expect(flown()).toBe('36652332d754215f');
  });
});
