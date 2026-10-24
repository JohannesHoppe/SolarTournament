import * as THREE from 'three';
import { FIELD_RADIUS, SPIN_RATE, type FieldLayout, type Placement } from './asteroids';
import { hash } from '../music/songs';
import { textSeed } from '../random';
import { msg } from '../i18n/i18n';

/** One standard gravity (units/s², 1 unit = 5 cm). */
const G = 196.2;
/**
 * The gas giant below its arena: a planet of GIANT_RADIUS (units, 40 km) whose cloud tops lie
 * GIANT_DEPTH (2.25 km) below the field's center, so its curved horizon fills the lower view. It
 * pulls with GIANT_GRAVITY at its clouds, falling off with the square of the distance: about
 * 0.83 g at the field's center, 0.75 g at its top, almost the same everywhere a ship flies, as
 * near a real planet.
 */
const GIANT_RADIUS = 800000;
const GIANT_DEPTH = 45000;
const GIANT_GRAVITY = 0.93 * G;
/** The black hole's event horizon (units, 175 m), in the middle of its arena. */
export const HOLE_RADIUS = 3500;

export type ArenaId = 'belt' | 'rings' | 'kessler' | 'giant' | 'corona' | 'hole' | 'derelict';

/** What makes an arena: its field, its sky, and the rules its place in space brings. */
export interface ArenaProfile {
  id: ArenaId;
  /** Shown in neon when a round starts there (marked for translation, translated where shown). */
  name: string;
  tagline: string;
  layout: FieldLayout;
  /** The laser's radiators shed heat this many times as fast as in the belt (the sun's glare: less). */
  cooling: number;
  /** Solar storms blind the sensors now and then (see Game.storm). */
  storms: boolean;
  /** The sun: how large it shows, how bright it shines, and its color. */
  sun: { size: number; intensity: number; color: number };
  /** Where the camera of its preview picture stands and what it looks at (units); without, PREVIEW_FROM onto the center. */
  preview?: { from: [number, number, number]; at?: [number, number, number] };
  /** The big things that never move, besides the field's center and the sun, which the HUD marks (see Reference). */
  references: Reference[];
}

/** How the HUD draws a fixed reference: each kind has a glyph of its own in style.css (.reference[data-glyph]). */
export type Glyph = 'center' | 'hole' | 'sun' | 'planet' | 'giant' | 'hull' | 'base' | 'battleship';

/**
 * A fixed reference the HUD marks, on screen where it lies and at the screen's edge when it does
 * not (see Hud.setReferences): its glyph, its label (marked for translation), where it lies
 * (units), and, where `distance` is set, how far it is, measured to its surface `radius` away
 * from that point (units).
 */
export interface Reference {
  glyph: Glyph;
  label: string;
  position: THREE.Vector3;
  distance: boolean;
  radius?: number;
}

/** The ringed planet beside the Rings of Kronos (units, 13 km off), whose ring runs through the arena in the horizon plane. */
export const KRONOS_CENTER = new THREE.Vector3(-0.85, 0, 0.5).normalize().multiplyScalar(260000);
/** The world the Kessler field's station circled, far below (units). */
export const KESSLER_WORLD = new THREE.Vector3(-120000, -330000, -60000);

/** The camera of an arena's preview picture: far out and above, onto the center, so the landmark shows (see ArenaProfile.preview). */
export const PREVIEW_FROM: [number, number, number] = [70000, 30000, 70000];

/** The stern of the world ship drifted off: tilted by this angle (rad), sunk by STERN_DROP and shifted sideways by STERN_SHIFT (units). */
const STERN_TILT = 0.22;
const STERN_DROP = 4000;
const STERN_SHIFT = 3000;

/** Where a point along the stern's axis lies, `offset` units from where it broke. */
export const sternAt = (offset: number) => [offset * Math.cos(STERN_TILT), -STERN_DROP + offset * Math.sin(STERN_TILT)] as const;

