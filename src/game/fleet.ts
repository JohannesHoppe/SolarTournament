import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { Randomizer } from '../random';
import { FIELD_RADIUS, raySphere, type AsteroidField, type Obstacle } from '../world/asteroids';
import { ARENA_LIMIT } from '../world/arena';
import { boxContact, rayBox } from '../world/boxes';
import { shelter, unshelter } from '../world/space';
import { ARMOR_TILE, armorSurface, boxUv, lacquer, shine } from '../view/surfaces';
import type { Homing } from './torpedoes';
import { Elevation, EMPHASES, machinery } from './machinery';
import { COMET_REACH, COMET_SPEED, cometEnd, cometStart, courseAt, PIECE_RADIUS, routeNearest, SHOWER_LENGTH, SHOWER_WIDE, type Comet } from './comet';
import { msg, t } from '../i18n/i18n';

/**
 * The President's Fleet: every Host on one side against a battleship of the President, one in
 * every round. The President wants blood and sends battleships into the ring, because he can.
 * The Hosts win the round when it goes down; when the time runs out first, it got away, and
 * the President wins.
 *
 * A battleship, a gilded carrier 1,150 m long, circles the field along its outer rocks like a shark. It has
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
 * on the far side is hidden from the others. Its hangar deck runs open through it from flank to
 * flank (see HANGARS): ships fly through, beams and sight pass along it. A torpedo locks on a part as on a ship and goes off
 * on it, or on the hull; it counts TORPEDO_HITS hits on every part it goes off near.
 *
 * Online the lead browser flies the battleship and sends where it is with the round clock (see
 * Fleet.toState); every laser hit on a part goes to every browser, so all count the same hits.
 * Each browser fires the batteries at the ships it runs, and burns them in the plume.
 */
export type ZoneKind = 'battery' | 'drive' | 'reactor';
/**
 * The battleship's size (a factor). Its hull, superstructure and parts are laid out in design
 * units and grown by FLEET_SCALE into the world, while its hangar deck keeps its size in world
 * units, made for a fighter to fly through (see HANGAR_WIDTH): at 1.5 the hull is 1,065 m long
 * and a tunnel 75 m wide is a narrow slot in its flank, as a hangar is in a ship of that size.
 * What the battleship does (speeds, hits, ranges, the plume's reach, the blast) does not grow
 * with it.
 */
export const FLEET_SCALE = 1.5;
/** A length of the battleship's design in world units. */
const sized = (length: number) => length * FLEET_SCALE;
/** A geometry of the battleship's design grown into the world. */
const grow = <T extends THREE.BufferGeometry>(geometry: T): T => geometry.scale(FLEET_SCALE, FLEET_SCALE, FLEET_SCALE);
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
const TORPEDO_REACH = 400;
/** Points for a hit on a part, for the hit that breaks one, and for every ship of the side when the battleship goes down. */
export const FLEET_HIT_POINTS = 10;
export const ZONE_POINTS: Record<ZoneKind, number> = { battery: 150, drive: 200, reactor: 1000 };
export const SINK_POINTS = 500;
/** The battleship comes this long after the round starts (s of field time). */
export const ARRIVAL = 12;
/** A battleship circles the center (see ORBIT) at FLEET_SPEED (units/s, 30 m/s); it turns at FLEET_TURN (rad/s). */
export const FLEET_SPEED = 600;
const FLEET_TURN = 0.12;
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
/** Nothing of a battleship lies farther than this from its center (units, 640 m): its stern's nozzles at 580 m, and room. */
const REACH = sized(8500);
/** It comes in from this far out (units, 2.7 km), its whole hull inside the arena's edge. */
const ENTRY = ARENA_LIMIT - REACH;
/** How far out from the center's axis it comes in at a height (units): as far as its whole hull stays inside the arena's edge. */
const entryRadius = (height: number) => Math.sqrt(ENTRY * ENTRY - height * height);
/** The nozzles' plane behind the center (units, 580 m along the hull), and how far the plume reaches out from its axis there, around both drive bells (units, 105 m). */
const NOZZLES = sized(7700);
const PLUME_BASE = sized(1400);
/** The flight deck's height above the hull's center, and the keel's depth below it (design units). */
const DECK_TOP = 1300;
const KEEL = -1100;
/**
 * The battleship's sensors see a comet's route (see comet.ts) FLEET_LOOKOUT seconds before its
 * head passes nearest it; while that route runs within FLEET_CLEAR of its center (units, 975 m:
 * the shower's width, a piece, its own reach and 75 m to spare) it leaves its orbit and burns
 * straight away from the route at EVADE_SPEED (units/s, 50 m/s), turning onto that course
 * EVADE_BURN times as hard as onto its orbit, until the shower has passed. Clear of the route
 * by 975 m from right on it takes it about 21 s. With its drives shot out it cannot get away.
 */
const FLEET_LOOKOUT = 40;
const FLEET_CLEAR = SHOWER_WIDE + PIECE_RADIUS + REACH + 1500;
const EVADE_SPEED = 1000;
const EVADE_BURN = 2;
/** How fast the battleship takes up its orbit's course (per s). */
const STEER = 0.3;
/**
 * Its orbit runs at a height of its own above or below the field's plane, its lane: of the
 * heights within LANE_MAX (units, 600 m) in steps of LANE_STEP (25 m), the one nearest the
 * plane whose band around the center (where its level hull reaches on the orbit, from its entry
 * in to the orbit) the fewest pieces of the field cross on their way, each with ROCK_CLEAR to
 * spare. It follows from the field as laid out, the same on every browser: over the Rings' sheet
 * of ice, say. It comes in at that height and holds it.
 */
const LANE_MAX = 12000;
const LANE_STEP = 500;
/** Its hull keeps this far from every piece of the field (units, 50 m), the piece's whole reach counted. */
const ROCK_CLEAR = 1000;
/**
 * Its sensors follow each piece of the field ROCK_LOOKOUT seconds ahead (in steps of
 * ROCK_STEP), where the field time puts it, against its own course straight on: a piece that
 * would come within ROCK_CLEAR of the hull pushes it aside, square to their closing, at up to
 * ROCK_EVADE (units/s, 50 m/s) on top of its course, the harder the sooner the contact, turning
 * onto that course EVADE_BURN times as hard as onto its orbit. Its thrusters do this, so it
 * works with the drives shot out too. It turns its hull only where the turn stays clear of rock.
 */
const ROCK_LOOKOUT = 20;
const ROCK_STEP = 0.5;
const ROCK_EVADE = 1000;
/** How many points along a piece's orbit the lane is checked at. */
const LANE_SAMPLES = 120;
/**
 * A cross section of the hull at `z` (in its frame; the bow points along -z): the flight
 * deck on top at DECK_TOP, `half` wide to each side; the armored belt drops straight from the
 * deck's edges to `belt`; below it the hull slopes in to the keel, `keelHalf` wide at `keel`.
 */
type Section = { z: number; half: number; top: number; belt: number; keelHalf: number; keel: number };
/**
 * The hull from bow to stern (design units), straight between its sections: a dagger 83 m wide
 * at the bow, its keel rising there, widening to 285 m 350 m aft and to 345 m at the
 * superstructure's back, narrowing again over the drive section to the stern plate 1,065 m
 * from the bow.
 */
const SECTIONS: readonly Section[] = [
  { z: -7200, half: 550, top: DECK_TOP, belt: 900, keelHalf: 200, keel: 500 },
  { z: -2500, half: 1900, top: DECK_TOP, belt: -100, keelHalf: 1200, keel: KEEL },
  { z: 5400, half: 2300, top: DECK_TOP, belt: -200, keelHalf: 1200, keel: KEEL },
  { z: 7000, half: 1900, top: 1200, belt: -300, keelHalf: 1000, keel: -900 },
];
/**
 * A battleship circles the center this far out (units, 2.5 km), its inner flank along the outer
 * rocks and its outer one some 800 m inside the arena's edge, so a pilot can attack it from
 * every side.
 */
