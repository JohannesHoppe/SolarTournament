import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { Randomizer } from '../random';
import { FIELD_RADIUS, raySphere, type AsteroidField, type Obstacle } from '../world/asteroids';
import { ARENA_LIMIT } from '../world/arena';
import { boxContact, rayBox } from '../world/boxes';
import { armorSurface, boxUv, lacquer, shine, surfaced } from '../view/surfaces';
import type { Homing } from './torpedoes';
import { COMET_REACH, COMET_SPEED, cometEnd, cometStart, courseAt, PIECE_RADIUS, routeNearest, SHOWER_LENGTH, SHOWER_WIDE, type Comet } from './comet';
import { msg, t } from '../i18n/i18n';

/**
 * The President's Fleet: every Host on one side against a battleship of the President, one in
 * every round. The President wants blood and sends battleships into the ring, because he can.
 * The Hosts win the round when it goes down; when the time runs out first, it got away, and
 * the President wins.
 *
 * A battleship, a gilded carrier 750 m long, circles the field along its outer rocks like a shark. It has
 * six laser batteries, two drives and a reactor under an armored dome; its hull itself takes
 * no harm. Every laser hit on a part counts; a part takes ZONE_HITS hits. Its phases follow
 * from what is left of it:
 *
 * - while more than half its batteries stand, it circles and its batteries fire;
 * - with half of them gone, it turns its stern on the nearest pilot and lights its drives: its
 *   drive plume, a kilometer and a half of plasma, burns whatever is in it;
 * - with every battery gone, the dome over the reactor opens; the reactor's end is the ship's.
 *
 * Without drives it drifts and burns nothing. A battleship that goes down takes every ship
 * within SINK_BLAST along.
 *
 * Its hull blocks the line of sight like a rock: a battery does not fire through it, and a pilot
 * on the far side is hidden from the others. A torpedo locks on a part as on a ship and goes off
 * on it, or on the hull; it counts TORPEDO_HITS hits on every part it goes off near.
 *
 * Online the lead browser flies the battleship and sends where it is with the round clock (see
 * Fleet.toState); every laser hit on a part goes to every browser, so all count the same hits.
 * Each browser fires the batteries at the ships it runs, and burns them in the plume.
 */
export type ZoneKind = 'battery' | 'drive' | 'reactor';
export const ZONE_NAMES: Record<ZoneKind, string> = { battery: msg('Battery'), drive: msg('Drive'), reactor: msg('Reactor') };
/**
 * How far a ship attacking a part turns its way there towards the side the part faces (see
 * siegeFrom): straight in from that side, at 27° from it coming from abeam, and from the other
 * side round to that side.
 */
const SIEGE_FACE = 2;
/** Hits a part takes. */
export const ZONE_HITS: Record<ZoneKind, number> = { battery: 64, drive: 94, reactor: 188 };
/** A torpedo counts this many hits on every part it goes off within TORPEDO_REACH of (units, 20 m beyond the part): about a sixth of a battery. */
export const TORPEDO_HITS = 10;
/** The battleship's armor plating repeats every ARMOR_TILE units (20 m); its seams lie this deep (see surfaced). */
const ARMOR_TILE = 400;
const ARMOR_RELIEF = 0.8;
const TORPEDO_REACH = 400;
/** Points for a hit on a part, for the hit that breaks one, and for every ship of the side when the battleship goes down. */
export const FLEET_HIT_POINTS = 10;
export const ZONE_POINTS: Record<ZoneKind, number> = { battery: 150, drive: 200, reactor: 1000 };
export const SINK_POINTS = 500;
/** The battleship comes this long after the round starts (s of field time). */
export const ARRIVAL = 12;
/**
 * A battleship circles the center this far out (units, 2.5 km), along the outer rocks and
 * almost 1 km inside the arena's edge, so a pilot can attack it from every side, at
 * FLEET_SPEED (units/s, 30 m/s); it turns at FLEET_TURN (rad/s).
 */
const ORBIT = FIELD_RADIUS * 1.1;
const FLEET_SPEED = 600;
const FLEET_TURN = 0.12;
/** It comes in from this far out (units), just inside the arena's edge. */
const ENTRY = ARENA_LIMIT * 0.95;
/** A battery fires every BATTERY_PERIOD seconds at the nearest ship within BATTERY_RANGE (units, 1.5 km) it sees. */
export const BATTERY_PERIOD = 1.6;
export const BATTERY_RANGE = 30000;
/**
 * A battery's beam hits with a chance that falls with the target's speed and distance: at
 * rest and close BATTERY_AIM, at full tournament speed (BATTERY_DODGE_SPEED, units/s) and the
 * edge of its range a quarter of that. Moving is what saves a pilot.
 */
export const BATTERY_AIM = 0.7;
/** A battery's beam is heavier than a ship's laser: on top of what a laser does where it strikes, it takes this much hull. */
export const BATTERY_DAMAGE = 10;
const BATTERY_DODGE_SPEED = 5000;
/** The drive plume: PLUME_REACH long (units, 1.5 km), spreading by PLUME_SPREAD per unit; PLUME_HEAT heat and PLUME_BURN hull per second at the nozzles, fading to nothing at its end. */
export const PLUME_REACH = 30000;
const PLUME_SPREAD = 0.12;
export const PLUME_HEAT = 150;
export const PLUME_BURN = 40;
/** It lights its drives once its stern points within PLUME_AIM (rad) of its target, a pilot within PLUME_HUNT (units, 1.8 km). */
const PLUME_AIM = 0.25;
const PLUME_HUNT = 36000;
/** A battleship going down burns SINK_SECONDS with its reactor critical, then goes up and destroys every ship within SINK_BLAST of it (units, 1 km). */
export const SINK_SECONDS = 4;
export const SINK_BLAST = 20000;
/** Nothing of a battleship lies farther than this from its center (units): its stern's nozzles at 400 m, and room. */
const REACH = 8500;
/** The flight deck's height above the hull's center, and the keel's depth below it (units: 65 m, 55 m). */
const DECK_TOP = 1300;
const KEEL = -1100;
/**
 * The battleship's sensors see a comet's route (see comet.ts) FLEET_LOOKOUT seconds before its
 * head passes nearest it; while that route runs within FLEET_CLEAR of its center (units, 760 m:
 * the shower's width, a piece, its own reach and 75 m to spare) it leaves its orbit and burns
 * straight away from the route at EVADE_SPEED (units/s, 50 m/s), turning onto that course
 * EVADE_BURN times as hard as onto its orbit, until the shower has passed. Clear of the route
 * by 760 m from right on it takes it about 17 s. With its drives shot out it cannot get away.
 */
const FLEET_LOOKOUT = 40;
const FLEET_CLEAR = SHOWER_WIDE + PIECE_RADIUS + REACH + 1500;
const EVADE_SPEED = 1000;
const EVADE_BURN = 2;
/** How fast the battleship takes up its orbit's course (per s). */
const STEER = 0.3;
/**
 * A cross section of the hull at `z` (units, in its frame; the bow points along -z): the flight
 * deck on top at DECK_TOP, `half` wide to each side; the armored belt drops straight from the
 * deck's edges to `belt`; below it the hull slopes in to the keel, `keelHalf` wide at `keel`.
 */
type Section = { z: number; half: number; top: number; belt: number; keelHalf: number; keel: number };
/**
 * The hull from bow to stern, straight between its sections: a dagger 55 m wide at the bow,
 * its keel rising there, widening to 190 m 235 m aft and to 230 m at the superstructure's
 * back, narrowing again over the drive section to the stern plate 710 m from the bow.
 */
