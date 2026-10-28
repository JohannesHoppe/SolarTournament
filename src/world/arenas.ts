import * as THREE from 'three';
import { FIELD_RADIUS, SPIN_RATE, type FieldLayout, type Placement } from './asteroids';
import { hash } from '../music/songs';
import { textSeed } from '../random';
import { msg } from '../i18n/i18n';
import { SUN_DIRECTION } from './space';
import type { Mood } from './nebula';

/** One standard gravity (units/s², 1 unit = 5 cm). */
const G = 196.2;
/**
 * Jupiter, whose cloud deck runs through its arena: a planet of JUPITER_RADIUS (units, 40 km) to
 * the deck, which lies in the reference plane at the field's center, so half the arena is open
 * space over its curved horizon and half is its air (see world/air). It pulls with JUPITER_GRAVITY
 * at the deck, falling off with the square of the distance from its center: 0.71 g at the
 * arena's top, 0.99 g at its bottom, as near a real planet. Its scale is the game's: the real
 * Jupiter is 140 000 km wide and pulls with 2.5 g; a planet of 80 km shows its curve from a few
 * kilometers up. The arena's well, what a ship cannot fly into, is its core JUPITER_FLOOR (units,
 * 5 km) below the deck, deeper than the air lets any ship get alive.
 */
const JUPITER_RADIUS = 800000;
const JUPITER_FLOOR = 100000;
const JUPITER_GRAVITY = 0.83 * G;
const JUPITER_CENTER = new THREE.Vector3(0, -JUPITER_RADIUS, 0);
/** The black hole's event horizon (units, 175 m), in the middle of its arena. */
export const HOLE_RADIUS = 3500;

export type ArenaId = 'belt' | 'rings' | 'junkyard' | 'giant' | 'corona' | 'hole' | 'derelict';

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
  /** Its light and color mood: space, the sky's light, nebulae, stars, dust and the picture's grade (see MOODS). */
  mood: Mood;
  /** Where the camera of its preview picture stands and what it looks at (units); without, PREVIEW_FROM onto the center. */
  preview?: { from: [number, number, number]; at?: [number, number, number] };
  /** The big things that never move, besides the field's center and the sun, which the HUD marks (see Reference). */
  references: Reference[];
  /** Half the thickness (units) of a layer of ice grains in the horizon plane, a ring's: harmless, but felt on the hull flying through (see Game.ringGrains). */
  grains?: number;
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

/** Saturn, beside the Rings of Saturn (units, 13 km off), whose ring runs through the arena in the horizon plane. */
export const SATURN_CENTER = new THREE.Vector3(-0.85, 0, 0.5).normalize().multiplyScalar(260000);
/**
 * Earth below the Satellite Junkyard, at its real size (EARTH_RADIUS, units, 6,371 km), the
 * field's center EARTH_ALTITUDE (550 km) above it in low orbit: it fills the sky below a horizon
 * 23° beneath the arena. Not straight below: tilted EARTH_TILT (11.5°) towards the sun, so the
 * point beneath the arena lies in the dusk (the sun 3.2° below its horizon): the terminator runs
 * through the view below, the day side towards the sun, the night with its cities away from it,
 * and the arena itself, high above, lies in sunlight (the sun 20° above Earth's rim as seen from
 * it). Scenery only: it neither pulls nor blocks.
 */
export const EARTH_RADIUS = 127420000;
export const EARTH_ALTITUDE = 11000000;
const EARTH_TILT = 0.2;
/** Straight down to the point beneath the arena, from the field's center. */
export const EARTH_DOWN = new THREE.Vector3(SUN_DIRECTION.x, 0, SUN_DIRECTION.z).normalize().multiplyScalar(Math.sin(EARTH_TILT)).add(new THREE.Vector3(0, -Math.cos(EARTH_TILT), 0));
export const EARTH_CENTER = EARTH_DOWN.clone().multiplyScalar(EARTH_RADIUS + EARTH_ALTITUDE);
/** Half the thickness of the ring's layer of ice grains through the arena's middle (units, 125 m: a layer 250 m thick). */
export const RING_LAYER = 2500;

/** The camera of an arena's preview picture: far out and above, onto the center, so the landmark shows (see ArenaProfile.preview). */
export const PREVIEW_FROM: [number, number, number] = [70000, 30000, 70000];

/** The stern of the world ship drifted off: tilted by this angle (rad), sunk by STERN_DROP and shifted sideways by STERN_SHIFT (units). */
const STERN_TILT = 0.22;
const STERN_DROP = 4000;
const STERN_SHIFT = 3000;

/** Where a point along the stern's axis lies, `offset` units from where it broke. */
export const sternAt = (offset: number) => [offset * Math.cos(STERN_TILT), -STERN_DROP + offset * Math.sin(STERN_TILT)] as const;