const ORBIT = FIELD_RADIUS * 1.05 + sized(Math.max(...SECTIONS.map((s) => s.half)));
/** Where the batteries sit (design units, in its frame): two on sponsons forward, two on the deck's edges beside the superstructure, two under the keel. */
const BATTERY_MOUNTS: readonly (readonly [number, number, number])[] = [
  [1800, DECK_TOP + 150, -4000],
  [-1800, DECK_TOP + 150, -4000],
  [1800, DECK_TOP + 150, 1500],
  [-1800, DECK_TOP + 150, 1500],
  [0, KEEL - 350, -3000],
  [0, KEEL - 350, 2500],
];
/** How far the armored casemate of the bow's hangar door stands out of the hull (design units). */
const DOOR_DEPTH = 220;
/**
 * The hangar deck, in world units whatever the battleship's size: three tunnels run straight
 * across the hull under the flight deck, from the belt of one flank to the other's (310 to
 * 340 m), centered at HANGARS along the hull (units, in its frame), HANGAR_PITCH of the design
 * apart. Each is HANGAR_WIDTH clear along the hull (75 m) between the machinery on its walls,
 * and runs from HANGAR_FLOOR to HANGAR_CEILING (53 m), the flight deck 49 m thick above it. A
 * fighter's hit sphere (34 m across) has 20 m to spare to either side and 9.5 m above and below:
 * room to fly through at fighting speed, little to wander. The walls between them are 60 m
 * thick, the machinery on both sides included. Nothing in them collides but floor, ceiling and
 * walls, so rays, sight and torpedoes pass through along a tunnel.
 */
export const HANGAR_WIDTH = 1500;
export const HANGAR_FLOOR = -80;
export const HANGAR_CEILING = 980;
const HANGAR_PITCH = 1800;
export const HANGARS: readonly number[] = [0, 1, 2].map((i) => sized(1000 + i * HANGAR_PITCH));
/** The mouths are cut this much wider than a tunnel's clear width on both sides (units, 3 m), showing the front layer of the machinery on its walls. */
const HANGAR_REVEAL = 60;
/**
 * The machinery on a hangar's walls (see game/machinery) reaches this deep behind the clear
 * width's edge (units, 6 m): all of it inside the wall's collider, so nothing in a tunnel stands
 * in the way, and deep enough to lie in layers, one thing in front of another.
 */
const HANGAR_MACHINERY = 120;
/**
 * A tunnel's machinery is drawn in full only while the camera is in the hangar deck or this close
 * to it (units, 100 m: two thirds of a second at 150 m/s, so it is there before a ship flies in),
 * and only the tunnel's nearest the camera along the hull: from inside one tunnel the others are
 * out of sight. Everywhere else each wall is a flat picture of it (see Elevation), a plate of
 * two triangles.
 */
const HANGAR_APPROACH = 2000;
/**
 * The walls' pictures share one texture with the hangar deck's baked colors: six walls one above
 * another, ELEVATION_ROWS each, ELEVATION_WIDTH across (a texel about 33 cm across the hull at the
 * widest wall and 32 cm up), and a white block above them that every other piece of the deck
 * samples, so its vertex colors show as they are and all of it stays one mesh.
 */
const ELEVATION_WIDTH = 1024;
const ELEVATION_ROWS = 168;
const ELEVATION_HEIGHT = 1024;
/** Where the white block lies in the texture (its middle), for every piece that is not a wall's picture. */
const WHITE_UV = [0.5, (ELEVATION_HEIGHT - 8) / ELEVATION_HEIGHT] as const;
/** The hull's faces are laid in strips no longer than this along it (units, 50 m; see hullBetween). */
const HULL_STRIP = 1000;
/** Where the Ministry's seal sits on both flanks (design units along the hull). */
const SEAL_Z = -1000;
/** The lights along the deck's edges run forward this fast (lane lengths a second). */
const PROCESSION = 0.6;
const BATTERIES = BATTERY_MOUNTS.length;

/** A part: its kind, where it sits and how big it is (in the battleship's frame), the way it faces (from that side it shows itself) and its mesh. */
type Zone = { kind: ZoneKind; at: THREE.Vector3; radius: number; face: THREE.Vector3; mesh: THREE.Object3D };
type Box = { center: THREE.Vector3; half: THREE.Vector3 };
/** A battery's shot (see Fleet.firing): the part that fires and the number of its shot. */
type Shot = { zone: number; shot: number };

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
const EYE = new THREE.Vector3();
const UNDO = new THREE.Matrix4();
const bulkPoint = new THREE.Vector3();
const bulkLocal = new THREE.Vector3();
const bulkNormal = new THREE.Vector3();
const bulkClosest = new THREE.Vector3();
const bulkTurn = new THREE.Quaternion();
const there = new THREE.Vector3();
const course = new THREE.Vector3();
const closing = new THREE.Vector3();
const away = new THREE.Vector3();
const clear = new THREE.Vector3();
const turned = new THREE.Quaternion();

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

/** The hull's cross section at `z` (design units), between the two sections around it. */
function sectionAt(z: number): Section {
  let i = 0;
  while (i < SECTIONS.length - 2 && z > SECTIONS[i + 1].z) i++;
  const a = SECTIONS[i];
  const b = SECTIONS[i + 1];
  const t = THREE.MathUtils.clamp((z - a.z) / (b.z - a.z), 0, 1);
  const mix = (key: Exclude<keyof Section, 'z'>) => THREE.MathUtils.lerp(a[key], b[key], t);
  return { z, half: mix('half'), top: mix('top'), belt: mix('belt'), keelHalf: mix('keelHalf'), keel: mix('keel') };
}

/** A section of the design in the world. */
function grown(s: Section): Section {
  return { z: sized(s.z), half: sized(s.half), top: sized(s.top), belt: sized(s.belt), keelHalf: sized(s.keelHalf), keel: sized(s.keel) };
}

/** The hull's cross section at `z` in the world (units). */
function hullAt(z: number): Section {
  return grown(sectionAt(z / FLEET_SCALE));
}

/**
 * A point on a flank's slope below the belt at `z` (design units along the hull), `down` of the way
 * from the belt's lower edge (0) to the keel's (1), `lift` out from its face along its normal.
 */
function slopePoint(side: number, z: number, down: number, lift: number, target = new THREE.Vector3()): THREE.Vector3 {
  const s = sectionAt(z);
  const across = s.half - s.keelHalf;
  const fall = s.belt - s.keel;
  const length = Math.hypot(across, fall);
  return target.set(side * (THREE.MathUtils.lerp(s.half, s.keelHalf, down) + (lift * fall) / length), THREE.MathUtils.lerp(s.belt, s.keel, down) - (lift * across) / length, z);
}

/** The spans along the hull a hangar's mouths take (its clear width and the reveal on both sides). */
const HANGAR_SPANS: readonly (readonly [number, number])[] = HANGARS.map((z) => [z - HANGAR_WIDTH / 2 - HANGAR_REVEAL, z + HANGAR_WIDTH / 2 + HANGAR_REVEAL]);

/** How far the hangar deck reaches out from the hull's middle at its widest: its flanks (units). */
const DECK_REACH = Math.max(...HANGAR_SPANS.flat().map((z) => hullAt(z).half));

/**
 * The hangar deck as the motes' shelter (see world/space): from the hull's frame into a box of
 * ±1 around all three tunnels and the machinery on their walls, flank to flank, floor to
 * ceiling. The walls between the tunnels lie in it too, where no mote shows anyway.
 */
const SHELTER_BOX = (() => {
  const [z0, z1] = [HANGARS[0] - HANGAR_WIDTH / 2 - HANGAR_MACHINERY, HANGARS[HANGARS.length - 1] + HANGAR_WIDTH / 2 + HANGAR_MACHINERY];
  return new THREE.Matrix4()
    .makeScale(1 / DECK_REACH, 2 / (HANGAR_CEILING - HANGAR_FLOOR), 2 / (z1 - z0))
    .multiply(new THREE.Matrix4().makeTranslation(0, -(HANGAR_FLOOR + HANGAR_CEILING) / 2, -(z0 + z1) / 2));
})();