const SECTIONS: readonly Section[] = [
  { z: -7200, half: 550, top: DECK_TOP, belt: 900, keelHalf: 200, keel: 500 },
  { z: -2500, half: 1900, top: DECK_TOP, belt: -100, keelHalf: 1200, keel: KEEL },
  { z: 5400, half: 2300, top: DECK_TOP, belt: -200, keelHalf: 1200, keel: KEEL },
  { z: 7000, half: 1900, top: 1200, belt: -300, keelHalf: 1000, keel: -900 },
];
/** Where the batteries sit (units, in its frame): two on sponsons forward, two on the deck's edges beside the superstructure, two under the keel. */
const BATTERY_MOUNTS: readonly (readonly [number, number, number])[] = [
  [1800, DECK_TOP + 150, -4000],
  [-1800, DECK_TOP + 150, -4000],
  [1800, DECK_TOP + 150, 1500],
  [-1800, DECK_TOP + 150, 1500],
  [0, KEEL - 350, -3000],
  [0, KEEL - 350, 2500],
];
/** How far a hangar opening's armored casemate stands out of the hull (units, 11 m). */
const HANGAR_DEPTH = 220;
/** Where the Ministry's seal sits on both flanks (units along the hull). */
const SEAL_Z = -1000;
/** The lights along the deck's edges run forward this fast (lane lengths a second). */
const PROCESSION = 0.6;
const BATTERIES = BATTERY_MOUNTS.length;

/** A part: its kind, where it sits and how big it is (in the battleship's frame), the way it faces (from that side it shows itself) and its mesh. */
type Zone = { kind: ZoneKind; at: THREE.Vector3; radius: number; face: THREE.Vector3; mesh: THREE.Object3D };
type Box = { center: THREE.Vector3; half: THREE.Vector3 };

/** What the lead browser sends: whether the battleship went down, the hits on each part, where it is, its motion and turn, whom its stern hunts and whether its drives burn. */
export type FleetState = { d: number; h: number[]; p: number[]; v: number[]; q: number[]; t: string | null; u: number };

/** What the fleet needs to know of a ship. */
export interface Target {
  readonly id: string;
  readonly alive: boolean;
  readonly flight: { readonly position: THREE.Vector3 };
}

/** A part broke, or the ship went down, and where. */
export type FleetEvent = { kind: 'broken' | 'sunk'; zone: number; position: THREE.Vector3 };

const local = new THREE.Vector3();
const step = new THREE.Vector3();
const closest = new THREE.Vector3();
const toTarget = new THREE.Vector3();
const want = new THREE.Vector3();
const dodge = new THREE.Vector3();
const look = new THREE.Matrix4();
const sighted = new THREE.Vector3();
const sightLine = new THREE.Vector3();
const facing = new THREE.Vector3();
const turn = new THREE.Quaternion();
const UP = new THREE.Vector3(0, 1, 0);

/**
 * A block tapering along z, flat-faced: its cross section `w0` wide and `h0` high around height
 * `y0` at z = `z0` (the end towards the bow), `w1` by `h1` around `y1` at z = `z1`.
 */
function taper(z0: number, z1: number, w0: number, h0: number, w1: number, h1: number, y0 = 0, y1 = 0): THREE.BufferGeometry {
  const box = new THREE.BoxGeometry(1, 1, 1);
  const position = box.attributes.position;
  for (let i = 0; i < position.count; i++) {
    const t = position.getZ(i) + 0.5;
    position.setXYZ(i, position.getX(i) * THREE.MathUtils.lerp(w0, w1, t), position.getY(i) * THREE.MathUtils.lerp(h0, h1, t) + THREE.MathUtils.lerp(y0, y1, t), THREE.MathUtils.lerp(z0, z1, t));
  }
  box.computeVertexNormals();
  return box;
}

/** The hull's cross section at `z`, between the two sections around it. */
function sectionAt(z: number): Section {
  let i = 0;
  while (i < SECTIONS.length - 2 && z > SECTIONS[i + 1].z) i++;
  const a = SECTIONS[i];
  const b = SECTIONS[i + 1];
  const t = THREE.MathUtils.clamp((z - a.z) / (b.z - a.z), 0, 1);
  const mix = (key: Exclude<keyof Section, 'z'>) => THREE.MathUtils.lerp(a[key], b[key], t);
  return { z, half: mix('half'), top: mix('top'), belt: mix('belt'), keelHalf: mix('keelHalf'), keel: mix('keel') };
}

/** How far the deck's edge moves out per unit along the hull at `z` (the belt's slant in plan). */
function flare(z: number) {
  const a = sectionAt(z - 1);
  const b = sectionAt(z + 1);
  return (b.half - a.half) / 2;
}

/**
 * The hull between two sections, flat-faced: deck, belts, the slopes to the keel and the keel,
 * each face with its own corners (so its normal is the face's), the ends closed where `caps` says.
 */
function hullBetween(a: Section, b: Section, caps: { front: boolean; back: boolean }): THREE.BufferGeometry {
  const outline = (s: Section) => [
    [-s.half, s.top],
    [s.half, s.top],
    [s.half, s.belt],
    [s.keelHalf, s.keel],
    [-s.keelHalf, s.keel],
    [-s.half, s.belt],
  ];
  const front = outline(a);
  const back = outline(b);
  const positions: number[] = [];
  const index: number[] = [];
  const corner = new THREE.Vector3();
  const across = new THREE.Vector3();
  const along = new THREE.Vector3();
  const middle = new THREE.Vector3();
  // a face from its corners, turned so it faces away from `inside`
  const face = (corners: THREE.Vector3[], inside: THREE.Vector3) => {
    const first = positions.length / 3;
    across.subVectors(corners[1], corners[0]);
    along.subVectors(corners[corners.length - 1], corners[0]);
    middle.set(0, 0, 0);
    for (const c of corners) middle.add(c);
    middle.divideScalar(corners.length).sub(inside);
    const flip = across.cross(along).dot(middle) < 0;
    for (const c of flip ? [...corners].reverse() : corners) positions.push(c.x, c.y, c.z);
    for (let i = 1; i < corners.length - 1; i++) index.push(first, first + i, first + i + 1);
  };
  const axis = new THREE.Vector3(0, (a.top + a.keel + b.top + b.keel) / 4, (a.z + b.z) / 2);
  for (let i = 0; i < 6; i++) {
    const j = (i + 1) % 6;
    face([new THREE.Vector3(front[i][0], front[i][1], a.z), new THREE.Vector3(front[j][0], front[j][1], a.z), new THREE.Vector3(back[j][0], back[j][1], b.z), new THREE.Vector3(back[i][0], back[i][1], b.z)], axis);
  }
  if (caps.front) face(front.map(([x, y]) => new THREE.Vector3(x, y, a.z)), corner.set(0, (a.top + a.keel) / 2, a.z + 1));
  if (caps.back) face(back.map(([x, y]) => new THREE.Vector3(x, y, b.z)), corner.set(0, (b.top + b.keel) / 2, b.z - 1));
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(new Array((positions.length / 3) * 2).fill(0), 2));
  geometry.setIndex(index);
  geometry.computeVertexNormals();
  return geometry;
}

/** The slogans the President's battleship carries in lights along its flanks. */
const SLOGANS = [msg('THE GREATEST SHIP EVER BUILT'), msg('PAID FOR WITH YOUR SACRIFICE'), msg('THE PRESIDENT IS WATCHING YOU')] as const;

/**
 * A sign in neon, `text` in the Host's language across a canvas of `width` by `height` pixels
 * (the regime's orange by default): on black with a frame, or `bare` on nothing, as letters
 * painted on a deck; null where nothing can be drawn (the unit tests).
 */