/** The hull of the wrecked world ship: two halves broken apart, hull sections of `hullSet` (1 torn, 2 engine, 3 tower, 4 spar; 5, 6, 7 sections with its paint: PER ASPERA, emblem and registry, AD ASTRA). */
function derelict(): Placement[] {
  const pieces: Placement[] = [];
  const turn = new THREE.Euler();
  // turned by roll, yaw and pitch in that order; 'ZYX' pitches last, about the world's z, as the
  // stern's hull is tilted, whatever the yaw
  const add = (type: number, scale: number, x: number, y: number, z: number, yaw = 0, pitch = 0, roll = 0, order: THREE.EulerOrder = 'XYZ') =>
    pieces.push({
      kind: 'hull',
      type,
      scale,
      position: new THREE.Vector3(x, y, z),
      orientation: new THREE.Quaternion().setFromEuler(turn.set(roll, yaw, pitch, order)),
      solid: true,
    });
  // the bow half: two sections of 700 m (the emblem and registry by the bridge, PER ASPERA aft
  // of it), the bridge tower on top, a spar across, the torn end
  // facing the gap
  add(6, 7, -43000, 0, 0);
  add(5, 7, -30000, 0, 0);
  add(3, 7, -36000, 3200, 0);
  add(1, 7, -17000, 0, 0);
  add(4, 7, -30000, 0, 0, Math.PI / 2);
  // the stern half drifted off, tilted: its torn end faces back towards the bow
  const [x1, y1] = sternAt(12000);
  add(1, 7, x1, y1, STERN_SHIFT, Math.PI, -STERN_TILT);
  const [x2, y2] = sternAt(25000);
  add(7, 7, x2, y2, STERN_SHIFT, 0, STERN_TILT);
  const [x3, y3] = sternAt(37000);
  add(2, 7, x3, y3, STERN_SHIFT - 3000, 0, STERN_TILT);
  add(2, 7, x3, y3, STERN_SHIFT + 3000, 0, STERN_TILT);
  // the spar across the stern tilts with its hull: level across, turned about the hull's tilt
  add(4, 7, x2, y2, STERN_SHIFT, Math.PI / 2, STERN_TILT, 0, 'ZYX');
  return pieces;
}

/**
 * The light and color mood of every arena (see Mood), set around its landmark, so each is
 * known at first glance. Every grade stays gentle: the HUD's azure and the orange of what to
 * act on keep their hue in the world (world/mood.test.ts), and a ship's tint stays its own.
 */
