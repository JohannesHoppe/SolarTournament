import * as THREE from 'three';
import { Randomizer } from '../random';
import { hash } from '../music/songs';
import { radialTexture } from '../view/textures';
import { ARENA_LIMIT } from '../world/arena';
import type { Asteroid, AsteroidField, Well } from '../world/asteroids';

/**
 * Comets: now and then a comet crosses the arena, its glowing head first, a swarm of small
 * rocks of ice and dust (its shower) after it. The head keeps its route, bent only by the
 * arena's massive body, and clears whatever stands in its way: rock breaks, the wreck's hull
 * is shoved aside, ships are run down. The shower is the real danger, a storm of pieces that
 * strike a ship like lasers: the armor shrugs them off, the drive does not. A black hole or a
 * gas giant's clouds swallow a comet, its shower after it.
 *
 * Everything about a comet follows from the room's seed, the round and the field time, which
 * every browser shares: when it comes, from where, how gravity bends it, where each piece of
 * its shower flies. So every browser sees the same comet without a word sent.
 */

/** A round sees a comet in each of these windows of field time (s) with its chance: a first one after the opening minute, a second one late. */
export const COMET_WINDOWS: readonly { from: number; to: number; chance: number }[] = [
  { from: 75, to: 135, chance: 0.75 },
  { from: 175, to: 235, chance: 0.4 },
];
/** The head flies this fast (units/s, 150 m/s) where it passes the field's center; a well's gravity changes that elsewhere. */
export const COMET_SPEED = 3000;
/** The head starts this far before the point of its route nearest the field's center (units, 4.4 km), beyond the arena's edge, and flies as far beyond it. */
export const COMET_REACH = 88000;
/** The route passes the field's center within this much (units, 800 m), so it crosses the thick of the field. */
const COMET_MISS = 16000;
/** The route lies within this angle (rad, 35°) of the arena's horizon plane, where the field is. */
const COMET_TILT = 0.6;
/** A massive body in the field's middle (the black hole) is aimed at: the route passes it within this many of its radii, close enough to be caught. */
const CAPTURE = 2;
/** Towards a massive body outside the field (the gas giant) the route dives at an angle of this range (rad, 26° to 43°) as it crosses the center: steep enough that it comes from above its clouds, so the body's pull bends it down into them. */
const DIVE: readonly [number, number] = [0.45, 0.75];
/** Radius of the solid head (units, 70 m). */
export const HEAD_RADIUS = 1400;
/** The flight computer warns this many seconds before the head reaches the arena's edge. */
export const COMET_WARNING = 12;
/**
 * The shower: SHOWER_PIECES pieces from SHOWER_GAP (units, 60 m) behind the head back to
 * SHOWER_LENGTH (1.8 km) behind it, the swarm widening from SHOWER_NARROW (60 m) to SHOWER_WIDE
 * (260 m) around the route, denser near the head. Each piece follows the head's route a little
 * later, so the swarm bends with it.
 */
export const SHOWER_PIECES = 600;
const SHOWER_GAP = 1200;
export const SHOWER_LENGTH = 36000;
const SHOWER_NARROW = 1200;
export const SHOWER_WIDE = 5200;
/** Radius of a piece (units, 3 m): a ship within its own radius plus this is struck. */
export const PIECE_RADIUS = 60;
/** The route is kept as the head's position every PATH_STEP seconds of field time, flown in SUBSTEPS steps each. */
const PATH_STEP = 0.1;
const SUBSTEPS = 10;
/** Rounds of raising the aim against the pull of a well outside the field (see makeComet). */
const AIMING = 5;
/** Over the last SQUEEZE seconds before a piece reaches the well, the swarm draws together onto the head's route. */
const SQUEEZE = 3;
/** Over the last STRETCH seconds before the well swallows it, the head is drawn out along its course; FLASH seconds of light mark where it went. */
const STRETCH = 2;
const FLASH = 1.5;
/** A solid piece the head strikes (the wreck's hull) drifts on SHOVE (units/s, 5 m/s) faster along the comet's course and turns at up to SHOVE_SPIN (rad/s). */
const SHOVE = 100;
const SHOVE_SPIN = 0.12;