/** The hull of the wrecked world ship: two halves broken apart, hull sections of `hullSet` (0 section, 1 torn, 2 engine, 3 tower, 4 spar). */
function derelict(): Placement[] {
  const pieces: Placement[] = [];
  const turn = new THREE.Euler();
  const add = (type: number, scale: number, x: number, y: number, z: number, yaw = 0, pitch = 0, roll = 0) =>
    pieces.push({
      kind: 'hull',
      type,
      scale,
      position: new THREE.Vector3(x, y, z),
      orientation: new THREE.Quaternion().setFromEuler(turn.set(roll, yaw, pitch)),
      solid: true,
    });
  // the bow half: two sections of 700 m, the bridge tower on top, a spar across, the torn end
  // facing the gap
  add(0, 7, -43000, 0, 0);
  add(0, 7, -30000, 0, 0);
  add(3, 7, -36000, 3200, 0);
  add(1, 7, -17000, 0, 0);
  add(4, 7, -30000, 0, 0, Math.PI / 2);
  // the stern half drifted off, tilted: its torn end faces back towards the bow
  const [x1, y1] = sternAt(12000);
  add(1, 7, x1, y1, STERN_SHIFT, Math.PI, -STERN_TILT);
  const [x2, y2] = sternAt(25000);
  add(0, 7, x2, y2, STERN_SHIFT, 0, STERN_TILT);
  const [x3, y3] = sternAt(37000);
  add(2, 7, x3, y3, STERN_SHIFT - 3000, 0, STERN_TILT);
  add(2, 7, x3, y3, STERN_SHIFT + 3000, 0, STERN_TILT);
  add(4, 7, x2, y2, STERN_SHIFT, Math.PI / 2, 0, STERN_TILT);
  return pieces;
}

