import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { ARENA_LIMIT } from '../world/arena';
import { arenaById } from '../world/arenas';
import { DETAIL } from '../world/rocks';
import { testField } from '../test/field';
import { TITLE_FIRST, TITLE_SECOND } from '../music/lines';
import { MISSIONS } from './campaign';
import { firstJobAt, freeFlight } from './missions';
import { chipsFound, CHIPS, HUNT_PLACES, TAG_IDS, tagOf, TAGS, TAGS_PER_PLACE } from './finds';
import { FIND_CLEAR, FIND_REACH, layFinds } from './hunt';
import { inGrip, WELL_CAUTION } from '../game/alarms';

const up = new THREE.Vector3(0, 1, 0);

describe('what the campaign’s places hide', () => {
  it('hides it at every arena the story’s jobs fly in, in the order the story reaches them, side trips last', () => {
    const story = MISSIONS.filter((mission) => !mission.courier && !mission.ambush && !mission.mining);
    const flown = (missions: typeof story) => [...new Set(missions.flatMap((mission) => mission.drills.map((drill) => drill.arena).filter((arena) => arena !== undefined)))];
    expect(HUNT_PLACES).toEqual([...flown(story.filter((mission) => !mission.side)), ...flown(story.filter((mission) => mission.side)).filter((arena) => !flown(story.filter((mission) => !mission.side)).includes(arena))]);
    for (const place of HUNT_PLACES) expect(firstJobAt(place), place).not.toBeNull();
  });

  it('gives every place three black boxes of different people and a chip of its own, its title the station’s words', () => {
    for (const place of HUNT_PLACES) expect(TAGS[place]).toHaveLength(TAGS_PER_PLACE);
    const names = HUNT_PLACES.flatMap((place) => TAGS[place].map((tag) => tag.name));
    expect(new Set(names).size).toBe(names.length);
    expect(TAG_IDS).toHaveLength(HUNT_PLACES.length * TAGS_PER_PLACE);
    for (const id of TAG_IDS) expect(tagOf(id)).not.toBeNull();
    expect(tagOf('boneyard:3')).toBeNull();
    const titles = HUNT_PLACES.map((place) => CHIPS[place]);
    expect(new Set(titles).size).toBe(titles.length);
    for (const title of titles) {
      const [first, second, ...rest] = title.toLowerCase().split(' ');
      expect(rest, title).toEqual([]);
      expect(TITLE_FIRST, title).toContain(first);
      expect(TITLE_SECOND, title).toContain(second);
    }
    // the radio page reads the chips found from the campaign's entry, in the story's order
    expect(chipsFound(JSON.stringify({ chips: ['io', 'boneyard', 'belt'] }))).toEqual([CHIPS.boneyard, CHIPS.io]);
    expect(chipsFound('{oops')).toEqual([]);
    expect(chipsFound(null)).toEqual([]);
  });

  it('lays every find inside its arena, clear of rock and ground, never under it, out of a well’s grip, apart from the others and the same on every visit', () => {
    for (const place of HUNT_PLACES) {
      const field = testField(DETAIL);
      field.generate(arenaById(place)!.layout);
      const finds = layFinds(field, place);
      expect(finds.map((find) => find.kind)).toEqual(['tag', 'tag', 'tag', 'chip']);
      const start = arenaById(place)!.start;
      for (const find of finds) {
        const at = `${place} ${find.id} at ${find.position.toArray().map(Math.round).join(', ')}`;
        expect(find.position.length(), at).toBeLessThan(Math.min(FIND_REACH, ARENA_LIMIT));
        expect(field.overlap(find.position, FIND_CLEAR), at).toBeNull();
        expect(field.raycast(find.position, up, ARENA_LIMIT * 4)?.asteroid?.ground ?? false, at).toBe(false);
        expect(inGrip(field.well, find.position, WELL_CAUTION), at).toBe(false);
        if (start) expect(find.position.distanceTo(new THREE.Vector3(...start.at)), at).toBeGreaterThan(10000);
        for (const other of finds) if (other !== find) expect(other.position.distanceTo(find.position), at).toBeGreaterThan(10000);
      }
      const again = testField(DETAIL);
      again.generate(arenaById(place)!.layout);
      expect(layFinds(again, place).map((find) => find.position.toArray())).toEqual(finds.map((find) => find.position.toArray()));
    }
  });

  it('flies a place freely: a drill that never ends nor fails, paying nothing', () => {
    const flight = freeFlight('boneyard');
    expect(flight.open).toBe(true);
    expect(flight.pay).toBe(0);
    expect(flight.drills).toHaveLength(1);
    expect(flight.drills[0].arena).toBe('boneyard');
    expect(flight.drills[0].fail).toBeUndefined();
    expect(flight.drills[0].done(null as never, null as never, null as never)).toBe(false);
  });
});