/** One comet of a round: when and where it passes nearest the field's center, its route as gravity bends it, and the seed of its shower. */
export interface Comet {
  /** Field time at which the head passes the point of its route nearest the field's center. */
  readonly at: number;
  /** The direction it flies there (unit length). */
  readonly direction: THREE.Vector3;
  /** The point of its route nearest the field's center. */
  readonly nearest: THREE.Vector3;
  readonly seed: number;
  /** The head's position (x, y, z) every PATH_STEP seconds of field time from `from` on. */
  readonly path: Float64Array;
  readonly from: number;
  /** Field time at which the head starts out, COMET_REACH from the field's center. */
  readonly start: number;
  /** Field time at which the head reaches the arena's edge. */
  readonly edge: number;
  /** Field time at which a well swallows the head; Infinity when it meets none. */
  readonly swallowed: number;
}

/** Field time at which a comet's head starts out. */
export const cometStart = (comet: Comet) => comet.start;
/** Field time at which the last of its shower has flown COMET_REACH past its nearest point, or has followed the head into the well. */
export const cometEnd = (comet: Comet) => Math.min(comet.at + (COMET_REACH + SHOWER_LENGTH) / COMET_SPEED, comet.swallowed + SHOWER_LENGTH / COMET_SPEED + FLASH);

const pull = new THREE.Vector3();
const position = new THREE.Vector3();
const velocity = new THREE.Vector3();

/** A well's pull at a point (units/s²), as the field's gravity has it. */
function wellPull(well: Well | null, point: THREE.Vector3, target: THREE.Vector3) {
  if (!well) return target.set(0, 0, 0);
  target.subVectors(well.position, point);
  const distance = Math.max(target.length(), well.radius);
  return target.setLength((well.surfaceGravity * well.radius * well.radius) / (distance * distance));
}

/**
 * Flies the head through the samples of `path`, from `position` at COMET_SPEED along
 * `direction`, in the well's gravity (leapfrog); returns the index of the first sample inside
 * the well, or -1.
 */
function fly(path: Float64Array, direction: THREE.Vector3, well: Well | null): number {
  const h = PATH_STEP / SUBSTEPS;
  velocity.copy(direction).multiplyScalar(COMET_SPEED);
  position.toArray(path, 0);
  for (let i = 1; i < path.length / 3; i++) {
    for (let s = 0; s < SUBSTEPS; s++) {
      velocity.addScaledVector(wellPull(well, position, pull), h / 2);
      position.addScaledVector(velocity, h);
      velocity.addScaledVector(wellPull(well, position, pull), h / 2);
    }
    position.toArray(path, i * 3);
    if (well && position.distanceTo(well.position) < well.radius) return i;
  }
  return -1;
}

/** The sample of `path` nearest `point`, up to sample `end` (all of them when it is -1). */
function nearestSample(path: Float64Array, point: THREE.Vector3, end: number): number {
  let best = 0;
  let distance = Infinity;
  for (let i = 0; i <= (end < 0 ? path.length / 3 - 1 : end); i++) {
    const d = position.fromArray(path, i * 3).distanceToSquared(point);
    if (d < distance) {
      distance = d;
      best = i;
    }
  }
  return best;
}

/**
 * A comet passing `nearest` about field time `at` in `direction` at COMET_SPEED, seeded
 * `seed`, with its route through the well's gravity, flown from far off: aimed straight at it,
 * a well in the field draws it in; for a well outside the field, the aim is raised against its
 * pull (AIMING rounds, each by what the last one missed `nearest` by), so it still crosses the
 * field at `nearest`. A well swallows the head where it reaches its body; the route stands
 * still there.
 */
