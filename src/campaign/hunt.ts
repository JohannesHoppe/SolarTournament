import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { cos, sin } from '../detmath';
import { msg } from '../i18n/i18n';
import { Randomizer, textSeed } from '../random';
import { inGrip, WELL_CAUTION } from '../game/alarms';
import { ARENA_LIMIT } from '../world/arena';
import { arenaById, type Reference } from '../world/arenas';
import { FIELD_RADIUS, type Asteroid, type AsteroidField } from '../world/asteroids';
import { boxUv, hazardSurface, industrialSurface, surfaced } from '../view/surfaces';
import { radialTexture } from '../view/textures';
import { TAGS_PER_PLACE, tagId, type HuntPlace } from './finds';
import { MISSIONS } from './missions';

/**
 * Where the campaign's places hide their black boxes and data chips (see campaign/finds), and how
 * the game shows and gives them: laid on the place's field from its seed, each in the lee of a
 * piece (a rack, a rock, a wreck, a structure) or low over the ground (in a hollow, a crevasse),
 * else adrift in the open where a place has neither; a faint mark on the HUD within PING_RANGE,
 * taken within TAKE_RANGE.
 */

/** Within this of a find the HUD marks it and Nicole names it (units, 1.5 km). */
export const PING_RANGE = 30000;
/** Within this of a find the hull takes it (units, 60 m). */
export const TAKE_RANGE = 1200;
/** A find lies at least this clear of every piece of the field and the ground (units, 10 m). */
export const FIND_CLEAR = 200;
/** A find lies within this of the place's middle (units): inside the arena, with room to come at it from every side. */
export const FIND_REACH = ARENA_LIMIT * 0.9;
/** Finds of a place lie at least this far apart (units, 600 m), and this far from wherever its clones start (750 m: the place's own start and every job's there, see startsAt). */
const FIND_APART = 12000;
const FIND_FROM_START = 15000;
/** How far off a piece's surface a find lies in its lee (units, 10 to 30 m), and how high over the ground (15 to 60 m). */
const LEE: readonly [number, number] = [200, 600];
const OVER_GROUND: readonly [number, number] = [300, 1200];
/** Pieces larger than this (units, 1 km bounding radius) are no lee to lie in: a world's ground, a hull of the world ship's size. */
const LEE_PIECE = 20000;
/** Tries at each kind of spot before the next is tried. */
const TRIES = 120;

/** A find laid in the field: a black box (`tag`, by its id, see finds/tagId) or the place's data chip (`chip`). */
export interface Find {
  id: string;
  kind: 'tag' | 'chip';
  position: THREE.Vector3;
}

/** The id the hunt gives a place's chip. */
export const chipId = (place: HuntPlace) => `chip:${place}`;

const down = new THREE.Vector3(0, -1, 0);
const up = new THREE.Vector3(0, 1, 0);
const toward = new THREE.Vector3();

/** A random direction, even over the sphere. */
function direction(r: Randomizer, out: THREE.Vector3) {
  const z = r.range(-1, 1);
  const turn = r.range(0, 2 * Math.PI);
  const ring = Math.sqrt(1 - z * z);
  return out.set(ring * cos(turn), z, ring * sin(turn));
}

/** Whether a point is a fair spot for a find: clear of every piece, out of the well's grip, never under the ground, inside the arena, apart from the others and the start. */
export function fairSpot(field: AsteroidField, point: THREE.Vector3, others: readonly THREE.Vector3[], starts: readonly THREE.Vector3[]): boolean {
  if (point.length() > FIND_REACH || field.overlap(point, FIND_CLEAR) || field.insideWell(point, FIND_CLEAR) || inGrip(field.well, point, WELL_CAUTION)) return false;
  if (starts.some((start) => point.distanceTo(start) < FIND_FROM_START)) return false;
  if (others.some((other) => other.distanceTo(point) < FIND_APART)) return false;
  // under a world's ground looking up, the ground's underside is the first thing hit
  return !field.raycast(point, up, ARENA_LIMIT * 4)?.asteroid?.ground;
}