const MOODS: Record<ArenaId, Mood> = {
  // dusty and warm: clouds of amber and rust dust, a warm sky, ochre dust, a golden grade
  belt: {
    space: 0x040201,
    sky: 0xa08a70,
    ground: 0x30200f,
    ambient: 1.6,
    nebulae: [
      { at: [-1, 0.25, 0.3], color: [0.26, 0.12, 0.033], size: 576000, shape: 0, turn: 0.4 },
      { at: [0.75, -0.45, 0.55], color: [0.18, 0.065, 0.023], size: 504000, shape: 1, turn: 2.1 },
      { at: [0.15, 0.85, 0.6], color: [0.12, 0.078, 0.039], size: 432000, shape: 2, turn: 4 },
    ],
    stars: 0.75,
    dust: [0.75, 0.6, 0.42],
    grade: { gain: [1.05, 1, 0.9], lift: [0.0028, 0.0016, 0.0005], saturation: 1 },
  },
  // cool silver and gold: a silver-blue veil along the ring's plane, a faint gold one off it;
  // the sky's light silver, from below the gold of the lit ring
  rings: {
    space: 0x02030a,
    sky: 0x9aa8c8,
    ground: 0x3c3020,
    ambient: 1.6,
    nebulae: [
      { at: [0.7, 0.12, -0.7], color: [0.12, 0.14, 0.22], size: 648000, shape: 2, turn: 1.5 },
      { at: [-0.4, 0.55, 0.75], color: [0.19, 0.14, 0.065], size: 468000, shape: 0, turn: 3.3 },
      { at: [0.3, -0.7, 0.6], color: [0.085, 0.1, 0.17], size: 432000, shape: 1, turn: 0.7 },
    ],
    stars: 1,
    dust: [0.62, 0.68, 0.8],
    grade: { gain: [0.98, 1, 1.03], lift: [0.001, 0.0013, 0.0022], saturation: 0.95 },
  },
  // Earth's night: blue-black above, the cities' warm glow from below, a faint airglow green in the dark
  junkyard: {
    space: 0x01020a,
    sky: 0x5a6c9c,
    ground: 0x5a3a1e,
    ambient: 1.5,
    nebulae: [
      { at: [-0.6, 0.6, 0.5], color: [0.033, 0.052, 0.16], size: 612000, shape: 1, turn: 2.6 },
      { at: [0.5, 0.75, -0.4], color: [0.026, 0.065, 0.12], size: 504000, shape: 2, turn: 0.2 },
    ],
    stars: 1,
    dust: [0.5, 0.6, 0.78],
    grade: { gain: [0.96, 0.99, 1.05], lift: [0.0006, 0.001, 0.003], saturation: 0.95 },
  },
  // warm ochre-brown: a dusty amber glow over the clouds, the sky's light ochre (the haze takes it over below the deck)
  giant: {
    space: 0x040201,
    sky: 0xa48c6c,
    ground: 0x3c2414,
    ambient: 1.6,
    nebulae: [
      { at: [-0.7, 0.45, -0.5], color: [0.16, 0.091, 0.039], size: 576000, shape: 0, turn: 5 },
      { at: [0.6, 0.6, 0.5], color: [0.1, 0.052, 0.033], size: 468000, shape: 2, turn: 1.2 },
    ],
    stars: 0.85,
    dust: [0.72, 0.6, 0.45],
    grade: { gain: [1.04, 1, 0.92], lift: [0.0024, 0.0014, 0.0005], saturation: 1 },
  },
  // orange-white and blinding: the glare lights everything from all around and lifts the
  // shadows, drowns most stars, and the sun's outer streamers glow across the sky
  corona: {
    space: 0x0a0402,
    sky: 0xffd0a0,
    ground: 0x60300f,
    ambient: 2.4,
    nebulae: [
      { at: [0.5, 0.3, -1], color: [0.36, 0.26, 0.14], size: 756000, shape: 2, turn: 0.9 },
      { at: [-0.3, 0.05, -1], color: [0.24, 0.15, 0.07], size: 684000, shape: 0, turn: 2.5 },
      { at: [-0.6, -0.4, 0.7], color: [0.091, 0.039, 0.013], size: 540000, shape: 1, turn: 4.2 },
    ],
    stars: 0.3,
    dust: [0.9, 0.7, 0.5],
    grade: { gain: [1.06, 1, 0.9], lift: [0.006, 0.0032, 0.0011], saturation: 1 },
  },
  // deep violet: violet and magenta clouds around the hole, a violet sky, the shadows violet
  hole: {
    space: 0x04020c,
    sky: 0x7a5cc8,
    ground: 0x1e0c30,
    ambient: 1.4,
    nebulae: [
      { at: [-1, 0.3, 0.2], color: [0.12, 0.039, 0.26], size: 612000, shape: 0, turn: 1 },
      { at: [0.6, -0.5, 0.8], color: [0.16, 0.026, 0.13], size: 504000, shape: 1, turn: 3.6 },
      { at: [0.2, 0.9, -0.4], color: [0.065, 0.026, 0.18], size: 540000, shape: 2, turn: 5.4 },
      { at: [0.8, 0.1, -0.6], color: [0.052, 0.019, 0.12], size: 432000, shape: 1, turn: 0.3 },
    ],
    stars: 1,
    dust: [0.62, 0.55, 0.85],
    grade: { gain: [1, 0.94, 1.06], lift: [0.0025, 0.0008, 0.0045], saturation: 1.05 },
  },
  // cold, washed out and solemn: a graveyard; a dim pale sun, a cold grey sky, one pale veil
  // over the wreck like a shroud, the colors drained
  derelict: {
    space: 0x020306,
    sky: 0x7c8aa0,
    ground: 0x15191f,
    ambient: 1.3,
    nebulae: [
      { at: [-0.3, 0.8, 0.4], color: [0.12, 0.14, 0.17], size: 612000, shape: 2, turn: 2 },
      { at: [0.7, -0.3, 0.6], color: [0.05, 0.06, 0.08], size: 504000, shape: 0, turn: 4.4 },
    ],
    stars: 0.9,
    dust: [0.55, 0.6, 0.66],
    grade: { gain: [0.97, 0.99, 1.02], lift: [0.001, 0.0015, 0.0022], saturation: 0.78 },
  },
};

