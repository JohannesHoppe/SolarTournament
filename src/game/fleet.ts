import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { Randomizer } from '../random';
import { FIELD_RADIUS, raySphere, type Obstacle } from '../world/asteroids';
import { ARENA_LIMIT } from '../world/arena';
import { boxContact, rayBox } from '../world/boxes';
import { boxUv, gleamingSurface, shine, surfaced } from '../view/surfaces';
import type { Homing } from './torpedoes';
import { COMET_REACH, COMET_SPEED, cometEnd, cometStart, courseAt, PIECE_RADIUS, routeNearest, SHOWER_LENGTH, SHOWER_WIDE, type Comet } from './comet';
import { msg, t } from '../i18n/i18n';

/**
 * The President's Fleet: every Host on one side against a battleship of the President, one in
 * every round. The President wants blood and sends battleships into the ring, because he can.
 * The Hosts win the round when it goes down; when the time runs out first, it got away, and
 * the President wins.
 *
 * A battleship, a golden carrier 745 m long, circles the field along its outer rocks like a shark. It has
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
/** Hits a part takes. */
export const ZONE_HITS: Record<ZoneKind, number> = { battery: 30, drive: 45, reactor: 90 };
/** A torpedo counts this many hits on every part it goes off within TORPEDO_REACH of (units, 20 m beyond the part): a third of a battery. */
export const TORPEDO_HITS = 10;
/** The battleship's plating repeats every GLEAM_TILE units (20 m); its seams lie this deep (see surfaced). */
const GLEAM_TILE = 400;
const GLEAM_RELIEF = 0.8;
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
 * The hull is HULL_WIDTH wide and twice HULL_HALF high (units: 120 m by 110 m); the flight deck
 * on top of it is a slab DECK_WIDTH wide (170 m) and DECK_THICK thick, from DECK_BOW to
 * DECK_STERN along the hull (360 m before its center to 270 m behind it).
 */
const HULL_WIDTH = 2400;
const HULL_HALF = 1100;
const DECK_WIDTH = 3400;
const DECK_THICK = 200;
const DECK_TOP = HULL_HALF + DECK_THICK;
const DECK_BOW = -7200;
const DECK_STERN = 5400;
/** Where the batteries sit (units, in its frame): four on sponsons along the flight deck's edges, two under the keel. */
const BATTERY_MOUNTS: readonly (readonly [number, number, number])[] = [
  [1800, DECK_TOP + 150, -4000],
  [-1800, DECK_TOP + 150, -4000],
  [1800, DECK_TOP + 150, 1500],
  [-1800, DECK_TOP + 150, 1500],
  [0, -HULL_HALF - 350, -3000],
  [0, -HULL_HALF - 350, 2500],
];
/** The island, the bridge tower on the starboard edge of the deck (units, its center across and along). */
const ISLAND_X = 1250;
const ISLAND_Z = 2800;
/** The halo of light above the island turns this fast (rad/s); the lights along the deck run forward this fast (lane lengths a second). */
const HALO_SPIN = 0.25;
const PROCESSION = 0.6;
const BATTERIES = BATTERY_MOUNTS.length;