/** A spot in a piece's lee: from beside it, back along the line to its middle, LEE off where that meets its surface. */
function leeSpot(field: AsteroidField, r: Randomizer, piece: Asteroid): THREE.Vector3 | null {
  const away = direction(r, new THREE.Vector3());
  const from = piece.object.position.clone().addScaledVector(away, piece.radius + LEE[1] * 2);
  toward.copy(away).negate();
  const hit = field.raycast(from, toward, piece.radius * 2 + LEE[1] * 2);
  if (!hit || hit.asteroid !== piece) return null;
  return from.addScaledVector(toward, hit.distance - r.range(LEE[0], LEE[1]));
}

/** A spot low over a world's ground (in a hollow, a crevasse), straight down from above it. */
function groundSpot(field: AsteroidField, r: Randomizer, ground: Asteroid): THREE.Vector3 | null {
  const turn = r.range(0, 2 * Math.PI);
  const out = Math.sqrt(r.nextFloat()) * FIELD_RADIUS;
  const from = new THREE.Vector3(out * cos(turn), ground.object.position.y + ground.radius, out * sin(turn));
  const hit = field.raycast(from, down, ground.radius * 2);
  if (!hit) return null;
  return from.addScaledVector(down, hit.distance - r.range(OVER_GROUND[0], OVER_GROUND[1]));
}

/** A spot adrift in the open, about the height clones start at. */
function openSpot(r: Randomizer, height: number): THREE.Vector3 {
  const turn = r.range(0, 2 * Math.PI);
  const out = Math.sqrt(r.nextFloat()) * FIELD_RADIUS;
  return new THREE.Vector3(out * cos(turn), height + r.range(-0.3, 0.3) * FIELD_RADIUS, out * sin(turn));
}

/** Where a place's clones start: the place's own start and that of every job begun there (a pad, a race's grid, a lane), so no find lies where a job puts the hull. */
export function startsAt(place: HuntPlace): THREE.Vector3[] {
  const starts = [arenaById(place)?.start, ...MISSIONS.filter((mission) => mission.drills[0]?.arena === place).map((mission) => mission.start)];
  return starts.flatMap((start) => (start ? [new THREE.Vector3(...start.at)] : []));
}

/**
 * Where a place hides its finds on its field as laid out (its pieces where they first lie): its
 * black boxes and its chip, the same on every visit, each tried in a piece's lee, then over the
 * ground, then in the open, until a fair spot (see fairSpot) is found.
 */
export function layFinds(field: AsteroidField, place: HuntPlace): Find[] {
  const r = new Randomizer(textSeed(`finds:${place}`));
  const start = arenaById(place)?.start;
  const from = start ? new THREE.Vector3(...start.at) : null;
  const starts = startsAt(place);
  const pieces = [...field.asteroids.values()];
  const lee = pieces.filter((piece) => !piece.ground && piece.radius < LEE_PIECE);
  const grounds = pieces.filter((piece) => piece.ground);
  const ids = [...Array.from({ length: TAGS_PER_PLACE }, (_, index) => tagId(place, index)), chipId(place)];
  const laid: THREE.Vector3[] = [];
  return ids.map((id, k) => {
    const kinds: (() => THREE.Vector3 | null)[] = [];
    // a place with both: a find in the lee of a piece, the next over the ground, by turns
    if (lee.length) kinds.push(() => leeSpot(field, r, lee[Math.floor(r.nextFloat() * lee.length)]));
    if (grounds.length) kinds.splice(k % 2, 0, () => groundSpot(field, r, grounds[Math.floor(r.nextFloat() * grounds.length)]));
    kinds.push(() => openSpot(r, from?.y ?? 0));
    let spot: THREE.Vector3 | null = null;
    for (const kind of kinds) {
      for (let attempt = 0; !spot && attempt < TRIES; attempt++) {
        const candidate = kind();
        if (candidate && fairSpot(field, candidate, laid, starts)) spot = candidate;
      }
      if (spot) break;
    }
    // the open always has room in the end
    spot ??= openSpot(r, from?.y ?? 0);
    laid.push(spot);
    return { id, kind: k < TAGS_PER_PLACE ? 'tag' : 'chip', position: spot };
  });
}