function signTexture(text: string, color = '#ffb347', width = 2048, height = 192, bare = false): THREE.CanvasTexture | null {
  if (typeof document === 'undefined') return null;
  const canvas = Object.assign(document.createElement('canvas'), { width, height });
  const g = canvas.getContext('2d')!;
  if (!bare) {
    g.fillStyle = '#120400';
    g.fillRect(0, 0, width, height);
    g.strokeStyle = color;
    g.lineWidth = 8;
    g.strokeRect(12, 12, width - 24, height - 24);
  }
  g.font = `400 ${Math.round(height * 0.48)}px Michroma, sans-serif`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  // the tube's glow, then its white-hot core
  g.shadowColor = color;
  g.shadowBlur = 28;
  g.fillStyle = color;
  g.fillText(text, canvas.width / 2, canvas.height / 2, canvas.width - 80);
  g.shadowBlur = 0;
  g.fillStyle = '#fff4dc';
  g.fillText(text, canvas.width / 2, canvas.height / 2, canvas.width - 80);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

/**
 * The seal of the Ministry of War (the game's own crest, public/crest.svg), gilded, drawn into
 * a canvas once it has loaded; null where nothing can be drawn.
 */
function crestTexture(): THREE.CanvasTexture | null {
  if (typeof document === 'undefined') return null;
  const canvas = Object.assign(document.createElement('canvas'), { width: 1024, height: 1024 });
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const image = new Image();
  image.onload = () => {
    canvas.getContext('2d')!.drawImage(image, 0, 0, 1024, 1024);
    texture.needsUpdate = true;
  };
  image.src = new URL('crest.svg', document.baseURI).href;
  return texture;
}

/** The chance a battery's beam hits a target this fast (units/s) this far away (units). */
export const batteryChance = (speed: number, distance: number) => BATTERY_AIM * (1 - 0.5 * Math.min(1, speed / BATTERY_DODGE_SPEED)) * (1 - 0.5 * Math.min(1, distance / BATTERY_RANGE));

/** A part of the battleship as a torpedo homes on it: where it is, and whether it can still be hit. */
class Beacon implements Homing {
  readonly id: string;
  readonly name: string;
  readonly radius: number;
  readonly flight: { position: THREE.Vector3; velocity: THREE.Vector3 };

  constructor(
    private readonly fleet: Fleet,
    private readonly zone: number,
  ) {
    const part = fleet.zones[zone];
    this.id = `battleship.${zone}`;
    this.name = t(ZONE_NAMES[part.kind]);
    this.radius = part.radius;
    this.flight = { position: new THREE.Vector3(), velocity: fleet.velocity };
  }

  get alive() {
    return this.fleet.targetable(this.zone);
  }

  inSight(from: THREE.Vector3, field: AsteroidField) {
    return this.fleet.inSight(this.zone, from, field);
  }
}

export class Fleet implements Obstacle {
  readonly root = new THREE.Group();
  /** When the battleship comes (field time), and whether it went down. */
  arrivesAt = ARRIVAL;
  down = false;
  readonly hits: number[];
  readonly zones: Zone[] = [];
  /** Each part, as a torpedo locks on it. */
  readonly beacons: Beacon[];
  readonly velocity = new THREE.Vector3();
  /** The ship its stern hunts in its second phase, and whether its drives burn. */
  target: string | null = null;
  burning = false;
  /** Where the lead browser last said it was, which the others glide towards. */
  private readonly heard = new THREE.Vector3();
  private readonly heardTurn = new THREE.Quaternion();
  private heardFresh = false;
  private readonly colliders: Box[] = [];
  private readonly dome: THREE.Mesh;
  private readonly flame: THREE.Mesh;
  private readonly materials: THREE.Material[] = [];
  private readonly geometries: THREE.BufferGeometry[] = [];
  private readonly burnt: THREE.MeshStandardMaterial;
  private readonly reactorGlow: THREE.MeshBasicMaterial;
  private readonly driveGlow: THREE.MeshBasicMaterial;
  /** The lights running along the deck's edges, and the signs' textures. */
  private readonly procession: THREE.ShaderMaterial;
  private readonly textures: THREE.Texture[] = [];
  private lastClock = 0;
  /** The field time of the frame it was last shown in (see update). */
  private clock = 0;
  /** When the battleship went down (field time). */
  private sunkAt = -Infinity;
  /** This browser has heard the lead's battleship still in the fight (see follow). */
  private afloat = false;

  constructor(private readonly seed: number) {
    // A carrier refitted for the President, fresh from the newest dock: a heavy hull of dark
    // armor, polished, gilded on its edges, its turrets and its bridge; the runway in the
    // regime's deep red, warm light in its hangars and in rows of windows, the regime's orange
    // neon running along the deck's edges in a procession
    const polished = { ...surfaced(armorSurface(seed), ARMOR_RELIEF), envMap: shine(), clearcoat: 1, clearcoatRoughness: 0.15 };
    const armor = this.material(lacquer(new THREE.MeshPhysicalMaterial({ ...polished, color: 0x2c3039, envMapIntensity: 1.2 })));
    const gold = this.material(lacquer(new THREE.MeshPhysicalMaterial({ ...polished, color: 0xe2aa3e, envMapIntensity: 2.4 })));
    const runway = this.material(new THREE.MeshStandardMaterial({ color: 0x4a0b10, metalness: 0.3, roughness: 0.6 }));
    const recess = this.material(new THREE.MeshStandardMaterial({ color: 0x07080a, roughness: 0.9 }));
    const gunmetal = this.material(new THREE.MeshStandardMaterial({ color: 0x3c414c, metalness: 0.6, roughness: 0.45, flatShading: true }));
    const bell = this.material(new THREE.MeshStandardMaterial({ color: 0x25272c, metalness: 0.8, roughness: 0.5, side: THREE.DoubleSide }));
    this.burnt = this.material(new THREE.MeshStandardMaterial({ color: 0x0a0a0a, roughness: 1 }));
    const light = (r: number, g: number, b: number, strength: number) => this.material(new THREE.MeshBasicMaterial({ color: new THREE.Color(r, g, b).multiplyScalar(strength), toneMapped: false }));
    // warm light in the windows and hangars, white on the deck, the drives' plasma white-hot
    const lit = light(1, 0.8, 0.55, 1.2);
    const hangar = light(1, 0.6, 0.28, 0.7);
    const marking = light(1, 0.95, 0.85, 1.3);
    const thruster = light(0.75, 0.85, 1, 1.6);
    this.reactorGlow = light(1, 0.75, 0.4, 2.5);
    this.driveGlow = light(0.75, 0.85, 1, 1.4);
    const flame = this.material(new THREE.MeshBasicMaterial({ color: new THREE.Color(1, 0.55, 0.2).multiplyScalar(1.5), transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
    // the procession: lights along the deck's edges that run forward in a wave towards the bow
    this.procession = this.material(
      new THREE.ShaderMaterial({
        uniforms: { time: { value: 0 } },
        vertexShader: /* glsl */ `
          attribute float lane;
          varying float vLane;
          void main() {
            vLane = lane;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }
        `,
        fragmentShader: /* glsl */ `
          uniform float time;
          varying float vLane;
          void main() {
            float wave = pow(max(0.0, sin(6.2831853 * (vLane * 6.0 + time * ${PROCESSION.toFixed(2)}))), 6.0);
            gl_FragColor = vec4(vec3(1.0, 0.55, 0.08) * (0.9 + 3.0 * wave), 1.0);
          }
        `,
        toneMapped: false,
      }),
    );

    // Everything that never changes is merged into one mesh per material; what collides is a
    // list of boxes in the ship's frame (the bow points along -z, as every ship's nose)
    const parts = new Map<THREE.Material, THREE.BufferGeometry[]>();
    const put = (geometry: THREE.BufferGeometry, material: THREE.Material) => {
      const list = parts.get(material) ?? [];
      list.push(geometry);
      parts.set(material, list);
    };
    const solid = (center: readonly number[], size: readonly number[]) => this.colliders.push({ center: new THREE.Vector3(center[0], center[1], center[2]), half: new THREE.Vector3(size[0], size[1], size[2]).multiplyScalar(0.5) });
    const block = (center: [number, number, number], size: [number, number, number], material: THREE.Material, collides = true) => {
      put(boxUv(new THREE.BoxGeometry(...size).translate(...center), ARMOR_TILE), material);
      if (collides) solid(center, size);
    };
    const shaped = (geometry: THREE.BufferGeometry, material: THREE.Material) => put(boxUv(geometry, ARMOR_TILE), material);
    const along = new THREE.Vector3(0, 0, 1);
    /** A bar `wide` by `high` from one point to another (trim, rails, recesses), not colliding. */
    const bar = (from: THREE.Vector3, to: THREE.Vector3, wide: number, high: number, material: THREE.Material) => {
      const span = to.clone().sub(from);
      const turned = new THREE.Quaternion().setFromUnitVectors(along, span.clone().normalize());
      const middle = from.clone().lerp(to, 0.5);
      shaped(new THREE.BoxGeometry(wide, high, span.length()).applyQuaternion(turned).translate(middle.x, middle.y, middle.z), material);
    };
    /** A flat panel `width` long and `height` high on a flank's belt at `z`, lying on its slant. */
    const onBelt = (side: number, z: number, y: number, width: number, height: number, lift = 4) =>
      new THREE.PlaneGeometry(width, height).rotateY(side * (Math.PI / 2 + Math.atan(flare(z)))).translate(side * (sectionAt(z).half + lift), y, z);
    const flank = (side: number, z: number, y: number, lift: number) => new THREE.Vector3(side * (sectionAt(z).half + lift), y, z);

    // the hull, section by section. It collides first as one long box, its core from the deck
    // to the keel between the bow's taper and the drive section (a ship pressed into it leaves
    // through the nearest of its faces, not between two short boxes), then in boxes a hundred
    // meters long or less: the belt's under the deck's full width, the slopes' halfway out
    // between belt and keel
    const [, waist, back] = SECTIONS;
    solid([0, (DECK_TOP + KEEL) / 2, (waist.z + back.z) / 2], [2 * waist.keelHalf, DECK_TOP - KEEL, back.z - waist.z]);
    SECTIONS.forEach((a, i) => {
      const b = SECTIONS[i + 1];
      if (!b) return;
      shaped(hullBetween(a, b, { front: i === 0, back: i === SECTIONS.length - 2 }), armor);
      const pieces = Math.ceil((b.z - a.z) / 2000);
      const length = (b.z - a.z) / pieces;
      for (let k = 0; k < pieces; k++) {
        const s = sectionAt(a.z + (k + 0.5) * length);
        solid([0, (s.top + s.belt) / 2, s.z], [2 * s.half, s.top - s.belt, length]);
        solid([0, (s.belt + s.keel) / 2, s.z], [s.half + s.keelHalf, s.belt - s.keel, length]);
      }
      // gilded along the deck's edges, the belt's lower edge and the keel's; under the deck's edge a trench
      // with a row of lit windows, gilded above and below
      for (const side of [-1, 1]) {
        const edge = (s: Section, y: number, lift = 0) => new THREE.Vector3(side * (s.half + lift), y, s.z);
        bar(edge(a, a.top), edge(b, b.top), 90, 90, gold);
        bar(edge(a, a.belt), edge(b, b.belt), 70, 70, gold);
        bar(new THREE.Vector3(side * a.keelHalf, a.keel, a.z), new THREE.Vector3(side * b.keelHalf, b.keel, b.z), 60, 60, gold);
        if (b.z <= SECTIONS[2].z) {
          bar(edge(a, a.top - 170, 8), edge(b, b.top - 170, 8), 16, 150, recess);
          bar(edge(a, a.top - 85, 10), edge(b, b.top - 85, 10), 24, 20, gold);
          bar(edge(a, a.top - 255, 10), edge(b, b.top - 255, 10), 24, 20, gold);
          for (let z = a.z + 120; z < b.z - 60; z += 95) if (z < SEAL_Z - 750 || z > SEAL_Z + 750) put(new THREE.BoxGeometry(30, 60, 40).translate(...flank(side, z, a.top - 170, 14).toArray()), lit);
        }
      }
    });

    // the forward belts carry plates of extra armor, laid in staggered courses under the trench
    for (const side of [-1, 1]) {
      for (let row = 0; row < 3; row++) {
        const top = DECK_TOP - 320 - row * 340;
        for (let z = SECTIONS[0].z + 300 + (row % 2) * 300; z < SECTIONS[1].z - 600; z += 600) {
          if (sectionAt(z).belt > top - 340) continue;
          bar(flank(side, z, top - 160, 14), flank(side, z + 560, top - 160, 14), 30, 300, armor);
        }
      }
    }

    // the runway forward of the reactor in the regime's deep red, its centerline dashed, two
    // catapult rails at the bow, and lights along the deck's edges that run forward in a procession
    block([0, DECK_TOP + 4, -4700], [1000, 8, 4800], runway, false);
    for (const z of [-7000, -6400]) block([0, DECK_TOP + 10, z], [80, 10, 300], marking, false);
    for (const x of [-330, 330]) {
      block([x, DECK_TOP + 12, -6550], [90, 20, 1200], gold, false);
      block([x, DECK_TOP + 14, -6550], [30, 20, 1150], marking, false);
    }
    const lights: THREE.BufferGeometry[] = [];
    const bow = SECTIONS[0].z;
    const stern = SECTIONS[2].z;
    for (const side of [-1, 1]) {
      for (let z = bow + 150; z < stern; z += 260) {
        const lamp = new THREE.BoxGeometry(70, 40, 140).translate(side * (sectionAt(z).half - 90), DECK_TOP + 20, z);
        lamp.setAttribute('lane', new THREE.BufferAttribute(new Float32Array(lamp.attributes.position.count).fill(1 - (z - bow) / (stern - bow)), 1));
        lights.push(lamp);
      }
    }
    /**
     * A hangar opening `width` by `height` at `center` on the hull, facing `out`: an armored
     * casemate standing HANGAR_DEPTH out of the hull, gilded around its mouth; inside, its
     * ceiling and walls in warm light, a row of lamps under the ceiling, the back and the floor
     * dark, so it reads as a deep, lit bay from any angle. It collides as one box.
     */
    const opening = (center: THREE.Vector3, out: THREE.Vector3, width: number, height: number) => {
      const frame = new THREE.Matrix4().makeBasis(new THREE.Vector3().crossVectors(UP, out), UP, out).setPosition(center);
      const add = (geometry: THREE.BufferGeometry, material: THREE.Material) => shaped(geometry.applyMatrix4(frame), material);
      const deep = HANGAR_DEPTH;
      const rim = 60;
      add(new THREE.PlaneGeometry(width, height).translate(0, 0, 2), recess);
      add(new THREE.PlaneGeometry(width, deep).rotateX(-Math.PI / 2).translate(0, -height / 2, deep / 2), recess);
      add(new THREE.PlaneGeometry(width, deep).rotateX(Math.PI / 2).translate(0, height / 2, deep / 2), hangar);
      for (const s of [-1, 1]) add(new THREE.PlaneGeometry(deep, height).rotateY(-s * (Math.PI / 2)).translate((s * width) / 2, 0, deep / 2), hangar);
      for (let x = -width / 2 + 60; x < width / 2 - 30; x += 90) add(new THREE.BoxGeometry(40, 20, 20).translate(x, height / 2 - 20, 12), lit);
      for (const s of [-1, 1]) {
        add(new THREE.BoxGeometry(width + 2 * rim, rim, deep).translate(0, s * (height / 2 + rim / 2), deep / 2), armor);
        add(new THREE.BoxGeometry(rim, height, deep).translate(s * (width / 2 + rim / 2), 0, deep / 2), armor);
        add(new THREE.BoxGeometry(width + 2 * rim + 30, 30, 30).translate(0, s * (height / 2 + rim), deep), gold);
        add(new THREE.BoxGeometry(30, height + 2 * rim, 30).translate(s * (width / 2 + rim), 0, deep), gold);
      }
      const middle = center.clone().addScaledVector(out, deep / 2);
      const across = width + 2 * rim;
      solid(middle.toArray(), Math.abs(out.x) > Math.abs(out.z) ? [deep, height + 2 * rim, across] : [across, height + 2 * rim, deep]);
    };
    // the hangar's mouth in the bow, and hangar bays along both flanks aft
    opening(new THREE.Vector3(0, DECK_TOP - 200, bow), new THREE.Vector3(0, 0, -1), 860, 260);
    for (const side of [-1, 1]) {
      for (let z = 900; z <= 4500; z += 1200) opening(flank(side, z, 330, 0), new THREE.Vector3(side, 0, -side * flare(z)).normalize(), 900, 480);
    }

    // the superstructure, stepped up towards the stern in tiers of armor, each sloping up from
    // its front, gilded along its roof's edges, rows of windows in its flanks and its front
    const tier = (z0: number, z1: number, w0: number, w1: number, base: number, h0: number, h1: number) => {
      shaped(taper(z0, z1, w0, h0, w1, h1, base + h0 / 2, base + h1 / 2), armor);
      const middle = (z0 + z1) / 2;
      for (const [za, zb] of [
        [z0, middle],
        [middle, z1],
      ]) {
        const t = ((za + zb) / 2 - z0) / (z1 - z0);
        const h = THREE.MathUtils.lerp(h0, h1, t);
        solid([0, base + h / 2, (za + zb) / 2], [THREE.MathUtils.lerp(w0, w1, t), h, zb - za]);
      }
      for (const side of [-1, 1]) {
        bar(new THREE.Vector3((side * w0) / 2, base + h0, z0), new THREE.Vector3((side * w1) / 2, base + h1, z1), 60, 60, gold);
        for (const y of h0 > 400 ? [base + h0 * 0.35, base + h0 * 0.7] : [base + h0 * 0.55]) {
          for (let z = z0 + 100; z < z1 - 60; z += 110) {
            const t = (z - z0) / (z1 - z0);
            put(new THREE.BoxGeometry(24, 50, 50).translate((side * THREE.MathUtils.lerp(w0, w1, t)) / 2, y, z), lit);
          }
        }
      }
      bar(new THREE.Vector3(-w0 / 2, base + h0, z0), new THREE.Vector3(w0 / 2, base + h0, z0), 60, 60, gold);
      for (let x = -w0 / 2 + 100; x < w0 / 2 - 60; x += 110) put(new THREE.BoxGeometry(50, 50, 24).translate(x, base + h0 * 0.55, z0), lit);
    };
    tier(600, 5400, 2600, 3400, DECK_TOP, 300, 700);
    tier(1700, 5400, 1800, 2500, DECK_TOP + 300, 450, 800);
    tier(2900, 5300, 1200, 1700, DECK_TOP + 800, 450, 700);
    // the bridge tower at the stern: its command deck spread wide above everything, a band of
    // windows all around it, the sensor house on its roof, two masts above
    block([0, 3200, 4000], [900, 1400, 1000], armor);
    block([0, 4125, 3900], [2600, 450, 1200], armor);
    for (let x = -1240; x <= 1240; x += 80) put(new THREE.BoxGeometry(50, 100, 24).translate(x, 4150, 3300), lit);
    for (const side of [-1, 1]) for (let z = 3360; z <= 4440; z += 80) put(new THREE.BoxGeometry(24, 100, 50).translate(side * 1300, 4150, z), lit);
    for (const side of [-1, 1]) bar(new THREE.Vector3(side * 1310, 4350, 3300), new THREE.Vector3(side * 1310, 4350, 4500), 60, 60, gold);
    bar(new THREE.Vector3(-1310, 4350, 3300), new THREE.Vector3(1310, 4350, 3300), 60, 60, gold);
    block([0, 4475, 4000], [1000, 250, 800], armor);
    for (const side of [-1, 1]) {
      block([side * 600, 5025, 4200], [70, 1350, 70], gunmetal);
      for (const y of [4900, 5300]) block([side * 600, y, 4200], [40, 40, 500], gunmetal, false);
    }

    // parked on the deck: two fighters on the catapults, four beside the reactor's dome
    const fighter = (x: number, z: number) => {
      shaped(new THREE.ConeGeometry(160, 700, 3).rotateX(-Math.PI / 2).translate(x, DECK_TOP + 90, z), gunmetal);
      shaped(new THREE.BoxGeometry(620, 30, 220).translate(x, DECK_TOP + 70, z + 150), gunmetal);
    };
    for (const x of [-330, 330]) fighter(x, -6600);
    for (const x of [-1300, 1300]) for (const z of [-2200, -200]) fighter(x, z);

    // the batteries' sponsons where the deck is too narrow for them, gilded along their edge,
    // and their pylons under the keel
    for (const at of BATTERY_MOUNTS) {
      const s = sectionAt(at[2]);
      if (at[1] < 0) block([0, (s.keel + 100 + KEEL - 200) / 2, at[2]], [600, s.keel + 100 - (KEEL - 200), 700], armor);
      else if (Math.abs(at[0]) + 300 > s.half) {
        const side = Math.sign(at[0]);
        const inner = s.half - 200;
        const outer = Math.abs(at[0]) + 340;
        block([(side * (inner + outer)) / 2, DECK_TOP - 160, at[2]], [outer - inner, 320, 1000], armor);
        block([side * outer, DECK_TOP - 160, at[2]], [60, 340, 1020], gold, false);
      }
    }
    // the stern: two great drive bells and four small ones around them
    for (const side of [-1, 1]) {
      shaped(new THREE.CylinderGeometry(680, 520, 800, 16, 1, true).rotateX(Math.PI / 2).translate(side * 700, 0, 7450), bell);
      for (const y of [800, -350]) {
        shaped(new THREE.CylinderGeometry(260, 200, 350, 12, 1, true).rotateX(Math.PI / 2).translate(side * 1450, y, 7175), bell);
        shaped(new THREE.CylinderGeometry(170, 190, 60, 12).rotateX(Math.PI / 2).translate(side * 1450, y, 7060), thruster);
      }
    }

    for (const [material, list] of parts) this.root.add(new THREE.Mesh(this.geometry(mergeGeometries(list)), material));
    this.root.add(new THREE.Mesh(this.geometry(mergeGeometries(lights)), this.procession));
    for (const geometry of [...[...parts.values()].flat(), ...lights]) geometry.dispose();

    // the Ministry of War's seal, large on both flanks and on the bridge tower; the slogans along
    // the hull; the President's slogan painted along the runway in letters twenty meters high
    const seal = crestTexture();
    const sealed = this.material(new THREE.MeshBasicMaterial({ map: seal, transparent: true, depthWrite: false, toneMapped: false, color: new THREE.Color(1.25, 1.1, 0.9) }));
    const sign = (texture: THREE.Texture | null, geometry: THREE.BufferGeometry, color = new THREE.Color(1.4, 1.4, 1.4)) => {
      if (texture) this.textures.push(texture);
      const material = this.material(new THREE.MeshBasicMaterial({ map: texture, transparent: true, toneMapped: false, color }));
      this.root.add(new THREE.Mesh(this.geometry(geometry), material));
    };
    if (seal) this.textures.push(seal);
    for (const side of [-1, 1]) {
      this.root.add(new THREE.Mesh(this.geometry(onBelt(side, SEAL_Z, 480, 1100, 1100, 8)), sealed));
      sign(signTexture(t(SLOGANS[side < 0 ? 1 : 2])), onBelt(side, 2700, 860, 4400, 380, 8));
    }
    this.root.add(new THREE.Mesh(this.geometry(new THREE.PlaneGeometry(800, 800).rotateY(Math.PI).translate(0, 3250, 3496)), sealed));
    sign(signTexture(t(SLOGANS[0]), '#ffcf5a', 4096, 800, true), new THREE.PlaneGeometry(3600, 760).rotateX(-Math.PI / 2).rotateY(Math.PI / 2).translate(0, DECK_TOP + 10, -4200), new THREE.Color(1.2, 1, 0.7));

    // the dome over the reactor, an armored hatch on the deck: armor while it is closed (see
    // open); always the last collider
    this.dome = new THREE.Mesh(this.geometry(boxUv(new THREE.CylinderGeometry(450 * Math.SQRT2, 650 * Math.SQRT2, 500, 4).rotateY(Math.PI / 4), ARMOR_TILE)), armor);
    this.dome.position.set(0, DECK_TOP + 250, -1200);
    this.root.add(this.dome);

    // a battery: an armored turret sloping up from its front, a gilded collar, three barrels
    const housing = this.geometry(boxUv(taper(-280, 280, 420, 200, 560, 300, -50, 0), ARMOR_TILE));
    const collar = this.geometry(boxUv(new THREE.BoxGeometry(640, 60, 640).translate(0, -130, 0), ARMOR_TILE));
    const barrels = this.geometry(mergeGeometries([-130, 0, 130].map((x) => new THREE.CylinderGeometry(40, 48, 1000, 8).rotateX(Math.PI / 2).translate(x, 0, -720))));
    for (const at of BATTERY_MOUNTS) {
      const turret = new THREE.Group();
      turret.position.set(...at);
      // under the keel it hangs upside down
      if (at[1] < 0) turret.rotation.z = Math.PI;
      turret.add(new THREE.Mesh(housing, armor), new THREE.Mesh(collar, gold), new THREE.Mesh(barrels, gunmetal));
      this.root.add(turret);
      // on deck it shows itself above the deck and over its edge, under the keel below it
      const face = at[1] < 0 ? new THREE.Vector3(0, -1, 0) : new THREE.Vector3(Math.sign(at[0]) * 0.5, 1, 0).normalize();
      this.zones.push({ kind: 'battery', at: new THREE.Vector3(...at), radius: 300, face, mesh: turret });
    }
    const nozzle = this.geometry(new THREE.CylinderGeometry(420, 520, 600, 16).rotateX(Math.PI / 2));
    for (const side of [-1, 1]) {
      const drive = new THREE.Mesh(nozzle, this.driveGlow);
      drive.position.set(side * 700, 0, 7400);
      this.root.add(drive);
      // astern and out to its side, clear of the plume
      this.zones.push({ kind: 'drive', at: drive.position.clone(), radius: 480, face: new THREE.Vector3(side * 0.6, 0, 1).normalize(), mesh: drive });
    }
    const reactor = new THREE.Mesh(this.geometry(new THREE.IcosahedronGeometry(420, 1)), this.reactorGlow);
    reactor.position.set(0, DECK_TOP, -1200);
    this.root.add(reactor);
    this.zones.push({ kind: 'reactor', at: reactor.position.clone(), radius: 450, face: new THREE.Vector3(0, 1, 0), mesh: reactor });
    solid([0, DECK_TOP + 250, -1200], [1300, 500, 1300]);
    // the plume behind the drives, while they burn
    this.flame = new THREE.Mesh(this.geometry(new THREE.ConeGeometry(PLUME_REACH * PLUME_SPREAD, PLUME_REACH, 24, 1, true).rotateX(-Math.PI / 2).translate(0, 0, 7700 + PLUME_REACH / 2)), flame);
    this.flame.visible = false;
    this.root.add(this.flame);
    this.hits = this.zones.map(() => 0);
    this.beacons = this.zones.map((_, i) => new Beacon(this, i));
    this.enter();
  }

  get position() {
    return this.root.position;
  }

  get quaternion() {
    return this.root.quaternion;
  }

  /** The battleship is in the fight: it has come, and has not gone down. */
  present(clock: number) {
    return clock >= this.arrivesAt && !this.down;
  }

  /** It went down and has gone up: the Hosts have won the round. */
  sunk(clock: number) {
    return this.down && !this.dying(clock);
  }

  /** Hits a part takes. */
  hitsOf(zone: number) {
    return ZONE_HITS[this.zones[zone].kind];
  }

  broken(zone: number) {
    return this.hits[zone] >= this.hitsOf(zone);
  }

  /** Batteries still firing. */
  get batteries() {
    return this.standingParts('battery');
  }

  get drives() {
    return this.standingParts('drive');
  }

  /** The parts of a kind still standing (counted by hand: bots and lines of sight ask every frame). */
  private standingParts(kind: ZoneKind) {
    let count = 0;
    for (let i = 0; i < this.zones.length; i++) if (this.zones[i].kind === kind && !this.broken(i)) count++;
    return count;
  }

  /** The battleship's phase: 1 while more than half its batteries stand, 2 below, 3 with all of them gone (the reactor open). */
  get phase() {
    const left = this.batteries;
    return left === 0 ? 3 : left * 2 <= BATTERIES ? 2 : 1;
  }

  /** A part can be hit: it stands, and the reactor only once its dome is open. */
  open(zone: number) {
    return !this.broken(zone) && (this.zones[zone].kind !== 'reactor' || this.phase === 3);
  }

  /** A torpedo can lock on a part: the battleship is in the fight, and the part can be hit. */
  targetable(zone: number) {
    return this.present(this.clock) && this.open(zone);
  }

  /** A part in world space. */
  zoneAt(zone: number, target = new THREE.Vector3()) {
    return target.copy(this.zones[zone].at).applyMatrix4(this.root.matrixWorld);
  }

  /**
   * The part to go for from a point, or -1: the nearest battery while one stands (they fire,
   * and they open the reactor), then the nearest drive or the reactor. Bots aim at it, and the
   * HUD marks it.
   */
  nearestZone(from: THREE.Vector3): number {
    let best = -1;
    let distance = Infinity;
    const batteries = this.batteries > 0;
    for (let i = 0; i < this.zones.length; i++) {
      if (!this.open(i) || (batteries && this.zones[i].kind !== 'battery')) continue;
      const d = this.zoneAt(i, local).distanceTo(from);
      if (d < distance) {
        distance = d;
        best = i;
      }
    }
    return best;
  }

  /**
   * Hits on a part (one for a laser, TORPEDO_HITS for a torpedo), from here or another browser;
   * returns the events they set off: the part broken, the ship gone down. A hit on a part
   * already broken or still sealed, or on a battleship that went down, counts nothing.
   */
  hit(zone: number, count = 1): FleetEvent[] {
    if (this.down || !this.open(zone)) return [];
    this.hits[zone] = Math.min(this.hits[zone] + count, this.hitsOf(zone));
    if (!this.broken(zone)) return [];
    const broken: FleetEvent = { kind: 'broken', zone, position: this.zoneAt(zone) };
    return this.zones[zone].kind === 'reactor' ? [broken, ...this.sink()] : [broken];
  }

  /**
   * A part is in sight of a point: the line from there to the part meets that part before any
   * armor, and no rock or massive body lies between. A battery's turret shows over the deck's
   * edge though its center sits on its mount, the reactor only from above the deck.
   */
  inSight(zone: number, from: THREE.Vector3, field: AsteroidField): boolean {
    const at = this.zoneAt(zone, sighted);
    const distance = at.distanceTo(from);
    if (distance < 1) return true;
    sightLine.subVectors(at, from).divideScalar(distance);
    const hit = this.raycast(from, sightLine, distance, this.clock);
    return hit !== null && hit.zone === zone && field.raycast(from, sightLine, hit.distance) === null;
  }

  /**
   * Where a ship attacking a part holds, `distance` from it (into `target`): on the side the
   * part faces, where it shows itself. The way from the part to the ship (`from`) is turned
   * towards that side (SIEGE_FACE), so ships coming from everywhere spread over it, and none
   * holds beneath the hull firing into its armor.
   */
  siegeFrom(zone: number, from: THREE.Vector3, distance: number, target: THREE.Vector3): THREE.Vector3 {
    const at = this.zoneAt(zone, sighted);
    const face = facing.copy(this.zones[zone].face).applyQuaternion(this.quaternion);
    target.subVectors(from, at).normalize().addScaledVector(face, SIEGE_FACE).normalize();
    return target.multiplyScalar(distance).add(at);
  }

  /** The parts a torpedo going off at `point` hits (see TORPEDO_HITS). */
  blast(point: THREE.Vector3): number[] {
    return this.zones.flatMap((zone, i) => (this.targetable(i) && this.zoneAt(i, local).distanceTo(point) < zone.radius + TORPEDO_REACH ? [i] : []));
  }

  /**
   * Where a ray (from `origin` along the normalized `direction`, up to `max`) meets the
   * battleship: the distance and the part it hits (-1: the armor); null when it misses.
   */
  raycast(origin: THREE.Vector3, direction: THREE.Vector3, max: number, clock: number): { distance: number; zone: number } | null {
    if (!this.present(clock) || raySphere(origin, direction, this.position, REACH) === null) return null;
    const armor = this.rayHull(origin, direction, max);
    let best = armor === null ? null : { distance: armor, zone: -1 };
    this.zones.forEach((zone, i) => {
      if (!this.open(i)) return;
      const d = raySphere(local, step, zone.at, zone.radius);
      if (d !== null && d <= max && (!best || d <= best.distance)) best = { distance: d, zone: i };
    });
    return best;
  }

  /** How far along a ray its hull lies, while it is in the field (see Obstacle). */
  ray(origin: THREE.Vector3, direction: THREE.Vector3, max: number): number | null {
    return this.standing && raySphere(origin, direction, this.position, REACH) !== null ? this.rayHull(origin, direction, max) : null;
  }

  /** A sphere touches its hull, while it is in the field (see Obstacle). */
  touches(center: THREE.Vector3, radius: number): boolean {
    if (!this.standing || center.distanceTo(this.position) > REACH + radius) return false;
    return this.colliders.some((box) => this.solid(box) && boxContact(this.toLocal(center, local).sub(box.center), box.half, radius, step, closest) !== null);
  }

  /** Pushes a sphere out of the hull while it is in the field, sinking too, as rays and torpedoes find it; returns the outward normal when they touched (and moves `center` onto the hull), otherwise null. */
  resolve(center: THREE.Vector3, radius: number, clock: number, normal = new THREE.Vector3()): THREE.Vector3 | null {
    if (!this.inField(clock) || center.distanceTo(this.position) > REACH + radius) return null;
    for (const box of this.colliders) {
      if (!this.solid(box)) continue;
      this.toLocal(center, local).sub(box.center);
      if (!boxContact(local, box.half, radius, normal, closest)) continue;
      normal.applyQuaternion(this.quaternion);
      closest.add(box.center).applyMatrix4(this.root.matrixWorld);
      center.copy(closest).addScaledVector(normal, radius + 1);
      return normal;
    }
    return null;
  }

  /** How strongly a point lies in the drive plume, 0..1 (1 at the nozzles), while the drives burn. */
  plumeAt(point: THREE.Vector3, radius: number): number {
    if (!this.burning) return 0;
    const along = this.plume(point, radius);
    return along < 0 ? 0 : 1 - along / PLUME_REACH;
  }

  /**
   * While its stern hunts a pilot, burning or turning to: the point on the plume's axis abreast
   * of `point` (into `target`) when `point` lies within `margin` of the plume, otherwise null.
   * Bots fly away from it, out to the side.
   */
  plumeNear(point: THREE.Vector3, margin: number, target: THREE.Vector3): THREE.Vector3 | null {
    if (this.target === null) return null;
    const along = this.plume(point, margin);
    return along < 0 ? null : target.copy(want).addScaledVector(toTarget, along);
  }

  /** The batteries that fire this frame, each with the number of its shot: the same moments and numbers on every browser, by the field time. */
  firing(clock: number): { zone: number; shot: number }[] {
    const fired: { zone: number; shot: number }[] = [];
    if (this.present(clock) && clock > this.lastClock) {
      this.zones.forEach((zone, i) => {
        if (zone.kind !== 'battery' || this.broken(i)) return;
        const offset = i * 0.27;
        const shot = Math.floor((clock + offset) / BATTERY_PERIOD);
        if (shot > Math.floor((this.lastClock + offset) / BATTERY_PERIOD)) fired.push({ zone: i, shot });
      });
    }
    this.lastClock = clock;
    return fired;
  }

  /**
   * The lead browser flies the battleship: in on its orbit around the field, its stern turned on
   * the nearest pilot in its second phase, out of the way of the round's `comets`, adrift
   * without drives.
   */
  lead(dt: number, clock: number, ships: readonly Target[], comets: readonly Comet[] = []) {
    if (!this.present(clock)) return;
    const position = this.position;
    const away = this.drives > 0 ? this.evasion(clock, comets, dodge) : null;
    if (away) this.velocity.lerp(want.copy(away).multiplyScalar(EVADE_SPEED), Math.min(1, dt * STEER * EVADE_BURN));
    else if (this.drives > 0) {
      // the orbit: along its circle around the center, back towards it when off
      const radial = local.copy(position).setY(0);
      const r = radial.length() || 1;
      want.crossVectors(UP, radial).divideScalar(r).multiplyScalar(FLEET_SPEED).addScaledVector(radial, ((ORBIT - r) / r) * 0.05);
      want.y = -position.y * 0.05;
      this.velocity.lerp(want, Math.min(1, dt * STEER));
    } else this.velocity.multiplyScalar(Math.max(0, 1 - dt * 0.2));
    position.addScaledVector(this.velocity, dt);
    // its bow along its course, or in its second phase its stern on the nearest pilot
    let prey: Target | null = null;
    if (this.phase >= 2 && this.drives > 0) {
      let nearest = PLUME_HUNT;
      for (const ship of ships) {
        const d = ship.alive ? ship.flight.position.distanceTo(position) : Infinity;
        if (d < nearest) {
          nearest = d;
          prey = ship;
        }
      }
    }
    this.target = prey?.id ?? null;
    const bow = prey ? want.subVectors(position, prey.flight.position) : want.copy(this.velocity);
    if (bow.lengthSq() > 1) {
      turn.setFromRotationMatrix(look.lookAt(local.set(0, 0, 0), bow.normalize(), UP));
      this.quaternion.rotateTowards(turn, FLEET_TURN * dt);
    }
    this.burning = !!prey && this.quaternion.angleTo(turn) < PLUME_AIM;
    this.root.updateMatrixWorld();
  }

  /** The way out of a comet's route the battleship sees coming within FLEET_CLEAR (unit length, into `target`), or null when none does. */
  private evasion(clock: number, comets: readonly Comet[], target: THREE.Vector3): THREE.Vector3 | null {
    for (const comet of comets) {
      if (clock < cometStart(comet) - FLEET_LOOKOUT || clock > cometEnd(comet)) continue;
      const when = routeNearest(comet, this.position, cometStart(comet), comet.at + COMET_REACH / COMET_SPEED, target);
      if (clock < when - FLEET_LOOKOUT || clock > when + SHOWER_LENGTH / COMET_SPEED) continue;
      target.subVectors(this.position, target);
      if (target.length() > FLEET_CLEAR) continue;
      // right on the route: up or down, square to it
      if (target.lengthSq() < 1) target.crossVectors(courseAt(comet, when, target), UP).cross(courseAt(comet, when, local));
      return target.normalize();
    }
    return null;
  }

  /** The lead's state, for the other browsers. */
  toState(): FleetState {
    const round = (v: number) => +v.toFixed(3);
    return {
      d: this.down ? 1 : 0,
      h: [...this.hits],
      p: this.position.toArray().map(Math.round),
      v: this.velocity.toArray().map(Math.round),
      q: this.quaternion.toArray().map(round),
      t: this.target,
      u: this.burning ? 1 : 0,
    };
  }

  /** Takes the lead's state: the battleship went down there first, the hits it counts, where it is. */
  follow(state: FleetState): FleetEvent[] {
    if (this.down) return [];
    // a browser that came after it went down saw no fight: it is gone, without a blast or points
    if (state.d && !this.afloat) {
      this.down = true;
      return [];
    }
    if (state.d) return this.sink();
    this.afloat = true;
    const events: FleetEvent[] = [];
    // hits only add up: the lead's count fills in hits not heard here
    state.h.forEach((hits, zone) => {
      if (hits <= this.hits[zone] || zone >= this.hits.length) return;
      const was = this.broken(zone);
      this.hits[zone] = Math.min(hits, this.hitsOf(zone));
      if (!was && this.broken(zone)) events.push({ kind: 'broken', zone, position: this.zoneAt(zone) });
    });
    this.heard.fromArray(state.p);
    this.heardTurn.fromArray(state.q).normalize();
    this.velocity.fromArray(state.v);
    if (!this.heardFresh) {
      this.position.copy(this.heard);
      this.quaternion.copy(this.heardTurn);
    }
    this.heardFresh = true;
    this.target = state.t;
    this.burning = state.u === 1;
    return events;
  }

  /** A browser that does not lead glides towards the lead's battleship, moving it on with its velocity meanwhile. */
  glide(dt: number) {
    if (!this.heardFresh) return;
    this.heard.addScaledVector(this.velocity, dt);
    this.position.lerp(this.heard, Math.min(1, dt * 4));
    this.quaternion.slerp(this.heardTurn, Math.min(1, dt * 4));
    this.root.updateMatrixWorld();
  }

  /** The battleship that went down burns this long before it goes up (s). */
  dying(clock: number) {
    return clock < this.sunkAt + SINK_SECONDS;
  }

  /**
   * The battleship as it looks this frame: broken parts burnt out, the dome open, the reactor
   * pulsing, the plume burning; once it went down it stays until it goes up.
   */
  update(clock: number, now: number) {
    this.clock = clock;
    const dying = this.dying(clock);
    this.root.visible = this.present(clock) || dying;
    this.beacons.forEach((beacon, i) => this.zoneAt(i, beacon.flight.position));
    // a broken drive is burnt out; a broken battery or reactor is gone
    this.zones.forEach((zone, i) => {
      if (zone.kind === 'drive') (zone.mesh as THREE.Mesh).material = this.broken(i) ? this.burnt : this.driveGlow;
      else zone.mesh.visible = !this.broken(i);
    });
    this.dome.visible = this.phase < 3 && !dying;
    this.reactorGlow.color.setRGB(1, 0.75, 0.4).multiplyScalar(dying ? 3 + 2 * Math.sin(now * 30) : this.phase === 3 ? 2 + Math.sin(now * 8) : 1.5);
    this.flame.visible = this.burning;
    if (this.burning) this.flame.scale.set(1 + 0.08 * Math.sin(now * 40), 1 + 0.08 * Math.sin(now * 37), 1);
    this.procession.uniforms.time.value = now;
  }

  dispose() {
    for (const material of this.materials) material.dispose();
    for (const geometry of this.geometries) geometry.dispose();
    for (const texture of this.textures) texture.dispose();
  }

  /** The battleship went down (here, or on the lead browser first): its reactor goes critical, and SINK_SECONDS later it goes up. */
  sink(): FleetEvent[] {
    this.down = true;
    this.sunkAt = this.lastClock;
    this.target = null;
    this.burning = false;
    return [{ kind: 'sunk', zone: -1, position: this.position.clone() }];
  }

  /** Where the battleship comes in: on the arena's edge, from a side that follows from the arena, heading along its orbit. */
  private enter() {
    const r = new Randomizer(this.seed * 13 + 101);
    const angle = r.range(0, Math.PI * 2);
    this.position.set(Math.cos(angle) * ENTRY, r.range(-4000, 4000), Math.sin(angle) * ENTRY);
    this.velocity.crossVectors(UP, this.position).setLength(FLEET_SPEED);
    this.quaternion.setFromRotationMatrix(look.lookAt(local.set(0, 0, 0), want.copy(this.velocity).normalize(), UP));
    this.target = null;
    this.burning = false;
    this.root.updateMatrixWorld();
  }

  private toLocal(point: THREE.Vector3, target: THREE.Vector3) {
    return target.copy(point).sub(this.position).applyQuaternion(turn.copy(this.quaternion).invert());
  }

  /** It is in the field as of the last frame shown: in the fight, or burning before it goes up. */
  private get standing() {
    return this.inField(this.clock);
  }

  /** Its hull is in the field at a field time: in the fight, or burning before it goes up. */
  private inField(clock: number) {
    return this.present(clock) || this.dying(clock);
  }

  /** A collider is there: every box of the hull, the dome's only while it is closed. */
  private solid(box: Box) {
    return box !== this.colliders[this.colliders.length - 1] || this.phase < 3;
  }

  /** Where a ray (up to `max`) meets the hull, or null; leaves the ray in the battleship's frame in `local` and `step`. */
  private rayHull(origin: THREE.Vector3, direction: THREE.Vector3, max: number): number | null {
    this.toLocal(origin, local);
    step.copy(direction).applyQuaternion(turn.copy(this.quaternion).invert());
    let best: number | null = null;
    for (const box of this.colliders) {
      if (!this.solid(box)) continue;
      const d = rayBox(closest.subVectors(local, box.center), step, box.half);
      if (d !== null && d <= max && (best === null || d < best)) best = d;
    }
    return best;
  }

  /** How far behind the nozzles a sphere lies in the plume's cone, or -1 outside it; leaves the stern's direction in `toTarget` and the nozzles in `want`. */
  private plume(point: THREE.Vector3, radius: number): number {
    const back = toTarget.set(0, 0, 1).applyQuaternion(this.quaternion);
    const nozzle = want.set(0, 0, 7700).applyMatrix4(this.root.matrixWorld);
    const away = local.subVectors(point, nozzle);
    const along = away.dot(back);
    if (along <= 0 || along > PLUME_REACH) return -1;
    const across = away.addScaledVector(back, -along).length();
    return across > radius + 1400 + along * PLUME_SPREAD ? -1 : along;
  }

  private material<T extends THREE.Material>(material: T): T {
    this.materials.push(material);
    return material;
  }

  private geometry<T extends THREE.BufferGeometry>(geometry: T): T {
    this.geometries.push(geometry);
    return geometry;
  }
}