export function makeComet(at: number, direction: THREE.Vector3, nearest: THREE.Vector3, seed: number, well: Well | null = null): Comet {
  const from = at - (COMET_REACH + SHOWER_LENGTH) / COMET_SPEED;
  const count = Math.ceil((COMET_REACH * 2 + SHOWER_LENGTH) / COMET_SPEED / PATH_STEP) + 2;
  const path = new Float64Array(count * 3);
  const aim = nearest.clone();
  let inside = -1;
  for (let round = well && well.position.length() >= ARENA_LIMIT ? AIMING : 1; round > 0; round--) {
    position.copy(aim).addScaledVector(direction, (from - at) * COMET_SPEED);
    inside = fly(path, direction, well);
    if (round > 1) aim.add(nearest).sub(position.fromArray(path, nearestSample(path, nearest, inside) * 3));
  }
  if (inside >= 0) for (let i = inside + 1; i < count; i++) path.copyWithin(i * 3, inside * 3, inside * 3 + 3);
  // it starts out the last time it is COMET_REACH from the center before its nearest point
  let start = Math.round((at - from) / PATH_STEP);
  while (start > 0 && position.fromArray(path, start * 3).length() < COMET_REACH) start--;
  let edge = start;
  while (edge < count - 1 && position.fromArray(path, edge * 3).length() > ARENA_LIMIT) edge++;
  return {
    at,
    direction,
    nearest,
    seed,
    path,
    from,
    start: Math.max(from + start * PATH_STEP, from + SHOWER_LENGTH / COMET_SPEED),
    edge: from + edge * PATH_STEP,
    swallowed: inside >= 0 ? from + inside * PATH_STEP : Infinity,
  };
}

/**
 * The comets of round `round` of a room (or solo round) of `seed`: in each window, with its
 * chance, one; it arrives at the arena's edge about a time of the window, from a direction
 * close to the horizon plane, passing the center within COMET_MISS. A massive body in the
 * field draws it in; one beneath the field it dives towards.
 */
export function cometsOf(seed: number, round: number, well: Well | null = null): Comet[] {
  const comets: Comet[] = [];
  COMET_WINDOWS.forEach((window, n) => {
    const r = new Randomizer((hash(seed, round, 4049, n) % 2147483000) + 1);
    if (r.nextFloat() >= window.chance) return;
    const edge = r.range(window.from, window.to);
    const heading = r.range(0, Math.PI * 2);
    const tilt = r.range(-COMET_TILT, COMET_TILT);
    const direction = new THREE.Vector3(Math.cos(heading) * Math.cos(tilt), Math.sin(tilt), Math.sin(heading) * Math.cos(tilt));
    const dive = r.range(DIVE[0], DIVE[1]);
    // a miss square to the course: around the course by an angle, out by a distance
    const across = new THREE.Vector3(0, 1, 0).cross(direction).normalize();
    const up = new THREE.Vector3().crossVectors(direction, across);
    const turn = r.range(0, Math.PI * 2);
    const miss = r.range(0, 1);
    const nearest = new THREE.Vector3();
    if (well && well.position.length() < ARENA_LIMIT) {
      // a body in the field: aimed close by it, where its pull catches the head
      nearest.copy(across).multiplyScalar(Math.cos(turn)).addScaledVector(up, Math.sin(turn)).multiplyScalar(miss * well.radius * CAPTURE).add(well.position);
    } else {
      nearest.copy(across).multiplyScalar(Math.cos(turn) * miss * COMET_MISS).addScaledVector(up, Math.sin(turn) * miss * COMET_MISS);
      if (well) {
        // a body beneath the field: the course turned down towards it by the dive
        const down = pull.subVectors(well.position, nearest).normalize();
        direction.addScaledVector(down, -direction.dot(down)).normalize().multiplyScalar(Math.cos(dive)).addScaledVector(down, Math.sin(dive));
      }
    }
    // the head reaches the arena's edge (as far before the nearest point as the field's edge) about `edge`
    comets.push(makeComet(edge + ARENA_LIMIT / COMET_SPEED, direction, nearest, r.nextInt(), well));
  });
  return comets;
}

const sample = new THREE.Vector3();

/** Where a comet's head is at a field time: on its route, beyond its ends straight on. */
export function headAt(comet: Comet, time: number, target: THREE.Vector3): THREE.Vector3 {
  const last = comet.path.length / 3 - 1;
  const s = (time - comet.from) / PATH_STEP;
  const i = Math.min(Math.max(Math.floor(s), 0), last - 1);
  target.fromArray(comet.path, i * 3);
  return target.lerp(sample.fromArray(comet.path, i * 3 + 3), s - i);
}

/** The direction a comet's head flies at a field time (unit length), up to the moment a well swallows it. */
export function courseAt(comet: Comet, time: number, target: THREE.Vector3): THREE.Vector3 {
  const s = Math.min(time, comet.swallowed - PATH_STEP);
  headAt(comet, s, target);
  target.subVectors(headAt(comet, s + PATH_STEP, sample), target);
  return target.lengthSq() > 1e-6 ? target.normalize() : target.copy(comet.direction);
}