/** Every arena. A tournament plays them in an order of its own; the default arena (see DEFAULT_ARENA) is the home of the flight school. */
export const ARENAS: readonly ArenaProfile[] = [
  {
    id: 'belt',
    name: msg('The Belt'),
    tagline: msg('Forty rocks, ten ships long each. Cover is everywhere.'),
    layout: { key: 'belt', seed: 11, kind: 'rock', count: 40, minScale: 2.5, maxScale: 7, radius: FIELD_RADIUS, inner: 0, spin: SPIN_RATE, toughness: 800 },
    cooling: 1,
    storms: false,
    sun: { size: 30000, intensity: 3.2, color: 0xffe4bf },
    mood: MOODS.belt,
    preview: { from: [32000, 12000, 32000] },
    references: [],
  },
  {
    id: 'rings',
    name: msg('Rings of Saturn'),
    tagline: msg('Inside a ring of ice, as thin as a sheet. Up and down are open.'),
    // small chunks in the ring's layer, cover and obstacles among its grains; a few large ones
    // in the open space above and below it
    layout: {
      key: 'rings',
      seed: 23,
      kind: 'ice',
      count: 120,
      minScale: 0.5,
      maxScale: 1.5,
      radius: FIELD_RADIUS * 1.3,
      inner: 0,
      flat: 1600,
      open: { count: 16, minScale: 2, maxScale: 2.6, from: 8000, to: 24000, radius: FIELD_RADIUS },
      spin: 0.08,
      toughness: 500,
    },
    grains: RING_LAYER,
    cooling: 1.2,
    storms: false,
    sun: { size: 26000, intensity: 3, color: 0xf2f4ff },
    mood: MOODS.rings,
    references: [{ glyph: 'planet', label: msg('Saturn'), position: SATURN_CENTER, distance: false }],
  },
  {
    id: 'junkyard',
    name: msg('The Satellite Junkyard'),
    tagline: msg('The Orbital Freedom Network rots in low orbit. Its junk crosses at 25 m/s; Earth glows below.'),
    layout: {
      key: 'junkyard',
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
      // the network's dead relay hub in the middle: an engine block and two spars across
      placements: [
        { kind: 'hull', type: 2, scale: 6, position: new THREE.Vector3(0, 0, 0), orientation: new THREE.Quaternion(), solid: true },
        { kind: 'hull', type: 4, scale: 8, position: new THREE.Vector3(0, 0, 0), orientation: new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI / 2), solid: true },
        { kind: 'hull', type: 4, scale: 8, position: new THREE.Vector3(0, 0, 0), orientation: new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), Math.PI / 2), solid: true },
      ],
    },
    cooling: 1,
    storms: false,
    sun: { size: 30000, intensity: 3.2, color: 0xfff0dd },
    mood: MOODS.junkyard,
    // the mark lies on the way down to Earth, within the camera's reach (the HUD marks only what lies there)
    references: [{ glyph: 'planet', label: msg('Earth'), position: EARTH_DOWN.clone().multiplyScalar(450000), distance: false }],
  },
  {
    id: 'giant',
    name: msg('Jupiter'),
    tagline: msg('Half in space, half in the clouds. The deeper, the thicker the air: it hides, it brakes, it burns.'),
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
      well: { position: JUPITER_CENTER, radius: JUPITER_RADIUS - JUPITER_FLOOR, surfaceGravity: JUPITER_GRAVITY * (JUPITER_RADIUS / (JUPITER_RADIUS - JUPITER_FLOOR)) ** 2 },
      air: { center: JUPITER_CENTER, radius: JUPITER_RADIUS },
    },
    cooling: 1,
    storms: false,
    sun: { size: 30000, intensity: 3.4, color: 0xfff0dd },
    mood: MOODS.giant,
    // straight down, and how high above the cloud deck
    references: [{ glyph: 'giant', label: msg('Jupiter'), position: JUPITER_CENTER, distance: true, radius: JUPITER_RADIUS }],
  },
  {
    id: 'corona',
    name: msg('Corona'),
    tagline: msg('Close to the sun. Lasers barely cool in its glare, and its storms blind the sensors.'),
    layout: { key: 'corona', seed: 59, kind: 'rock', count: 30, minScale: 2.5, maxScale: 6, radius: FIELD_RADIUS, inner: 0, spin: SPIN_RATE, toughness: 800 },
    cooling: 0.6,
    storms: true,
    sun: { size: 150000, intensity: 6, color: 0xffd7a0 },
    mood: MOODS.corona,
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
    mood: MOODS.hole,
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
    sun: { size: 30000, intensity: 2.7, color: 0xe6edf7 },
    mood: MOODS.derelict,
    preview: { from: [20000, 20000, 50000], at: [-3000, 0, 0] },
    // the middle of each half of the world ship
    references: [
      { glyph: 'hull', label: msg('Bow'), position: new THREE.Vector3(-30000, 0, 0), distance: true },
      { glyph: 'hull', label: msg('Stern'), position: new THREE.Vector3(...sternAt(25000), STERN_SHIFT), distance: true },
    ],
  },
];

export const arenaById = (id: string): ArenaProfile | undefined => ARENAS.find((arena) => arena.id === id);

/** The arena the game shows unless something else is chosen: the menu's backdrop, the flight school's home and the solo round's first choice. */
export const DEFAULT_ARENA: ArenaProfile = arenaById('rings')!;

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