/** A black box as the Games' hulls carry them: a recorder case in worn hazard paint (units: 1.4 m long), a handle, a beacon on top. */
const BOX = { length: 28, width: 18, height: 16 };
/** A data chip in its casing (units: 0.8 m by 0.5 m), with a strip of light along its edge. */
const CHIP = { length: 16, width: 10, height: 3 };
/** The beacon's glint (units, its sprite's size), seen from afar, and how fast it blinks (Hz). */
const GLINT = 100;
const BLINK = 0.8;

let built: { box: THREE.Object3D; chip: THREE.Object3D; tagGlint: THREE.SpriteMaterial; chipGlint: THREE.SpriteMaterial } | null = null;

const part = (w: number, h: number, d: number, x: number, y: number, z: number) => new THREE.BoxGeometry(w, h, d).translate(x, y, z).toNonIndexed();

/** The models of a black box and a data chip, built once. */
function models() {
  if (built) return built;
  const glint = (color: string) =>
    new THREE.SpriteMaterial({ map: radialTexture([[0, '#ffffff'], [0.12, color], [0.4, 'rgba(0,0,0,0.25)'], [1, 'rgba(0,0,0,0)']]), blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, transparent: true });
  const tagGlint = glint('#ff9d00');
  const chipGlint = glint('#4d91ff');
  const steel = new THREE.MeshStandardMaterial({ ...surfaced(industrialSurface(7731), 0.6), color: 0x6a6d70 });
  // the case in hazard paint, dented and sooted; the handle and the bolted lid in bare steel
  const box = new THREE.Group();
  box.add(new THREE.Mesh(boxUv(part(BOX.length, BOX.height, BOX.width, 0, 0, 0), 20), new THREE.MeshStandardMaterial({ ...surfaced(hazardSurface(), 0.5), color: 0xcfcfcf })));
  box.add(new THREE.Mesh(mergeGeometries([part(BOX.length + 2, 2, BOX.width + 2, 0, BOX.height / 2, 0), part(2, 5, 2, -8, BOX.height / 2 + 3, 0), part(2, 5, 2, 8, BOX.height / 2 + 3, 0), part(18, 2, 2, 0, BOX.height / 2 + 5.5, 0)].map((piece) => boxUv(piece, 20))), steel));
  const lamp = new THREE.Mesh(new THREE.SphereGeometry(1.6, 8, 6).translate(BOX.length / 2 - 4, BOX.height / 2 + 2, 0), new THREE.MeshBasicMaterial({ color: new THREE.Color(1, 0.55, 0.1).multiplyScalar(2), toneMapped: false }));
  box.add(lamp);
  // the chip's casing in grimy steel, its contacts and its strip of light in the HUD's azure
  const chip = new THREE.Group();
  chip.add(new THREE.Mesh(boxUv(part(CHIP.length, CHIP.height, CHIP.width, 0, 0, 0), 12), steel));
  chip.add(new THREE.Mesh(part(CHIP.length - 2, 0.4, 1, 0, CHIP.height / 2, CHIP.width / 2 - 1), new THREE.MeshBasicMaterial({ color: new THREE.Color(0.3, 0.57, 1).multiplyScalar(2), toneMapped: false })));
  chip.add(new THREE.Mesh(part(4, CHIP.height * 0.6, CHIP.width * 0.8, -CHIP.length / 2 - 1.5, 0, 0), new THREE.MeshStandardMaterial({ color: 0xb08a40, metalness: 0.9, roughness: 0.4 })));
  built = { box, chip, tagGlint, chipGlint };
  return built;
}