const start = new THREE.Vector3();
const segment = new THREE.Vector3();
const toPoint = new THREE.Vector3();

/**
 * The point of a comet's route between field times `from` and `to` (and before the well
 * swallows it) nearest `point`, into `target`; returns the field time the head is there.
 */
export function routeNearest(comet: Comet, point: THREE.Vector3, from: number, to: number, target: THREE.Vector3): number {
  to = Math.min(to, comet.swallowed);
  let best = Infinity;
  let when = from;
  headAt(comet, from, start);
  target.copy(start);
  for (let time = from; time < to; ) {
    const next = Math.min(to, time + PATH_STEP * 5);
    segment.subVectors(headAt(comet, next, sample), start);
    const length = segment.lengthSq();
    const f = length > 0 ? Math.min(1, Math.max(0, toPoint.subVectors(point, start).dot(segment) / length)) : 0;
    toPoint.copy(start).addScaledVector(segment, f);
    const distance = toPoint.distanceToSquared(point);
    if (distance < best) {
      best = distance;
      when = time + (next - time) * f;
      target.copy(toPoint);
    }
    start.copy(sample);
    time = next;
  }
  return when;
}

/**
 * The pieces of a comet's shower, laid out once from its seed: each a distance behind the head
 * and an offset square to the route, which it keeps (the swarm flies with the head, along its
 * route) until the swarm draws together into a well.
 */
export class Shower {
  /** Distance behind the head (units) and offset square to the route (x, y in the route's frame) of each piece. */
  readonly behind = new Float32Array(SHOWER_PIECES);
  readonly offsets = new Float32Array(SHOWER_PIECES * 2);
  readonly across = new THREE.Vector3();
  readonly up = new THREE.Vector3();

  constructor(readonly comet: Comet) {
    const r = new Randomizer((comet.seed % 2147483000) + 1);
    this.across.set(0, 1, 0).cross(comet.direction).normalize();
    this.up.crossVectors(comet.direction, this.across);
    for (let i = 0; i < SHOWER_PIECES; i++) {
      // denser near the head, thinning out towards the end of the tail
      const along = r.nextFloat() ** 1.6;
      const width = SHOWER_NARROW + (SHOWER_WIDE - SHOWER_NARROW) * along;
      const angle = r.range(0, Math.PI * 2);
      const out = Math.sqrt(r.nextFloat()) * width;
      this.behind[i] = SHOWER_GAP + along * (SHOWER_LENGTH - SHOWER_GAP);
      this.offsets[i * 2] = Math.cos(angle) * out;
      this.offsets[i * 2 + 1] = Math.sin(angle) * out;
    }
  }

  /** Where piece `i` is at a field time: where the head was as long ago as it trails it, off to its side. */
  pieceAt(i: number, time: number, target: THREE.Vector3): THREE.Vector3 {
    const lag = time - this.behind[i] / COMET_SPEED;
    const squeeze = Math.min(1, Math.max(0, (this.comet.swallowed - lag) / SQUEEZE));
    return headAt(this.comet, lag, target)
      .addScaledVector(this.across, this.offsets[i * 2] * squeeze)
      .addScaledVector(this.up, this.offsets[i * 2 + 1] * squeeze);
  }

  /** Piece `i` has followed the head into the well. */
  gone(i: number, time: number): boolean {
    return time - this.behind[i] / COMET_SPEED >= this.comet.swallowed;
  }
}

const head = new THREE.Vector3();
const piece = new THREE.Vector3();
const dummy = new THREE.Object3D();
const UP = new THREE.Vector3(0, 1, 0);
const stone = new THREE.Vector3();
const course = new THREE.Vector3();
const kick = new THREE.Vector3();
const axis = new THREE.Vector3();

/** The grid of field time a comet strikes rock and hull on (s), and how far back it looks for the first touch (s). */
export const BREAK_STEP = 0.1;
const LOOK_BACK = 3;

/**
 * The head runs down what stands in its way: a rock or hull piece it touches is struck at the
 * first moment of a grid of BREAK_STEP (s) of field time at which it touched it (looked for up
 * to LOOK_BACK back), so every browser strikes it at the same field time, however its frames
 * fell. A rock breaks (its fragments, deterministic from the rock and that time, fly alike
 * everywhere; those born in the head's way go the same way) and `broke` hears of it. A solid
 * piece stands but is shoved, once by each comet: SHOVE faster along the comet's course and
 * away from its center line, turning about the axis the off-center blow gives it, the faster
 * the farther off center; `shoved` hears of it with the point struck. Once the well swallowed
 * the head, it strikes nothing.
 */