/** Every arena. A tournament plays them in an order of its own; the belt is the home of the flight school. */
export const ARENAS: readonly ArenaProfile[] = [
  {
    id: 'belt',
    name: msg('The Belt'),
    tagline: msg('Forty rocks, ten ships long each. Cover is everywhere.'),
    layout: { key: 'belt', seed: 11, kind: 'rock', count: 40, minScale: 2.5, maxScale: 7, radius: FIELD_RADIUS, inner: 0, spin: SPIN_RATE, toughness: 800 },
    cooling: 1,
    storms: false,
    sun: { size: 30000, intensity: 3.2, color: 0xfff0dd },
    preview: { from: [32000, 12000, 32000] },
    references: [],
  },
  {
    id: 'rings',
    name: msg('Rings of Kronos'),
    tagline: msg('Inside a ring of ice, as thin as a sheet. Up and down are open.'),
    layout: { key: 'rings', seed: 23, kind: 'ice', count: 90, minScale: 0.8, maxScale: 3.2, radius: FIELD_RADIUS * 1.3, inner: 0, flat: 5000, spin: 0.08, toughness: 500 },
    cooling: 1.2,
    storms: false,
    sun: { size: 26000, intensity: 3, color: 0xf2f4ff },
    references: [{ glyph: 'planet', label: msg('Kronos'), position: KRONOS_CENTER, distance: false }],
  },
  {
    id: 'kessler',
    name: msg('Kessler Field'),
    tagline: msg('A station blew up. Its pieces still cross each other at 25 m/s.'),
    layout: {
      key: 'kessler',
      seed: 31,
      kind: 'debris',
      count: 90,
      minScale: 1,
      maxScale: 3,
      radius: FIELD_RADIUS * 1.2,
      inner: 12000,
      orbit: { axis: 'random', speed: 500 },
      spin: 0.15,
      toughness: 500,
      placements: [
        { kind: 'hull', type: 2, scale: 6, position: new THREE.Vector3(0, 0, 0), orientation: new THREE.Quaternion(), solid: true },
        { kind: 'hull', type: 4, scale: 8, position: new THREE.Vector3(0, 0, 0), orientation: new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI / 2), solid: true },
        { kind: 'hull', type: 4, scale: 8, position: new THREE.Vector3(0, 0, 0), orientation: new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), Math.PI / 2), solid: true },
      ],
    },
    cooling: 1,
    storms: false,
    sun: { size: 30000, intensity: 3.2, color: 0xfff0dd },
    references: [{ glyph: 'planet', label: msg('Planet'), position: KESSLER_WORLD, distance: false }],
  },
  {
    id: 'giant',
    name: msg('Gas Giant'),
    tagline: msg('A world of storms below, eighty kilometers wide, pulling at everything. Dive along its clouds, or burn in them.'),
    layout: {
      key: 'giant',
      seed: 47,
      kind: 'rock',
      count: 22,
      minScale: 2,
      maxScale: 5,
      radius: FIELD_RADIUS,
      inner: 0,
      spin: SPIN_RATE,
      toughness: 800,
      well: { position: new THREE.Vector3(0, -(GIANT_RADIUS + GIANT_DEPTH), 0), radius: GIANT_RADIUS, surfaceGravity: GIANT_GRAVITY },
    },
    cooling: 1,
    storms: false,
    sun: { size: 30000, intensity: 3.4, color: 0xfff0dd },
    // straight down to the clouds, and how far they are
    references: [{ glyph: 'giant', label: msg('Clouds'), position: new THREE.Vector3(0, -(GIANT_RADIUS + GIANT_DEPTH), 0), distance: true, radius: GIANT_RADIUS }],
  },
  {
    id: 'corona',
    name: msg('Corona'),
    tagline: msg('Close to the sun. Lasers barely cool in its glare, and its storms blind the sensors.'),
    layout: { key: 'corona', seed: 59, kind: 'rock', count: 30, minScale: 2.5, maxScale: 6, radius: FIELD_RADIUS, inner: 0, spin: SPIN_RATE, toughness: 800 },
    cooling: 0.6,
    storms: true,
    sun: { size: 150000, intensity: 6, color: 0xffd7a0 },
    references: [],
  },
  {
    id: 'hole',
    name: msg('Event Horizon'),
    tagline: msg('A black hole in the middle pulls everything in. Past 280 m no drive gets out.'),
    layout: {
      key: 'hole',
      seed: 61,
      kind: 'rock',
      count: 20,
      minScale: 1.5,
      maxScale: 4,
      radius: FIELD_RADIUS * 1.3,
      inner: 28000,
      flat: 2500,
      orbit: { axis: 'vertical', speed: 500 },
      spin: 0.06,
      toughness: 800,
      well: { position: new THREE.Vector3(0, 0, 0), radius: HOLE_RADIUS, surfaceGravity: (1 * G * 20000 * 20000) / (HOLE_RADIUS * HOLE_RADIUS) },
    },
    cooling: 1,
    storms: false,
    sun: { size: 20000, intensity: 2.6, color: 0xffe6cc },
    preview: { from: [20000, 8000, 20000] },
    // the hole is the field's center: it takes the center's mark, measured to its horizon
    references: [{ glyph: 'hole', label: msg('Black hole'), position: new THREE.Vector3(), distance: true, radius: HOLE_RADIUS }],
  },
  {
    id: 'derelict',
    name: msg('The Derelict'),
    tagline: msg('A world ship, broken in two. Nothing else out here: only its hull to hide behind.'),
    layout: { key: 'derelict', seed: 71, kind: 'rock', count: 0, minScale: 1, maxScale: 1, radius: FIELD_RADIUS, inner: 0, spin: 0, toughness: 800, placements: derelict() },
    cooling: 1,
    storms: false,
    sun: { size: 30000, intensity: 3.2, color: 0xfff0dd },
    preview: { from: [20000, 20000, 50000], at: [-3000, 0, 0] },
    // the middle of each half of the world ship
    references: [
      { glyph: 'hull', label: msg('Bow'), position: new THREE.Vector3(-30000, 0, 0), distance: true },
      { glyph: 'hull', label: msg('Stern'), position: new THREE.Vector3(...sternAt(25000), STERN_SHIFT), distance: true },
    ],
  },
];

export const arenaById = (id: string): ArenaProfile | undefined => ARENAS.find((arena) => arena.id === id);

/** The arena whose field has this layout key (see FieldState). */
export const arenaByKey = (key: string): ArenaProfile | undefined => ARENAS.find((arena) => arena.layout.key === key);

/**
 * The arena of a tournament round: the room's code shuffles the arenas into an order of its
 * own, and the rounds walk through it, so no arena comes twice before all others have come.
 * Every browser works it out alike from code and round.
 */
export function arenaOfRound(room: string, round: number): ArenaProfile {
  const order = ARENAS.map((arena, i) => ({ arena, key: hash(textSeed(room), i, 13) })).sort((a, b) => a.key - b.key);
  return order[round % order.length].arena;
}