/** The HUD's marks of the finds: their labels, marked for translation. */
const LABELS = { tag: msg('Black box'), chip: msg('Data chip') } as const;

/**
 * The finds of the place flown at in the scene: laid once per place (the field as first laid
 * out there), shown while not found, marked on the HUD within PING_RANGE (see `references`).
 */
export class Hunt {
  readonly group = new THREE.Group();
  /** The HUD's marks of the finds within PING_RANGE not found yet, as this frame left them (see Hud.setReferences). */
  readonly references: Reference[] = [];
  private place: HuntPlace | null = null;
  private finds: Find[] = [];
  private readonly laid = new Map<HuntPlace, Find[]>();
  private readonly shown = new Map<string, THREE.Object3D>();
  private readonly marks = new Map<string, Reference>();

  /** The finds of the place laid now. */
  get here(): readonly Find[] {
    return this.finds;
  }

  /**
   * One frame at `place` (null: no place hides anything here now, in a scene in person or out of
   * the campaign): lays and shows its finds when the place changes, hides those `found`, blinks
   * the beacons, marks those within PING_RANGE of `at` (the own clone, null while none lives)
   * and returns the nearest of them not found and the one within TAKE_RANGE, if any.
   */
  update(place: HuntPlace | null, field: AsteroidField, found: (id: string) => boolean, at: THREE.Vector3 | null, now: number): { near: Find | null; take: Find | null } {
    if (place !== this.place) this.enter(place, field);
    this.references.length = 0;
    const glints = models();
    const pulse = 0.35 + 0.65 * Math.max(0, sin(now * BLINK * 2 * Math.PI));
    glints.tagGlint.opacity = pulse;
    glints.chipGlint.opacity = 0.6 + 0.4 * pulse;
    let near: Find | null = null;
    let nearest = PING_RANGE;
    let take: Find | null = null;
    for (const find of this.finds) {
      const gone = found(find.id);
      this.shown.get(find.id)!.visible = !gone;
      if (gone || !at) continue;
      const distance = at.distanceTo(find.position);
      if (distance > PING_RANGE) continue;
      this.references.push(this.marks.get(find.id)!);
      if (distance < nearest) {
        nearest = distance;
        near = find;
      }
      if (distance < TAKE_RANGE) take = find;
    }
    return { near, take };
  }

  /** Takes the finds out of the scene and the HUD (back in the menu). */
  leave() {
    this.enter(null, null);
    this.references.length = 0;
  }

  /** Lays the finds of a place (once per place) and puts them in the scene in place of the last place's. */
  private enter(place: HuntPlace | null, field: AsteroidField | null) {
    this.place = place;
    this.group.clear();
    this.shown.clear();
    this.marks.clear();
    this.finds = place && field ? (this.laid.get(place) ?? this.laid.set(place, layFinds(field, place)).get(place)!) : [];
    const { box, chip, tagGlint, chipGlint } = models();
    for (const find of this.finds) {
      const object = (find.kind === 'tag' ? box : chip).clone();
      const glint = new THREE.Sprite(find.kind === 'tag' ? tagGlint : chipGlint);
      glint.scale.setScalar(find.kind === 'tag' ? GLINT : GLINT * 0.6);
      glint.position.set(0, find.kind === 'tag' ? BOX.height : CHIP.height * 2, 0);
      object.add(glint);
      object.position.copy(find.position);
      // each lies as it came to rest, turned any way (from its id)
      const r = new Randomizer(textSeed(find.id));
      object.quaternion.setFromRotationMatrix(new THREE.Matrix4().lookAt(new THREE.Vector3(), direction(r, new THREE.Vector3()), up));
      this.group.add(object);
      this.shown.set(find.id, object);
      this.marks.set(find.id, { glyph: 'find', label: LABELS[find.kind], position: find.position, distance: true });
    }
  }
}