type Zone = { kind: ZoneKind; at: THREE.Vector3; radius: number; mesh: THREE.Object3D };
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
 * The seal of the Ministry of War (the game's own crest, public/crest.svg), gilded and glowing,
 * drawn into a canvas once it has loaded; null where nothing can be drawn.
 */
function crestTexture(): THREE.CanvasTexture | null {
  if (typeof document === 'undefined') return null;
  const canvas = Object.assign(document.createElement('canvas'), { width: 1024, height: 1024 });
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const image = new Image();
  image.onload = () => {
    const g = canvas.getContext('2d')!;
    // a golden glow behind the seal, so it reads from a kilometer
    const glow = g.createRadialGradient(512, 512, 300, 512, 512, 512);
    glow.addColorStop(0, 'rgba(255, 190, 80, 0.55)');
    glow.addColorStop(1, 'rgba(255, 120, 0, 0)');
    g.fillStyle = glow;
    g.fillRect(0, 0, 1024, 1024);
    g.drawImage(image, 64, 64, 896, 896);
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
  /** The lights running along the deck's edges, the halo of light over the island, and the signs' textures. */
  private readonly procession: THREE.ShaderMaterial;
  private readonly halo: THREE.Group;
  private readonly textures: THREE.Texture[] = [];
  private lastClock = 0;
  /** The field time of the frame it was last shown in (see update). */
  private clock = 0;
  /** When the battleship went down (field time). */
  private sunkAt = -Infinity;
  /** This browser has heard the lead's battleship still in the fight (see follow). */
  private afloat = false;

  constructor(private readonly seed: number) {
    // A carrier refitted for the President, fresh from the newest dock: its hull gold under a
    // clear lacquer whose thin film plays in all colors, glitter in it that sparkles in the dark
    // too; the island in pearl, the flight deck in the regime's deep red with its markings in
    // light; the regime's orange neon running along it in a procession
    const gleam = gleamingSurface(seed);
    const lacquer = {
      ...surfaced(gleam, GLEAM_RELIEF),
      envMap: shine(),
      envMapIntensity: 1.8,
      clearcoat: 1,
      clearcoatRoughness: 0.05,
      iridescence: 1,
      iridescenceIOR: 1.5,
      iridescenceThicknessRange: [220, 680] as [number, number],
      emissive: 0xffffff,
      emissiveMap: gleam.glow,
      emissiveIntensity: 2.5,
    };
    const gold = this.material(new THREE.MeshPhysicalMaterial({ ...lacquer, color: 0xffcc4d, metalness: 0.7, envMapIntensity: 2.6 }));
    const pearl = this.material(new THREE.MeshPhysicalMaterial({ ...lacquer, color: 0xf6f1e6, metalness: 0.45 }));
    const deck = this.material(new THREE.MeshPhysicalMaterial({ ...lacquer, color: 0x6a0c18, metalness: 0.3, iridescence: 0.35, emissiveIntensity: 0.9 }));
    const gunmetal = this.material(new THREE.MeshStandardMaterial({ color: 0x3c414c, metalness: 0.6, roughness: 0.45, flatShading: true }));
    this.burnt = this.material(new THREE.MeshStandardMaterial({ color: 0x0a0a0a, roughness: 1 }));
    const light = (r: number, g: number, b: number, strength: number) => this.material(new THREE.MeshBasicMaterial({ color: new THREE.Color(r, g, b).multiplyScalar(strength), toneMapped: false }));
    // the regime's red for its guns and bridge, warm light in the hangars, white on the deck, the launch tube's cold blue
    const neon = light(1, 0.08, 0.12, 2.2);
    const hangar = light(1, 0.72, 0.38, 1.6);
    const marking = light(1, 0.95, 0.85, 1.3);
    const launch = light(0.45, 0.85, 1, 2.6);
    const thruster = light(0.4, 0.6, 1, 2);
    this.reactorGlow = light(1, 0.75, 0.4, 2.5);
    this.driveGlow = light(0.4, 0.6, 1, 2);
    const glory = (opacity: number) => this.material(new THREE.MeshBasicMaterial({ color: new THREE.Color(1, 0.78, 0.35).multiplyScalar(2), transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false }));
    const halo = glory(0.9);
    const rays = glory(0.35);
    const beams = this.material(new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.12, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false }));
    const sunburst = light(1, 0.7, 0.25, 1.8);
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
      put(boxUv(new THREE.BoxGeometry(...size).translate(...center), GLEAM_TILE), material);
      if (collides) solid(center, size);
    };
    const shaped = (geometry: THREE.BufferGeometry, material: THREE.Material) => put(boxUv(geometry, GLEAM_TILE), material);

    // the hull: a long golden body, its bow a wedge under the deck's front, collides in steps
    const hullLength = DECK_STERN - -2500;
    block([0, 0, (DECK_STERN - 2500) / 2], [HULL_WIDTH, 2 * HULL_HALF, hullLength], gold);
    shaped(taper(DECK_BOW, -2500, 500, 700, HULL_WIDTH, 2 * HULL_HALF, 450, 0), gold);
    for (let i = 0; i < 3; i++) {
      const t = (i + 0.5) / 3;
      const z = THREE.MathUtils.lerp(DECK_BOW, -2500, t);
      solid([0, THREE.MathUtils.lerp(450, 0, t), z], [THREE.MathUtils.lerp(500, HULL_WIDTH, t), THREE.MathUtils.lerp(700, 2 * HULL_HALF, t), (-2500 - DECK_BOW) / 3]);
    }
    // the flight deck, overhanging the hull, with gold along its edges
    const deckLength = DECK_STERN - DECK_BOW;
    const deckMid = (DECK_STERN + DECK_BOW) / 2;
    block([0, HULL_HALF + DECK_THICK / 2, deckMid], [DECK_WIDTH, DECK_THICK, deckLength], deck);
    for (const side of [-1, 1]) block([side * (DECK_WIDTH / 2 + 30), HULL_HALF + DECK_THICK / 2, deckMid], [60, DECK_THICK + 60, deckLength], gold, false);
    // the runway: a dashed centerline, two catapult rails at the bow glowing in their slots,
    // and lights along both edges that run forward in a procession
    for (let z = DECK_BOW + 400; z < DECK_STERN - 400; z += 600) block([0, DECK_TOP + 5, z], [80, 10, 300], marking, false);
    for (const x of [-520, 520]) {
      block([x, DECK_TOP + 10, -5300], [90, 20, 3600], gold, false);
      block([x, DECK_TOP + 12, -5300], [30, 20, 3500], launch, false);
    }
    const lights: THREE.BufferGeometry[] = [];
    for (const side of [-1, 1]) {
      for (let z = DECK_BOW + 150; z < DECK_STERN; z += 260) {
        const lamp = new THREE.BoxGeometry(70, 40, 140).translate(side * (DECK_WIDTH / 2 - 60), DECK_TOP + 20, z);
        lamp.setAttribute('lane', new THREE.BufferAttribute(new Float32Array(lamp.attributes.position.count).fill(1 - (z - DECK_BOW) / deckLength), 1));
        lights.push(lamp);
      }
    }
    // the launch tube under the deck's front, glowing deep inside
    block([0, HULL_HALF - 350, DECK_BOW + 300], [1800, 700, 600], gold);
    shaped(new THREE.PlaneGeometry(1300, 450).rotateY(Math.PI).translate(0, HULL_HALF - 350, DECK_BOW - 2), launch);
    // the bow's figurehead: a golden sun above the deck's front, its rays glowing all around it
    shaped(new THREE.CylinderGeometry(520, 520, 80, 24).rotateX(Math.PI / 2).translate(0, DECK_TOP + 700, DECK_BOW + 120), gold);
    for (let i = 0; i < 16; i++) {
      const angle = (i / 16) * Math.PI * 2;
      const length = i % 2 ? 420 : 700;
      shaped(
        taper(-length / 2, length / 2, 140, 40, 10, 10)
          .rotateX(Math.PI / 2)
          .rotateZ(angle - Math.PI / 2)
          .translate(Math.cos(angle) * (520 + length / 2), DECK_TOP + 700 + Math.sin(angle) * (520 + length / 2), DECK_BOW + 120),
        sunburst,
      );
    }

    // the island on the starboard edge: base, bridge in pearl with its windows lit, a golden
    // spire with a crown, and above it a halo of light with its rays, turning slowly
    block([ISLAND_X, DECK_TOP + 700, ISLAND_Z], [700, 1400, 2200], gold);
    block([ISLAND_X, DECK_TOP + 1850, ISLAND_Z + 100], [560, 900, 1500], pearl);
    for (const y of [DECK_TOP + 1700, DECK_TOP + 2050]) block([ISLAND_X, y, ISLAND_Z + 100], [580, 60, 1520], hangar, false);
    block([ISLAND_X, DECK_TOP + 2320, ISLAND_Z + 100], [600, 40, 1540], neon, false);
    shaped(new THREE.CylinderGeometry(120, 320, 1600, 4).rotateY(Math.PI / 4).translate(ISLAND_X, DECK_TOP + 3100, ISLAND_Z), gold);
    solid([ISLAND_X, DECK_TOP + 3100, ISLAND_Z], [500, 1600, 500]);
    shaped(new THREE.ConeGeometry(260, 500, 6).translate(ISLAND_X, DECK_TOP + 4150, ISLAND_Z), gold);
    this.halo = new THREE.Group();
    this.halo.position.set(ISLAND_X, DECK_TOP + 3900, ISLAND_Z);
    this.halo.add(new THREE.Mesh(this.geometry(new THREE.TorusGeometry(760, 45, 8, 64).rotateX(Math.PI / 2)), halo));
    const ray = this.geometry(taper(-500, 500, 120, 8, 6, 6).rotateY(Math.PI / 2).translate(1350, 0, 0));
    for (let i = 0; i < 24; i++) {
      const spoke = new THREE.Mesh(ray, rays);
      spoke.rotation.y = (i / 24) * Math.PI * 2;
      spoke.rotation.z = i % 2 ? 0.25 : -0.1;
      this.halo.add(spoke);
    }
    this.root.add(this.halo);
    // two searchlights sweep up into space from the island: the President's glory, fading out
    // towards their far end
    for (const side of [-1, 1]) {
      const cone = new THREE.ConeGeometry(500, 7000, 16, 4, true).translate(0, -3500, 0);
      const height = cone.getAttribute('position');
      const fade = new Float32Array(height.count * 3);
      for (let i = 0; i < height.count; i++) fade.fill((1 + height.getY(i) / 7000) ** 2, i * 3, i * 3 + 3);
      cone.setAttribute('color', new THREE.BufferAttribute(fade, 3));
      shaped(cone.rotateX(Math.PI).rotateZ(side * 0.35).translate(ISLAND_X, DECK_TOP + 2400, ISLAND_Z + side * 500), beams);
    }

    // hangar bays along both flanks, warm light inside, and the slogans above them
    for (const side of [-1, 1]) {
      for (let z = 900; z <= 4500; z += 1200) shaped(new THREE.PlaneGeometry(900, 520).rotateY(side * (Math.PI / 2)).translate(side * (HULL_WIDTH / 2 + 2), -560, z), hangar);
      for (let z = 900; z <= 4500; z += 1200) block([side * (HULL_WIDTH / 2 + 20), -560, z], [40, 640, 1020], gunmetal, false);
    }
    // parked on the deck: two fighters on the catapults, three in a row aft beside the island
    const fighter = (x: number, z: number) => {
      shaped(new THREE.ConeGeometry(160, 700, 3).rotateX(-Math.PI / 2).translate(x, DECK_TOP + 90, z), gunmetal);
      shaped(new THREE.BoxGeometry(620, 30, 220).translate(x, DECK_TOP + 70, z + 150), gunmetal);
    };
    for (const x of [-520, 520]) fighter(x, -6300);
    for (let z = 2900; z <= 4900; z += 1000) fighter(-900, z);

    // the batteries' sponsons along the deck's edges, and their pylons under the keel
    for (const at of BATTERY_MOUNTS) {
      if (at[1] > 0) block([at[0], HULL_HALF + 50, at[2]], [700, 300, 900], gold);
      else block([0, -HULL_HALF - 100, at[2]], [500, 200, 500], gold);
    }
    // the drive block at the stern, its fins swept back, four smaller nozzles around the two drives
    block([0, 0, DECK_STERN + 850], [3400, 2400, 1700], gold);
    shaped(new THREE.BoxGeometry(80, 1600, 1400).rotateX(0.45).translate(0, HULL_HALF + 900, DECK_STERN + 1000), gold);
    solid([0, HULL_HALF + 900, DECK_STERN + 1000], [100, 1400, 1200]);
    for (const side of [-1, 1]) {
      shaped(new THREE.BoxGeometry(2400, 100, 1300).rotateY(side * 0.3).translate(side * 2800, -200, DECK_STERN + 700), gold);
      solid([side * 2700, -200, DECK_STERN + 700], [2200, 120, 1100]);
      for (const y of [-800, 800]) shaped(new THREE.CylinderGeometry(260, 330, 400, 12).rotateX(Math.PI / 2).translate(side * 1350, y, DECK_STERN + 1900), thruster);
    }
    // neon rings around the drive block and along the hull's flanks
    for (const z of [DECK_STERN + 100, DECK_STERN + 1600]) block([0, 0, z], [3440, 2440, 60], neon, false);
    for (const side of [-1, 1]) block([side * (HULL_WIDTH / 2 + 15), HULL_HALF - 120, (DECK_STERN - 2500) / 2], [30, 80, hullLength], neon, false);

    for (const [material, list] of parts) this.root.add(new THREE.Mesh(this.geometry(mergeGeometries(list)), material));
    this.root.add(new THREE.Mesh(this.geometry(mergeGeometries(lights)), this.procession));
    for (const geometry of [...[...parts.values()].flat(), ...lights]) geometry.dispose();

    // the Ministry of War's seal, large on both flanks and on the island; the slogans along the
    // hull; the President's name painted across the deck in letters a hundred meters high
    const seal = crestTexture();
    const sealed = this.material(new THREE.MeshBasicMaterial({ map: seal, transparent: true, depthWrite: false, toneMapped: false, color: new THREE.Color(1.6, 1.4, 1.1) }));
    const sign = (texture: THREE.Texture | null, geometry: THREE.BufferGeometry, color = new THREE.Color(1.4, 1.4, 1.4)) => {
      if (texture) this.textures.push(texture);
      const material = this.material(new THREE.MeshBasicMaterial({ map: texture, transparent: true, toneMapped: false, color }));
      this.root.add(new THREE.Mesh(this.geometry(geometry), material));
    };
    if (seal) this.textures.push(seal);
    for (const side of [-1, 1]) {
      this.root.add(new THREE.Mesh(this.geometry(new THREE.PlaneGeometry(1900, 1900).rotateY(side * (Math.PI / 2)).translate(side * (HULL_WIDTH / 2 + 4), 0, -1000)), sealed));
      this.root.add(new THREE.Mesh(this.geometry(new THREE.PlaneGeometry(1000, 1000).rotateY(side * (Math.PI / 2)).translate(ISLAND_X + side * 352, DECK_TOP + 700, ISLAND_Z)), sealed));
      const slogan = t(SLOGANS[side < 0 ? 1 : 2]);
      sign(signTexture(slogan), new THREE.PlaneGeometry(4400, 420).rotateY(side * (Math.PI / 2)).translate(side * (HULL_WIDTH / 2 + 4), 380, 2700));
    }
    sign(signTexture(t(SLOGANS[0]), '#ffcf5a', 4096, 512, true), new THREE.PlaneGeometry(8000, 1000).rotateX(-Math.PI / 2).rotateY(Math.PI / 2).translate(-1150, DECK_TOP + 8, -1500), new THREE.Color(1.2, 1, 0.7));

    // the dome over the reactor: armor while it is closed (see open); always the last collider
    this.dome = new THREE.Mesh(this.geometry(boxUv(new THREE.BoxGeometry(1300, 500, 1300), GLEAM_TILE)), gold);
    this.dome.position.set(0, DECK_TOP + 250, -1200);
    this.root.add(this.dome);

    const barrel = this.geometry(new THREE.CylinderGeometry(55, 55, 900, 8).rotateX(Math.PI / 2).translate(0, 0, -450));
    const mount = this.geometry(boxUv(new THREE.BoxGeometry(500, 300, 500), GLEAM_TILE));
    for (const at of BATTERY_MOUNTS) {
      const turret = new THREE.Group();
      turret.position.set(...at);
      const left = new THREE.Mesh(barrel, neon);
      const right = new THREE.Mesh(barrel, neon);
      left.position.x = -110;
      right.position.x = 110;
      turret.add(new THREE.Mesh(mount, pearl), left, right);
      this.root.add(turret);
      this.zones.push({ kind: 'battery', at: new THREE.Vector3(...at), radius: 300, mesh: turret });
    }
    const nozzle = this.geometry(new THREE.CylinderGeometry(420, 520, 600, 16).rotateX(Math.PI / 2));
    for (const side of [-1, 1]) {
      const drive = new THREE.Mesh(nozzle, this.driveGlow);
      drive.position.set(side * 700, 0, 7400);
      this.root.add(drive);
      this.zones.push({ kind: 'drive', at: drive.position.clone(), radius: 480, mesh: drive });
    }
    const reactor = new THREE.Mesh(this.geometry(new THREE.IcosahedronGeometry(420, 1)), this.reactorGlow);
    reactor.position.set(0, DECK_TOP, -1200);
    this.root.add(reactor);
    this.zones.push({ kind: 'reactor', at: reactor.position.clone(), radius: 450, mesh: reactor });
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

  /** Pushes a sphere out of the hull; returns the outward normal when they touched (and moves `center` onto the hull), otherwise null. */
  resolve(center: THREE.Vector3, radius: number, clock: number, normal = new THREE.Vector3()): THREE.Vector3 | null {
    if (!this.present(clock) || center.distanceTo(this.position) > REACH + radius) return null;
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
    this.halo.rotation.y = now * HALO_SPIN;
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
    return this.present(this.clock) || this.dying(this.clock);
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