/** How far the deck's edge moves out per unit along the hull at `z` (design units; the belt's slant in plan). */
function flare(z: number) {
  const a = sectionAt(z - 1);
  const b = sectionAt(z + 1);
  return (b.half - a.half) / 2;
}

/**
 * The hull between two sections in the world, flat-faced: deck, belts, the slopes to the keel and the keel,
 * each face with its own corners (so its normal is the face's), the ends closed where `caps` says,
 * the hangars' mouths cut out of both belts from HANGAR_FLOOR to HANGAR_CEILING over the spans
 * along the hull in `holes` (in order).
 */
function hullBetween(a: Section, b: Section, caps: { front: boolean; back: boolean }, holes: readonly (readonly [number, number])[] = []): THREE.BufferGeometry {
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
  // a corner of the outline at `z`, between the two sections
  const at = (k: number, z: number, y?: number) => {
    const t = (z - a.z) / (b.z - a.z);
    return new THREE.Vector3(THREE.MathUtils.lerp(front[k][0], back[k][0], t), y ?? THREE.MathUtils.lerp(front[k][1], back[k][1], t), z);
  };
  // the faces in strips at most HULL_STRIP long: a slope is twisted between two sections, and
  // shorter strips keep it close to the surface the signs on it follow (see slopePoint)
  const strips = Math.ceil((b.z - a.z) / HULL_STRIP);
  for (let i = 0; i < 6; i++) {
    const j = (i + 1) % 6;
    // a belt (straight down from the deck's edge) with the hangars' mouths cut out of it
    const belt = (i === 1 || i === 5) && holes.length > 0;
    if (belt) {
      const [top, low] = i === 1 ? [i, j] : [j, i];
      face([at(top, a.z, HANGAR_CEILING), at(top, a.z), at(top, b.z), at(top, b.z, HANGAR_CEILING)], axis);
      face([at(low, a.z), at(low, a.z, HANGAR_FLOOR), at(low, b.z, HANGAR_FLOOR), at(low, b.z)], axis);
      let from = a.z;
      for (const [z0, z1] of [...holes, [b.z, b.z]]) {
        if (z0 > from) face([at(top, from, HANGAR_FLOOR), at(top, from, HANGAR_CEILING), at(top, z0, HANGAR_CEILING), at(top, z0, HANGAR_FLOOR)], axis);
        from = z1;
      }
      continue;
    }
    for (let k = 0; k < strips; k++) {
      const z0 = THREE.MathUtils.lerp(a.z, b.z, k / strips);
      const z1 = THREE.MathUtils.lerp(a.z, b.z, (k + 1) / strips);
      face([at(i, z0), at(j, z0), at(j, z1), at(i, z1)], axis);
    }
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
  /** The hangar walls' machinery in full, a mesh for each tunnel from the bow aft, each drawn only while the camera is in it or close to it (see view). */
  readonly machinery: THREE.Mesh[];
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
  /** Everything of it a piece of the field must keep out of: the hull's boxes, the dome's whatever its phase, and the hangar tunnels. */
  private readonly bulk: Box[] = [];
  /** The height its orbit runs at (units, see LANE_MAX). */
  readonly lane: number;

  /**
   * A battleship from `seed`, flying clear of the pieces of `field` (none in a test without it),
   * its lane laid out from the field as it stands now, its hull ROCK_CLEAR clear of a `sheet`
   * that half thick drawn through the field's plane (the Rings of Saturn's, see RING_SHEET).
   */
  constructor(
    private readonly seed: number,
    private readonly field: AsteroidField | null = null,
    sheet = 0,
  ) {
    // A carrier refitted for the President, fresh from the newest dock: a heavy hull of dark
    // armor, polished, gilded on its edges, its turrets and its bridge; the runway in the
    // regime's deep red, warm light in its hangars and in rows of windows, the regime's orange
    // neon running along the deck's edges in a procession
    // The armor is dark gunmetal, not a black mirror: metal enough to glint and mirror the sky
    // (its metalness 0.6 in the plates' finish, see armorSurface), dielectric enough that the sun
    // and the sky's light show its form on every face; its panel lines, welds, stepped plates,
    // hatches and ports are a normal map at their real size, the lacquer over them smooth. The gold is plain
    // polished metal without the plates, rough enough that the sun spreads along its edges.
    const plating = armorSurface(seed);
    const armor = this.material(
      lacquer(
        new THREE.MeshPhysicalMaterial({
          color: 0x5a606b,
          map: plating.map,
          roughnessMap: plating.orm,
          metalnessMap: plating.orm,
          roughness: 1,
          metalness: 1,
          normalMap: plating.normal,
          envMap: shine(),
          envMapIntensity: 1.2,
          clearcoat: 0.6,
          clearcoatRoughness: 0.12,
        }),
      ),
    );
    const gold = this.material(lacquer(new THREE.MeshPhysicalMaterial({ color: 0xe2aa3e, metalness: 1, roughness: 0.34, envMap: shine(), envMapIntensity: 2.6, clearcoat: 0.5, clearcoatRoughness: 0.2 })));
    const runway = this.material(new THREE.MeshStandardMaterial({ color: 0x4a0b10, metalness: 0.3, roughness: 0.6 }));
    const recess = this.material(new THREE.MeshStandardMaterial({ color: 0x07080a, roughness: 0.9 }));
    const gunmetal = this.material(new THREE.MeshStandardMaterial({ color: 0x3c414c, metalness: 0.6, roughness: 0.45, flatShading: true }));
    const bell = this.material(new THREE.MeshStandardMaterial({ color: 0x25272c, metalness: 0.8, roughness: 0.5, side: THREE.DoubleSide }));
    this.burnt = this.material(new THREE.MeshStandardMaterial({ color: 0x0a0a0a, roughness: 1 }));
    const light = (r: number, g: number, b: number, strength: number) => this.material(new THREE.MeshBasicMaterial({ color: new THREE.Color(r, g, b).multiplyScalar(strength), toneMapped: false }));
    // warm light in the windows and hangars, white on the deck, the drives' plasma white-hot; the
    // hangars' lamps bright under their dark ceilings, so a tunnel reads lit without blooming into
    // one block from outside
    const lit = light(1, 0.8, 0.55, 1.2);
    // the hangar deck's inside, lit by its own lamps in the colors baked into its corners (see
    // lamplit), so its bulkheads read lit where neither the sun nor the sky reaches
    const hangar = this.material(new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false }));
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
    // list of boxes in the ship's frame (the bow points along -z, as every ship's nose), in world
    // units. The hull and the hangar deck are laid out in the world (lay, layShaped, collide,
    // rail), everything else in design units and grown into the world (put, shaped, solid,
    // block, bar); the armor's texture coordinates are laid in the world, so its plates keep
    // their size
    const parts = new Map<THREE.Material, THREE.BufferGeometry[]>();
    const lay = (geometry: THREE.BufferGeometry, material: THREE.Material) => {
      const list = parts.get(material) ?? [];
      list.push(geometry);
      parts.set(material, list);
    };
    const layShaped = (geometry: THREE.BufferGeometry, material: THREE.Material) => lay(boxUv(geometry, ARMOR_TILE, 'lengthwise'), material);
    const collide = (center: readonly number[], size: readonly number[]) => this.colliders.push({ center: new THREE.Vector3(center[0], center[1], center[2]), half: new THREE.Vector3(size[0], size[1], size[2]).multiplyScalar(0.5) });
    const along = new THREE.Vector3(0, 0, 1);
    /** A bar `wide` by `high` from one point to another (trim, rails, recesses), not colliding, in the world. */
    const rail = (from: THREE.Vector3, to: THREE.Vector3, wide: number, high: number, material: THREE.Material) => {
      const span = to.clone().sub(from);
      const turned = new THREE.Quaternion().setFromUnitVectors(along, span.clone().normalize());
      const middle = from.clone().lerp(to, 0.5);
      layShaped(new THREE.BoxGeometry(wide, high, span.length()).applyQuaternion(turned).translate(middle.x, middle.y, middle.z), material);
    };
    const put = (geometry: THREE.BufferGeometry, material: THREE.Material) => lay(grow(geometry), material);
    const shaped = (geometry: THREE.BufferGeometry, material: THREE.Material) => layShaped(grow(geometry), material);
    const solid = (center: readonly number[], size: readonly number[]) => collide(center.map(sized), size.map(sized));
    const block = (center: [number, number, number], size: [number, number, number], material: THREE.Material, collides = true) => {
      shaped(new THREE.BoxGeometry(...size).translate(...center), material);
      if (collides) solid(center, size);
    };
    const bar = (from: THREE.Vector3, to: THREE.Vector3, wide: number, high: number, material: THREE.Material) =>
      rail(from.clone().multiplyScalar(FLEET_SCALE), to.clone().multiplyScalar(FLEET_SCALE), sized(wide), sized(high), material);
    /** A flat panel `width` long and `height` high on a flank's belt at `z`, lying on its slant. */
    const onBelt = (side: number, z: number, y: number, width: number, height: number, lift = 4) =>
      new THREE.PlaneGeometry(width, height).rotateY(side * (Math.PI / 2 + Math.atan(flare(z)))).translate(side * (sectionAt(z).half + lift), y, z);
    const flank = (side: number, z: number, y: number, lift: number) => new THREE.Vector3(side * (sectionAt(z).half + lift), y, z);
    /** The same in the world. */
    const hullFlank = (side: number, z: number, y: number, lift: number) => new THREE.Vector3(side * (hullAt(z).half + lift), y, z);
    /**
     * A sign `width` long at `z` on a flank's slope below the belt, `height` down the slope from
     * `down` of its way to the keel (design units), following its face in steps of 15 m and
     * reading from outside.
     */
    const onSlope = (side: number, z: number, width: number, height: number, down = 0.1) => {
      const steps = Math.ceil(width / 200);
      const positions: number[] = [];
      const uvs: number[] = [];
      const index: number[] = [];
      const point = new THREE.Vector3();
      for (let k = 0; k <= steps; k++) {
        // left to right as seen from outside: towards the bow on the right flank
        const u = k / steps;
        const at = z + side * (0.5 - u) * width;
        const length = Math.hypot(sectionAt(at).half - sectionAt(at).keelHalf, sectionAt(at).belt - sectionAt(at).keel);
        for (const v of [0, 1]) {
          positions.push(...slopePoint(side, at, down + (1 - v) * (height / length), 25, point).toArray());
          uvs.push(u, v);
        }
        if (k > 0) index.push(2 * k - 2, 2 * k, 2 * k + 1, 2 * k - 2, 2 * k + 1, 2 * k - 1);
      }
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
      geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
      geometry.setIndex(index);
      geometry.computeVertexNormals();
      return geometry;
    };

    // the hull, section by section. It collides first in its core, between the bow's taper and
    // the drive section, from the deck to the keel: a box for every stretch between the hangars
    // and two for each hangar, under its floor and over its ceiling (a ship pressed into it
    // leaves through the nearest of its faces, into a hangar where one is nearest, not between
    // two short boxes), then in boxes a hundred meters long or less: the belt's under the deck's
    // full width, the slopes' halfway out between belt and keel. Where a hangar runs through, the
    // belt's box leaves its clear width open: a box over it up to the deck and one under it down
    // to the belt's lower edge
    const [, waist, back] = SECTIONS.map(grown);
    const [keel, deck] = [sized(KEEL), sized(DECK_TOP)];
    const core = (z0: number, z1: number, bottom: number, top: number) => collide([0, (top + bottom) / 2, (z0 + z1) / 2], [2 * waist.keelHalf, top - bottom, z1 - z0]);
    let cored = waist.z;
    for (const z of HANGARS) {
      core(cored, z - HANGAR_WIDTH / 2, keel, deck);
      core(z - HANGAR_WIDTH / 2, z + HANGAR_WIDTH / 2, keel, HANGAR_FLOOR);
      core(z - HANGAR_WIDTH / 2, z + HANGAR_WIDTH / 2, HANGAR_CEILING, deck);
      cored = z + HANGAR_WIDTH / 2;
    }
    core(cored, back.z, keel, deck);
    SECTIONS.forEach((a, i) => {
      const b = SECTIONS[i + 1];
      if (!b) return;
      // the hull and its colliders in the world, around the hangars' mouths: a mouth reaching
      // past a section is cut out of both hull pieces, each its own share
      const [wa, wb] = [grown(a), grown(b)];
      const holes = HANGAR_SPANS.filter(([z0, z1]) => z1 > wa.z && z0 < wb.z).map(([z0, z1]) => [Math.max(z0, wa.z), Math.min(z1, wb.z)] as const);
      layShaped(hullBetween(wa, wb, { front: i === 0, back: i === SECTIONS.length - 2 }, holes), armor);
      // the stretches of hull between the hangars' clear widths, and those widths
      const stretches: { z0: number; z1: number; open: boolean }[] = [];
      const closed = (z0: number, z1: number) => {
        const pieces = Math.ceil((z1 - z0) / 2000);
        for (let k = 0; k < pieces; k++) stretches.push({ z0: THREE.MathUtils.lerp(z0, z1, k / pieces), z1: THREE.MathUtils.lerp(z0, z1, (k + 1) / pieces), open: false });
      };
      let from = wa.z;
      for (const z of HANGARS) {
        if (z < wa.z || z > wb.z) continue;
        closed(from, z - HANGAR_WIDTH / 2);
        stretches.push({ z0: z - HANGAR_WIDTH / 2, z1: z + HANGAR_WIDTH / 2, open: true });
        from = z + HANGAR_WIDTH / 2;
      }
      closed(from, wb.z);
      for (const { z0, z1, open } of stretches) {
        const s = hullAt((z0 + z1) / 2);
        const length = z1 - z0;
        if (open) {
          collide([0, (s.top + HANGAR_CEILING) / 2, s.z], [2 * s.half, s.top - HANGAR_CEILING, length]);
          collide([0, (HANGAR_FLOOR + s.belt) / 2, s.z], [2 * s.half, HANGAR_FLOOR - s.belt, length]);
        } else collide([0, (s.top + s.belt) / 2, s.z], [2 * s.half, s.top - s.belt, length]);
        collide([0, (s.belt + s.keel) / 2, s.z], [s.half + s.keelHalf, s.belt - s.keel, length]);
      }
      // in the design: gilded along the deck's edges, the belt's lower edge and the keel's; under
      // the deck's edge a trench with a row of lit windows, gilded above and below
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

    // the forward belts carry strakes of extra armor under the trench, three belts running along
    // the flank, each strake of its own length (68 to 195 m) so their butts never line up in a bond
    const STRAKES = [
      [1500, 900, 2100, 1200, 2600],
      [2400, 1100, 1700, 2000],
      [1300, 2600, 1000, 1900],
    ];
    const strakesEnd = SECTIONS[1].z - 600;
    for (const side of [-1, 1]) {
      STRAKES.forEach((lengths, row) => {
        const top = DECK_TOP - 320 - row * 340;
        // the belt falls towards the stern, so a strake starts where the flank is tall enough for it
        let z = SECTIONS[0].z + 300;
        while (z < strakesEnd && sectionAt(z).belt > top - 340) z += 100;
        for (let i = 0; z < strakesEnd - 400; i++) {
          const length = Math.min(lengths[i % lengths.length], strakesEnd - z);
          bar(flank(side, z, top - 160, 14), flank(side, z + length - 20, top - 160, 14), 30, 300, armor);
          z += length;
        }
      });
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
        const lamp = grow(new THREE.BoxGeometry(70, 40, 140).translate(side * (sectionAt(z).half - 90), DECK_TOP + 20, z));
        lamp.setAttribute('lane', new THREE.BufferAttribute(new Float32Array(lamp.attributes.position.count).fill(1 - (z - bow) / (stern - bow)), 1));
        lights.push(lamp);
      }
    }
    // the bow's hangar, too low for a fighter (20 m), shut: an armored casemate standing
    // DOOR_DEPTH out of the hull, gilded around its mouth, its blast door just inside, a lit seam
    // down its middle and warning lamps over it. It collides as one box
    {
      const width = 860;
      const height = 260;
      const deep = DOOR_DEPTH;
      const rim = 60;
      const frame = new THREE.Matrix4().makeBasis(new THREE.Vector3(1, 0, 0), UP, new THREE.Vector3(0, 0, -1)).setPosition(0, DECK_TOP - 200, bow);
      const add = (geometry: THREE.BufferGeometry, material: THREE.Material) => shaped(geometry.applyMatrix4(frame), material);
      add(new THREE.BoxGeometry(width, height, 40).translate(0, 0, deep - 60), armor);
      add(new THREE.BoxGeometry(12, height, 10).translate(0, 0, deep - 36), marking);
      for (let x = -width / 2 + 60; x < width / 2 - 30; x += 90) add(new THREE.BoxGeometry(40, 20, 20).translate(x, height / 2 - 20, deep - 30), lit);
      for (const s of [-1, 1]) {
        add(new THREE.BoxGeometry(width + 2 * rim, rim, deep).translate(0, s * (height / 2 + rim / 2), deep / 2), armor);
        add(new THREE.BoxGeometry(rim, height, deep).translate(s * (width / 2 + rim / 2), 0, deep / 2), armor);
        add(new THREE.BoxGeometry(width + 2 * rim + 30, 30, 30).translate(0, s * (height / 2 + rim), deep), gold);
        add(new THREE.BoxGeometry(30, height + 2 * rim, 30).translate(s * (width / 2 + rim), 0, deep), gold);
      }
      solid([0, DECK_TOP - 200, bow - deep / 2], [width + 2 * rim, height + 2 * rim, deep]);
    }

    // the hangar deck, in the world: each tunnel under a ceiling of dark steel girders, lit warm by rows of lamps between them, the deck dark
    // with lit markings along it (a dashed line down its middle, its edges, a bar at each mouth),
    // dense machinery on its walls (see game/machinery), a gilded frame and a lamp at each corner
    // of its mouths. All of it merged into the hull's meshes: no draw call of its own. The
    // machinery reaches HANGAR_MACHINERY into the walls, inside their colliders. Inside, the
    // hull's shadow keeps out the sun and the walls hide the sky, so the deck and the machinery
    // carry their light in their corners (see lamplit) instead of taking the scene's
    {
      const random = new Randomizer(seed * 7 + 3);
      /** The light band along each wall's top (linear RGB): warm, dim enough not to bloom into one block from outside. */
      const glow = new THREE.Color(1, 0.6, 0.28).multiplyScalar(0.32);
      /** The lamps' warm light on what faces them squarely. */
      const lamps = new THREE.Color(1, 0.74, 0.48);
      /**
       * `geometry` in `color` as the hangar's lamps light it, baked into its corners: a face
       * looking up at them in full, a face standing upright grazed, brighter towards the ceiling,
       * a face looking down only by what the deck throws back; with `glowing`, `color` as it is.
       * On a wall (its clear width's edge at `face`, the tunnel towards `facing` along the hull),
       * the deeper a corner lies in the wall the less light reaches it, and a face turned away
       * from the tunnel less than one turned towards it.
       */
      const baked = (geometry: THREE.BufferGeometry, color: THREE.Color, glowing = false, face = 0, facing = 0) => {
        const position = geometry.getAttribute('position');
        const normal = geometry.getAttribute('normal');
        const colors = new Float32Array(position.count * 3);
        const shown = new THREE.Color();
        for (let i = 0; i < position.count; i++) {
          const up = THREE.MathUtils.clamp((position.getY(i) - HANGAR_FLOOR) / (HANGAR_CEILING - HANGAR_FLOOR), 0, 1);
          const towards = normal.getY(i);
          let shade = towards > 0.5 ? 0.75 : towards < -0.5 ? 0.12 : 0.18 + 0.82 * up * up;
          if (facing !== 0) {
            const deep = THREE.MathUtils.clamp((facing * (face - position.getZ(i))) / HANGAR_MACHINERY, 0, 1);
            shade *= (1 - 0.72 * deep) * (0.8 + 0.3 * facing * normal.getZ(i));
          }
          if (glowing) shown.copy(color);
          else shown.copy(color).multiply(lamps).multiplyScalar(shade);
          shown.toArray(colors, i * 3);
        }
        geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
        const uv = new Float32Array(position.count * 2);
        for (let i = 0; i < uv.length; i += 2) [uv[i], uv[i + 1]] = WHITE_UV;
        geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
        return geometry;
      };
      const lamplit = (geometry: THREE.BufferGeometry, color: THREE.Color, glowing = false) => lay(baked(geometry, color, glowing), hangar);
      // the walls' pictures, painted as their machinery is laid out, and the machinery itself
      const pictures = new Uint8Array(ELEVATION_WIDTH * ELEVATION_HEIGHT * 4).fill(255);
      const detail: THREE.BufferGeometry[][] = HANGARS.map(() => []);
      /** What shows where no machinery lies: the wall's dark back in the lamps' light. */
      const behind = new THREE.Color(0x0b0c0e);
      let walls = 0;
      const deck = new THREE.Color(0x2a2d33);
      /** The ceiling's plates and its girders: steel, dark where only the deck throws light up, lit on their flanks. */
      const steel = new THREE.Color(0x6b7280);
      const girder = new THREE.Color(0x565c66);
      /** A flat panel through four corners, facing `facing`. */
      const panel = (corners: THREE.Vector3[], facing: THREE.Vector3) => {
        const normal = new THREE.Vector3().subVectors(corners[1], corners[0]).cross(new THREE.Vector3().subVectors(corners[2], corners[0]));
        const ordered = normal.dot(facing) < 0 ? [...corners].reverse() : corners;
        const geometry = new THREE.BufferGeometry().setFromPoints(ordered);
        geometry.setIndex([0, 1, 2, 0, 2, 3]);
        geometry.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 1, 0, 1, 1, 0, 1], 2));
        geometry.computeVertexNormals();
        return geometry;
      };
      const across = (z: number, y: number, side: number) => new THREE.Vector3(side * hullAt(z).half, y, z);
      const v3 = (x: number, y: number) => new THREE.Vector3(x, y, 0);
      HANGARS.forEach((center, tunnel) => {
        const front = center - HANGAR_WIDTH / 2;
        const rear = center + HANGAR_WIDTH / 2;
        const [w0, w1] = [front - HANGAR_REVEAL, rear + HANGAR_REVEAL];
        const reach = Math.min(hullAt(w0).half, hullAt(w1).half);
        // floor and ceiling, under and over the machinery too
        const [m0, m1] = [front - HANGAR_MACHINERY, rear + HANGAR_MACHINERY];
        lamplit(panel([across(m0, HANGAR_FLOOR, -1), across(m0, HANGAR_FLOOR, 1), across(m1, HANGAR_FLOOR, 1), across(m1, HANGAR_FLOOR, -1)], UP), deck);
        lamplit(panel([across(m0, HANGAR_CEILING, -1), across(m0, HANGAR_CEILING, 1), across(m1, HANGAR_CEILING, 1), across(m1, HANGAR_CEILING, -1)], new THREE.Vector3(0, -1, 0)), steel);
        // the ceiling's girders, 2 m deep: four along the tunnel, the lamp rows in the bays between
        // them, and ribs across it between the lamps; well clear of a fighter's hull, which keeps
        // more than 9.5 m from the ceiling inside its hit sphere
        for (const z of [-600, -150, 150, 600]) lamplit(new THREE.BoxGeometry(2 * reach, 40, 40).translate(0, HANGAR_CEILING - 20, center + z), girder);
        for (let x = -reach + 300; x < reach - 150; x += 600) lamplit(new THREE.BoxGeometry(30, 30, HANGAR_WIDTH).translate(x, HANGAR_CEILING - 15, center), girder);
        // the machinery on both walls, in the wall's own frame (x across, z out into the tunnel)
        for (const [face, facing] of [
          [front, 1],
          [rear, -1],
        ] as const) {
          const edge = Math.min(hullAt(face).half, hullAt(face - facing * HANGAR_MACHINERY).half);
          const frame = new THREE.Matrix4().makeBasis(new THREE.Vector3(facing, 0, 0), UP, new THREE.Vector3(0, 0, facing)).setPosition(0, 0, face);
          const wall = { reach: edge - 30, edge, floor: HANGAR_FLOOR, ceiling: HANGAR_CEILING, depth: HANGAR_MACHINERY, frame };
          const row = ELEVATION_ROWS * walls++;
          const picture = new Elevation(wall, pictures, ELEVATION_WIDTH, row, ELEVATION_ROWS, behind);
          machinery(random, wall, EMPHASES[tunnel], (geometry, color, glowing) => {
            picture.draw(baked(geometry, color, glowing, face, facing));
            detail[tunnel].push(geometry);
          });
          // the picture on a plate just behind the machinery's back, facing the tunnel: hidden
          // behind the machinery up close, the wall itself from farther
          const plate = new THREE.BufferGeometry().setFromPoints([v3(-edge, HANGAR_FLOOR), v3(edge, HANGAR_FLOOR), v3(edge, HANGAR_CEILING), v3(-edge, HANGAR_CEILING)].map((p) => p.setZ(-HANGAR_MACHINERY - 2).applyMatrix4(frame)));
          plate.setIndex([0, 1, 2, 0, 2, 3]);
          plate.computeVertexNormals();
          const [low, high] = [row / ELEVATION_HEIGHT, (row + ELEVATION_ROWS) / ELEVATION_HEIGHT];
          plate.setAttribute('uv', new THREE.Float32BufferAttribute([0, low, 1, low, 1, high, 0, high], 2));
          plate.setAttribute('color', new THREE.Float32BufferAttribute(new Array(12).fill(1), 3));
          lay(plate, hangar);
        }
        // two rows of lamps under the ceiling, a warm band along each wall's top
        for (const z of [center - HANGAR_WIDTH / 4, center + HANGAR_WIDTH / 4]) for (let x = -reach + 150; x < reach - 100; x += 300) lay(new THREE.BoxGeometry(160, 16, 60).translate(x, HANGAR_CEILING - 10, z), lit);
        for (const z of [front + 10, rear - 10]) lamplit(new THREE.BoxGeometry(2 * reach, 40, 20).translate(0, HANGAR_CEILING - 60, z), glow, true);
        // the deck's markings: a dashed line down the middle, its edges, and a bar at each mouth
        for (let x = -reach + 300; x < reach - 300; x += 400) lay(new THREE.BoxGeometry(200, 4, 30).translate(x, HANGAR_FLOOR + 2, center), marking);
        for (const z of [front + 120, rear - 120]) lay(new THREE.BoxGeometry(2 * reach - 200, 4, 24).translate(0, HANGAR_FLOOR + 2, z), marking);
        for (const side of [-1, 1]) {
          lay(new THREE.BoxGeometry(60, 4, HANGAR_WIDTH - 200).translate(side * (reach - 150), HANGAR_FLOOR + 2, center), marking);
          // the mouth on this flank: gilded around, over the reveals, a lamp at each corner
          const lift = 20;
          const corner = (z: number, y: number) => hullFlank(side, z, y, lift);
          for (const z of [front - HANGAR_REVEAL / 2, rear + HANGAR_REVEAL / 2]) rail(corner(z, HANGAR_FLOOR - HANGAR_REVEAL), corner(z, HANGAR_CEILING + HANGAR_REVEAL / 2), 60, 60, gold);
          rail(corner(w0 - 30, HANGAR_CEILING + 15), corner(w1 + 30, HANGAR_CEILING + 15), 30, 30, gold);
          rail(corner(w0 - 30, HANGAR_FLOOR - 40), corner(w1 + 30, HANGAR_FLOOR - 40), 40, 40, gold);
          for (const z of [w0, w1]) for (const y of [HANGAR_FLOOR + 40, HANGAR_CEILING - 40]) lay(new THREE.BoxGeometry(50, 50, 50).translate(...hullFlank(side, z + (z === w0 ? 50 : -50), y, 30).toArray()), lit);
        }
      });
      const texture = new THREE.DataTexture(pictures, ELEVATION_WIDTH, ELEVATION_HEIGHT, THREE.RGBAFormat);
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.magFilter = THREE.LinearFilter;
      texture.minFilter = THREE.LinearMipmapLinearFilter;
      texture.generateMipmaps = true;
      texture.needsUpdate = true;
      this.textures.push(texture);
      hangar.map = texture;
      // the machinery in full, each tunnel's shown only up close (see view)
      this.machinery = detail.map((list) => {
        const mesh = new THREE.Mesh(this.geometry(mergeGeometries(list)), hangar);
        mesh.visible = false;
        this.root.add(mesh);
        for (const geometry of list) geometry.dispose();
        return mesh;
      });
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
    for (const side of [-1, 1]) for (const y of [2750, 3050, 3350, 3650]) for (let z = 3580; z <= 4420; z += 70) put(new THREE.BoxGeometry(24, 60, 40).translate(side * 455, y, z), lit);
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
    // the slopes under the hangars' mouths; the President's slogan painted along the runway in letters thirty meters high
    const seal = crestTexture();
    const sealed = this.material(new THREE.MeshBasicMaterial({ map: seal, transparent: true, depthWrite: false, toneMapped: false, color: new THREE.Color(1.25, 1.1, 0.9) }));
    const sign = (texture: THREE.Texture | null, geometry: THREE.BufferGeometry, color = new THREE.Color(1.4, 1.4, 1.4)) => {
      if (texture) this.textures.push(texture);
      const material = this.material(new THREE.MeshBasicMaterial({ map: texture, transparent: true, toneMapped: false, color }));
      this.root.add(new THREE.Mesh(this.geometry(grow(geometry)), material));
    };
    if (seal) this.textures.push(seal);
    for (const side of [-1, 1]) {
      this.root.add(new THREE.Mesh(this.geometry(grow(onBelt(side, SEAL_Z, 480, 1100, 1100, 8))), sealed));
      sign(signTexture(t(SLOGANS[side < 0 ? 1 : 2])), onSlope(side, 2800, 4400, 400));
    }
    this.root.add(new THREE.Mesh(this.geometry(grow(new THREE.PlaneGeometry(800, 800).rotateY(Math.PI).translate(0, 3250, 3496))), sealed));
    sign(signTexture(t(SLOGANS[0]), '#ffcf5a', 4096, 800, true), new THREE.PlaneGeometry(3600, 760).rotateX(-Math.PI / 2).rotateY(Math.PI / 2).translate(0, DECK_TOP + 10, -4200), new THREE.Color(1.2, 1, 0.7));

    // the dome over the reactor, an armored hatch on the deck: armor while it is closed (see
    // open); always the last collider
    this.dome = new THREE.Mesh(this.geometry(boxUv(grow(new THREE.CylinderGeometry(450 * Math.SQRT2, 650 * Math.SQRT2, 500, 4).rotateY(Math.PI / 4)), ARMOR_TILE, 'lengthwise')), armor);
    this.dome.position.set(0, sized(DECK_TOP + 250), sized(-1200));
    this.root.add(this.dome);

    // a battery: an armored turret sloping up from its front on the ring it turns on, a gilded
    // collar, three barrels in armored sleeves with muzzle rings, a rangefinder across its roof,
    // cooling vents in its back
    const housing = this.geometry(boxUv(grow(taper(-280, 280, 420, 200, 560, 300, -50, 0)), ARMOR_TILE, 'lengthwise'));
    const collar = this.geometry(boxUv(grow(new THREE.BoxGeometry(640, 60, 640).translate(0, -130, 0)), ARMOR_TILE, 'lengthwise'));
    const barrels = this.geometry(
      grow(mergeGeometries([
        ...[-130, 0, 130].flatMap((x) => [
          new THREE.CylinderGeometry(40, 48, 1000, 8).rotateX(Math.PI / 2).translate(x, 0, -720),
          new THREE.CylinderGeometry(64, 64, 240, 8).rotateX(Math.PI / 2).translate(x, 0, -380),
          new THREE.CylinderGeometry(56, 56, 80, 8).rotateX(Math.PI / 2).translate(x, 0, -1180),
        ]),
        new THREE.CylinderGeometry(300, 320, 60, 16).translate(0, -190, 0),
        new THREE.BoxGeometry(380, 50, 70).translate(0, 145, 120),
        ...[-1, 1].map((s) => new THREE.CylinderGeometry(40, 40, 90, 8).rotateX(Math.PI / 2).translate(s * 210, 145, 120)),
      ])),
    );
    const vents = this.geometry(grow(mergeGeometries([-195, -65, 65, 195].map((x) => new THREE.BoxGeometry(90, 170, 12).translate(x, 0, 282)))));
    for (const at of BATTERY_MOUNTS) {
      const turret = new THREE.Group();
      turret.position.set(...at).multiplyScalar(FLEET_SCALE);
      // under the keel it hangs upside down
      if (at[1] < 0) turret.rotation.z = Math.PI;
      turret.add(new THREE.Mesh(housing, armor), new THREE.Mesh(collar, gold), new THREE.Mesh(barrels, gunmetal), new THREE.Mesh(vents, recess));
      this.root.add(turret);
      // on deck it shows itself above the deck and over its edge, under the keel below it
      const face = at[1] < 0 ? new THREE.Vector3(0, -1, 0) : new THREE.Vector3(Math.sign(at[0]) * 0.5, 1, 0).normalize();
      this.zones.push({ kind: 'battery', at: turret.position.clone(), radius: sized(300), face, mesh: turret });
    }
    const nozzle = this.geometry(grow(new THREE.CylinderGeometry(420, 520, 600, 16).rotateX(Math.PI / 2)));
    for (const side of [-1, 1]) {
      const drive = new THREE.Mesh(nozzle, this.driveGlow);
      drive.position.set(sized(side * 700), 0, sized(7400));
      this.root.add(drive);
      // astern and out to its side, clear of the plume
      this.zones.push({ kind: 'drive', at: drive.position.clone(), radius: sized(480), face: new THREE.Vector3(side * 0.6, 0, 1).normalize(), mesh: drive });
    }
    const reactor = new THREE.Mesh(this.geometry(grow(new THREE.IcosahedronGeometry(420, 1))), this.reactorGlow);
    reactor.position.set(0, sized(DECK_TOP), sized(-1200));
    this.root.add(reactor);
    this.zones.push({ kind: 'reactor', at: reactor.position.clone(), radius: sized(450), face: new THREE.Vector3(0, 1, 0), mesh: reactor });
    solid([0, DECK_TOP + 250, -1200], [1300, 500, 1300]);
    // the plume behind the drives, while they burn
    this.flame = new THREE.Mesh(this.geometry(new THREE.ConeGeometry(PLUME_REACH * PLUME_SPREAD, PLUME_REACH, 24, 1, true).rotateX(-Math.PI / 2).translate(0, 0, NOZZLES + PLUME_REACH / 2)), flame);
    this.flame.visible = false;
    this.root.add(this.flame);
    // the hull throws its shadow and takes those of the rocks; glowing exhaust and glass do neither
    this.root.traverse((o) => {
      if (o instanceof THREE.Mesh) o.castShadow = o.receiveShadow = !(o.material as THREE.Material).transparent;
    });
    // inside the hull, where the sun never reaches
    for (const mesh of this.machinery) mesh.castShadow = false;
    this.hits = this.zones.map(() => 0);
    this.beacons = this.zones.map((_, i) => new Beacon(this, i));
    this.bulk.push(...this.colliders);
    for (const z of HANGARS) {
      this.bulk.push({ center: new THREE.Vector3(0, (HANGAR_FLOOR + HANGAR_CEILING) / 2, z), half: new THREE.Vector3(hullAt(z).half, (HANGAR_CEILING - HANGAR_FLOOR) / 2, HANGAR_WIDTH / 2) });
    }
    this.lane = field ? this.laneOf(field, sheet) : 0;
    this.enter();
  }

  /**
   * Whether a sphere reaches into the battleship's bulk (see bulk), with the battleship at
   * `position` turned by `quaternion` (by default where it is now), whether it is in the field or not.
   */
  reaches(center: THREE.Vector3, radius: number, position = this.position, quaternion = this.quaternion): boolean {
    if (center.distanceTo(position) > REACH + radius) return false;
    bulkPoint.copy(center).sub(position).applyQuaternion(bulkTurn.copy(quaternion).invert());
    for (const box of this.bulk) if (boxContact(bulkLocal.subVectors(bulkPoint, box.center), box.half, radius, bulkNormal, bulkClosest)) return true;
    return false;
  }

  /** The lane its orbit runs at in `field` (see LANE_MAX), clear of a `sheet` that half thick through the field's plane. */
  private laneOf(field: AsteroidField, sheet: number): number {
    // a level hull on its orbit reaches out to its flanks across it, along it to bow and stern,
    // and from the keel up to the masts
    let flank = 0;
    let length = 0;
    let low = 0;
    let high = 0;
    for (const box of this.bulk) {
      flank = Math.max(flank, Math.abs(box.center.x) + box.half.x);
      length = Math.max(length, Math.abs(box.center.z) + box.half.z);
      low = Math.min(low, box.center.y - box.half.y);
      high = Math.max(high, box.center.y + box.half.y);
    }
    // every piece where it goes: around its whole orbit, or where it stands
    const paths = [...field.asteroids.values()].map((piece) => {
      const turns = piece.orbitRate !== 0;
      const period = turns ? (Math.PI * 2) / Math.abs(piece.orbitRate) : 0;
      const at = Array.from({ length: turns ? LANE_SAMPLES : 1 }, (_, k) => field.positionOf(piece, piece.born + (k / LANE_SAMPLES) * period, new THREE.Vector3()));
      return { at, reach: piece.radius + ROCK_CLEAR };
    });
    let lane = 0;
    let fewest = Infinity;
    for (let k = 0; k <= (LANE_MAX / LANE_STEP) * 2; k++) {
      // the plane first, then up and down in turn
      const height = (k % 2 ? 1 : -1) * Math.ceil(k / 2) * LANE_STEP || 0;
      if (sheet > 0 && height + low < sheet + ROCK_CLEAR && height + high > -sheet - ROCK_CLEAR) continue;
      const inner = ORBIT - flank;
      const outer = Math.hypot(entryRadius(height) + flank, length);
      const crossing = paths.filter(({ at, reach }) =>
        at.some((point) => Math.hypot(Math.max(0, inner - Math.hypot(point.x, point.z), Math.hypot(point.x, point.z) - outer), Math.max(0, height + low - point.y, point.y - height - high)) < reach),
      ).length;
      if (crossing < fewest) {
        fewest = crossing;
        lane = height;
      }
    }
    return lane;
  }

  /**
   * Which way its thrusters push it aside from the pieces of the field it would come within
   * ROCK_CLEAR of within ROCK_LOOKOUT on its course straight on (into `target`, up to unit
   * length, longer the sooner the first contact), or null when none would.
   */
  private aside(clock: number, target: THREE.Vector3): THREE.Vector3 | null {
    const field = this.field;
    if (!field) return null;
    target.set(0, 0, 0);
    let pushed = false;
    const speed = this.velocity.length();
    for (const piece of field.asteroids.values()) {
      const reach = piece.radius + ROCK_CLEAR;
      const pace = piece.velocity.length() + Math.abs(piece.orbitRate) * piece.object.position.length();
      if (piece.object.position.distanceTo(this.position) > REACH + reach + (speed + pace) * ROCK_LOOKOUT) continue;
      for (let ahead = 0; ahead <= ROCK_LOOKOUT; ahead += ROCK_STEP) {
        field.positionOf(piece, clock + ahead, there);
        course.copy(this.position).addScaledVector(this.velocity, ahead);
        if (!this.reaches(there, reach, course)) continue;
        // away from the piece: square to how the two close while there is time to pass it, straight away when it is close
        const soon = 1 - ahead / ROCK_LOOKOUT;
        field.positionOf(piece, clock + ahead + ROCK_STEP, closing).sub(there).divideScalar(ROCK_STEP).sub(this.velocity);
        away.subVectors(course, there);
        if (closing.lengthSq() > 1) away.addScaledVector(closing.normalize(), -away.dot(closing));
        // head on: across, or up
        if (away.lengthSq() < 1) away.crossVectors(closing, UP);
        if (away.lengthSq() < 1) away.copy(UP);
        away.normalize().multiplyScalar(1 - soon).add(closing.subVectors(course, there).normalize().multiplyScalar(soon));
        target.addScaledVector(away.normalize(), 0.5 + soon / 2);
        pushed = true;
        break;
      }
    }
    return pushed ? target.clampLength(0, 1) : null;
  }

  /** Whether its hull turned by `turned` would come within ROCK_CLEAR of a piece of the field it keeps clear of as it is turned now. */
  private crowded(turned: THREE.Quaternion): boolean {
    if (!this.field) return false;
    for (const piece of this.field.asteroids.values()) {
      const reach = piece.radius + ROCK_CLEAR / 2;
      if (this.reaches(piece.object.position, reach, this.position, turned) && !this.reaches(piece.object.position, reach)) return true;
    }
    return false;
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

  /** A point lies in one of its hangars, between its flanks, while it is in the field (see Obstacle). */
  within(point: THREE.Vector3): boolean {
    if (!this.standing || point.distanceTo(this.position) > REACH) return false;
    this.toLocal(point, local);
    if (local.y < HANGAR_FLOOR || local.y > HANGAR_CEILING) return false;
    for (const z of HANGARS) if (Math.abs(local.z - z) < HANGAR_WIDTH / 2) return Math.abs(local.x) < hullAt(z).half;
    return false;
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

  /**
   * The batteries that fire this frame, each with the number of its shot: the same moments and
   * numbers on every browser, by the field time. The list and its entries are reused every
   * frame: read them before the next call.
   */
  firing(clock: number): readonly Readonly<Shot>[] {
    const fired = this.fired;
    fired.length = 0;
    if (this.present(clock) && clock > this.lastClock) {
      for (let i = 0; i < this.zones.length; i++) {
        if (this.zones[i].kind !== 'battery' || this.broken(i)) continue;
        const offset = i * 0.27;
        const shot = Math.floor((clock + offset) / BATTERY_PERIOD);
        if (shot <= Math.floor((this.lastClock + offset) / BATTERY_PERIOD)) continue;
        const entry = (this.shots[fired.length] ??= { zone: 0, shot: 0 });
        entry.zone = i;
        entry.shot = shot;
        fired.push(entry);
      }
    }
    this.lastClock = clock;
    return fired;
  }
  /** What firing hands out, kept for the next frame. */
  private readonly fired: Shot[] = [];
  private readonly shots: Shot[] = [];

  /**
   * The lead browser flies the battleship: in on its orbit around the field, its stern turned on
   * the nearest pilot in its second phase, out of the way of the round's `comets`, adrift
   * without drives.
   */
  lead(dt: number, clock: number, ships: readonly Target[], comets: readonly Comet[] = []) {
    if (!this.present(clock)) return;
    const position = this.position;
    const fleeing = this.drives > 0 ? this.evasion(clock, comets, dodge) : null;
    const aside = this.aside(clock, clear);
    if (fleeing) want.copy(fleeing).multiplyScalar(EVADE_SPEED);
    else if (this.drives > 0) {
      // the orbit: along its circle around the center at its lane's height, back towards it when off
      const radial = local.copy(position).setY(0);
      const r = radial.length() || 1;
      want.crossVectors(UP, radial).divideScalar(r).multiplyScalar(FLEET_SPEED).addScaledVector(radial, ((ORBIT - r) / r) * 0.05);
      want.y = (this.lane - position.y) * 0.05;
    } else want.copy(this.velocity).multiplyScalar(Math.max(0, 1 - dt * 0.2));
    if (aside) want.addScaledVector(aside, ROCK_EVADE);
    if (fleeing || aside) this.velocity.lerp(want, Math.min(1, dt * STEER * EVADE_BURN));
    else if (this.drives > 0) this.velocity.lerp(want, Math.min(1, dt * STEER));
    else this.velocity.copy(want);
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
      turned.copy(this.quaternion).rotateTowards(turn, FLEET_TURN * dt);
      if (!this.crowded(turned)) this.quaternion.copy(turned);
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
   * Shows a tunnel's machinery in full only while `eye` (the camera) is in the hangar deck or
   * within HANGAR_APPROACH of it, and of the tunnel nearest it along the hull; from anywhere else
   * the walls' pictures stand in for it.
   */
  view(eye: THREE.Vector3) {
    const local = EYE.copy(eye).applyMatrix4(UNDO.copy(this.root.matrixWorld).invert());
    const near =
      this.root.visible &&
      Math.abs(local.x) < DECK_REACH + HANGAR_APPROACH &&
      local.y > HANGAR_FLOOR - HANGAR_APPROACH &&
      local.y < HANGAR_CEILING + HANGAR_APPROACH &&
      local.z > HANGARS[0] - HANGAR_WIDTH / 2 - HANGAR_APPROACH &&
      local.z < HANGARS[HANGARS.length - 1] + HANGAR_WIDTH / 2 + HANGAR_APPROACH;
    let nearest = 0;
    for (let i = 1; i < HANGARS.length; i++) if (Math.abs(local.z - HANGARS[i]) < Math.abs(local.z - HANGARS[nearest])) nearest = i;
    for (let i = 0; i < this.machinery.length; i++) this.machinery[i].visible = near && i === nearest;
  }

  /**
   * The battleship as it looks this frame: broken parts burnt out, the dome open, the reactor
   * pulsing, the plume burning; once it went down it stays until it goes up.
   */
  update(clock: number, now: number) {
    this.clock = clock;
    const dying = this.dying(clock);
    this.root.visible = this.present(clock) || dying;
    // the motes stay out of the hangar deck while the battleship is shown
    this.root.updateMatrix();
    if (this.root.visible) shelter.value.copy(this.root.matrix).invert().premultiply(SHELTER_BOX);
    else unshelter();
    for (let i = 0; i < this.beacons.length; i++) this.zoneAt(i, this.beacons[i].flight.position);
    // a broken drive is burnt out; a broken battery or reactor is gone
    for (let i = 0; i < this.zones.length; i++) {
      const zone = this.zones[i];
      if (zone.kind === 'drive') (zone.mesh as THREE.Mesh).material = this.broken(i) ? this.burnt : this.driveGlow;
      else zone.mesh.visible = !this.broken(i);
    }
    this.dome.visible = this.phase < 3 && !dying;
    this.reactorGlow.color.setRGB(1, 0.75, 0.4).multiplyScalar(dying ? 3 + 2 * Math.sin(now * 30) : this.phase === 3 ? 2 + Math.sin(now * 8) : 1.5);
    this.flame.visible = this.burning;
    if (this.burning) this.flame.scale.set(1 + 0.08 * Math.sin(now * 40), 1 + 0.08 * Math.sin(now * 37), 1);
    this.procession.uniforms.time.value = now;
  }

  dispose() {
    unshelter();
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

  /** Where the battleship comes in: near the arena's edge at its lane's height, from a side that follows from the arena, heading along its orbit. */
  private enter() {
    const r = new Randomizer(this.seed * 13 + 101);
    const angle = r.range(0, Math.PI * 2);
    const out = entryRadius(this.lane);
    this.position.set(Math.cos(angle) * out, this.lane, Math.sin(angle) * out);
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
    const nozzle = want.set(0, 0, NOZZLES).applyMatrix4(this.root.matrixWorld);
    const away = local.subVectors(point, nozzle);
    const along = away.dot(back);
    if (along <= 0 || along > PLUME_REACH) return -1;
    const across = away.addScaledVector(back, -along).length();
    return across > radius + PLUME_BASE + along * PLUME_SPREAD ? -1 : along;
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