export function runDown(comet: Comet, field: AsteroidField, time: number, broke: (rock: Asteroid) => void, shoved: (piece: Asteroid, point: THREE.Vector3) => void = () => {}) {
  if (time >= comet.swallowed) return;
  headAt(comet, time, head);
  for (const rock of field.asteroids.values()) {
    if (rock.shovedBy === comet.seed || rock.object.position.distanceTo(head) > HEAD_RADIUS + rock.radius + COMET_SPEED * LOOK_BACK) continue;
    let step = Math.floor(time / BREAK_STEP);
    if (!touches(comet, field, rock, step * BREAK_STEP)) continue;
    const first = Math.max(rock.born - 1e-6, time - LOOK_BACK);
    while ((step - 1) * BREAK_STEP >= first && touches(comet, field, rock, (step - 1) * BREAK_STEP)) step--;
    const at = step * BREAK_STEP;
    if (!rock.solid) {
      const broken = field.shatter(rock.id, at);
      if (broken) broke(broken);
      continue;
    }
    // the blow: along the course, and out from the course through the piece's center
    courseAt(comet, at, course);
    field.positionOf(rock, at, stone);
    headAt(comet, at, piece);
    const off = kick.subVectors(stone, piece).addScaledVector(course, -kick.dot(course));
    const center = Math.min(1, off.length() / (HEAD_RADIUS + rock.radius));
    axis.crossVectors(course, off);
    if (axis.lengthSq() < 1e-6) axis.set(0, 1, 0).cross(course);
    if (axis.lengthSq() < 1e-6) axis.set(1, 0, 0);
    axis.normalize();
    off.setLength(SHOVE * center).addScaledVector(course, SHOVE);
    field.shove(rock.id, at, off, axis, SHOVE_SPIN * (0.25 + 0.75 * center), comet.seed);
    shoved(rock, piece.lerp(stone, HEAD_RADIUS / (HEAD_RADIUS + rock.radius)));
  }
}

function touches(comet: Comet, field: AsteroidField, rock: Asteroid, time: number): boolean {
  return field.positionOf(rock, time, stone).distanceTo(headAt(comet, time, piece)) < HEAD_RADIUS + rock.radius;
}

/**
 * The comet of the round as the scene shows it: its head, its glowing coma and tail, its
 * shower; near a well the head drawn out, then a flash where it went, its tail drawn in after.
 */
export class CometView {
  readonly root = new THREE.Group();
  /** The head's frame along its course, which draws it out near a well. */
  private readonly body = new THREE.Group();
  private readonly headMesh: THREE.Mesh;
  private readonly coma: THREE.Sprite;
  private readonly flash: THREE.Sprite;
  private readonly tail: THREE.Mesh;
  private readonly pieces: THREE.InstancedMesh;
  private shower: Shower | null = null;

  constructor() {
    // the head: dark ice and rock, lumpy, its sunlit faces glinting
    const rock = new THREE.IcosahedronGeometry(HEAD_RADIUS, 2);
    const vertices = rock.attributes.position;
    const r = new Randomizer(7919);
    for (let i = 0; i < vertices.count; i++) {
      piece.fromBufferAttribute(vertices, i);
      piece.multiplyScalar(0.8 + r.nextFloat() * 0.35);
      vertices.setXYZ(i, piece.x, piece.y, piece.z);
    }
    rock.computeVertexNormals();
    this.headMesh = new THREE.Mesh(rock, new THREE.MeshStandardMaterial({ color: 0x8fa3b8, roughness: 0.7, metalness: 0.1, flatShading: true, emissive: 0x2a5a88, emissiveIntensity: 0.6 }));
    this.body.add(this.headMesh);
    // the coma: a cold blue-white glow around the head, seen from far off; the same light flares where a well swallows it
    const glow = new THREE.SpriteMaterial({
      map: radialTexture([
        [0, 'rgba(255,255,255,1)'],
        [0.15, 'rgba(200,235,255,0.85)'],
        [0.45, 'rgba(110,190,255,0.3)'],
        [1, 'rgba(60,120,255,0)'],
      ]),
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      toneMapped: false,
    });
    this.coma = new THREE.Sprite(glow);
    this.coma.scale.setScalar(HEAD_RADIUS * 9);
    this.flash = new THREE.Sprite(glow.clone());
    // the tail: a long cone of glowing dust, brightest at the head, fading out behind
    const cone = new THREE.ConeGeometry(SHOWER_WIDE * 1.1, SHOWER_LENGTH * 1.4, 24, 1, true);
    cone.translate(0, -SHOWER_LENGTH * 0.7, 0);
    this.tail = new THREE.Mesh(
      cone,
      new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
        uniforms: { length: { value: SHOWER_LENGTH * 1.4 } },
        vertexShader: /* glsl */ `
          uniform float length;
          varying float vAlong;
          void main() {
            vAlong = clamp(-position.y / length, 0.0, 1.0);
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }
        `,
        fragmentShader: /* glsl */ `
          varying float vAlong;
          void main() {
            float glow = pow(1.0 - vAlong, 2.2) * 0.35;
            gl_FragColor = vec4(vec3(0.55, 0.8, 1.0) * glow, glow);
          }
        `,
      }),
    );
    // the shower: small bright pieces of ice, clearly seen against the dark
    this.pieces = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(PIECE_RADIUS * 1.3, 0), new THREE.MeshBasicMaterial({ color: new THREE.Color(0.75, 0.92, 1).multiplyScalar(2.2), toneMapped: false }), SHOWER_PIECES);
    this.pieces.frustumCulled = false;
    this.root.add(this.body, this.coma, this.flash, this.tail, this.pieces);
    this.root.visible = false;
  }

  /** Shows a comet's shower at a field time, or nothing. */
  update(shower: Shower | null, time: number) {
    this.shower = shower;
    if (!shower) {
      this.root.visible = false;
      return;
    }
    const comet = shower.comet;
    this.root.visible = true;
    const left = comet.swallowed - time;
    const flying = left > 0;
    headAt(comet, time, head);
    courseAt(comet, time, course);
    this.body.visible = this.coma.visible = flying;
    this.body.position.copy(head);
    // the cone's axis (+Y) points along the flight, so its body trails behind; the head's frame too
    this.body.quaternion.setFromUnitVectors(UP, course);
    const drawn = Math.max(0, 1 - left / STRETCH);
    this.body.scale.set(1 / (1 + drawn), 1 + 3 * drawn, 1 / (1 + drawn));
    this.headMesh.rotation.set(time * 0.11, time * 0.07, 0);
    this.coma.position.copy(head);
    this.coma.scale.setScalar(HEAD_RADIUS * (9 + 6 * drawn));
    this.flash.visible = !flying && -left < FLASH;
    if (this.flash.visible) {
      const fade = -left / FLASH;
      this.flash.position.copy(head);
      this.flash.scale.setScalar(HEAD_RADIUS * (12 + 30 * fade));
      this.flash.material.opacity = 1 - fade;
    }
    this.tail.position.copy(head);
    this.tail.quaternion.copy(this.body.quaternion);
    // after the head, its tail is drawn in as the shower follows it
    const tail = flying ? 1 : Math.max(0, 1 + (left * COMET_SPEED) / SHOWER_LENGTH);
    this.tail.scale.set(Math.max(tail, 0.01), Math.max(tail, 0.01), Math.max(tail, 0.01));
    this.tail.visible = tail > 0;
    for (let i = 0; i < SHOWER_PIECES; i++) {
      if (shower.gone(i, time)) dummy.scale.setScalar(0);
      else {
        dummy.scale.setScalar(1);
        shower.pieceAt(i, time, dummy.position);
        dummy.rotation.set(i + time * 1.3, i * 0.7 + time, 0);
      }
      dummy.updateMatrix();
      this.pieces.setMatrixAt(i, dummy.matrix);
    }
    this.pieces.instanceMatrix.needsUpdate = true;
  }

  get current(): Shower | null {
    return this.shower;
  }

  dispose() {
    for (const mesh of [this.headMesh, this.tail, this.pieces]) {
      mesh.geometry.dispose();
      (mesh.material as THREE.Material).dispose();
    }
    this.coma.material.map?.dispose();
    this.coma.material.dispose();
    this.flash.material.dispose();
  }
}
