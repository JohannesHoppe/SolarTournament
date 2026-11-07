import * as THREE from 'three';
import { FIELD_RADIUS, SPIN_RATE, type FieldLayout, type Placement } from './asteroids';
import { hash } from '../music/songs';
import { textSeed } from '../random';
import { msg } from '../i18n/i18n';
import { SUN_DIRECTION } from './space';
import type { Mood } from './nebula';
import { cos, pow, sin } from '../detmath';
import { setFromAxisAngle, setFromEuler } from '../detthree';
import { BAY_MOUTH, boneyardRacks, GROUND, PSYCHE_CENTER, PSYCHE_FALL, PSYCHE_RADIUS, RACK_Y, YARD_END, VESTA_GROUND_TYPE, OCCATOR_TYPE, WALL_TYPE, PHOBOS_TYPE, CALLISTO_TYPE, POST_TYPE, EUROPA_TYPE, STATION_TYPE, IO_TYPE, GANYMEDE_TYPE, TITAN_TYPE } from './yard';
import { CALLISTO_FALL, groundPlacement as callistoGround, JUPITER_AT, POST_HALF, postPlacement, VALHALLA_MARK } from './callisto';
import { SATURN_AT as TITAN_SATURN, seaPlacement as titanSea, TITAN_AIR, TITAN_FALL } from './titan';
import { TITAN_DECK_LIGHT, TITAN_DEEP_LIGHT } from './kraken';
import { GANYMEDE_FALL, groundPlacement as ganymedeGround, JUPITER_AT as GANYMEDE_JUPITER } from './ganymede';
import { FLUX_AT, groundPlacement as ioGround, IO_FALL, JUPITER_AT as IO_JUPITER, LAND as IO_LAND } from './io';
import { CRACK_MARK, EUROPA_FALL, groundPlacement as europaGround, JUPITER_AT as EUROPA_JUPITER, stationPlacement } from './europa';
import { WALL_TOP, wallPlacement } from './wall';
import { groundPlacement, MARS_AT, PHOBOS_FALL, STICKNEY_FLOOR } from './phobos';
import { CERES_FALL, CEREALIA, MARKET, occatorPlacements, onPlace, TERRACE } from './ceres';
import { RISE, slopeGround, SUMMIT, VESTA_FALL, VESTA_GROUND } from './vesta';

/** Where the HUD marks Io's flux tube: its foot on the plain. */
const FLUX_MARK = new THREE.Vector3(FLUX_AT.x, IO_LAND, FLUX_AT.z);

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
/**
 * The black hole's event horizon (units, 350 m), in the middle of its arena. It pulls with
 * HOLE_PULL (units/s², 1 g) at HOLE_PULL_AT (units, 2 km), falling off with the square of the
 * distance: 4 g at 1 km, and the main drive's 13 g gets out from no nearer than about 555 m,
 * 1.6 times the horizon, so the zone no drive escapes begins just outside it; touching the
 * horizon is death. Its pull is the game's: a real hole of this size weighs about 0.12 suns (its
 * horizon is 2.95 km per sun) and pulls with some 400 billion g at 2 km (see README, Event Horizon).
 */
export const HOLE_RADIUS = 7000;
const HOLE_PULL = G;
const HOLE_PULL_AT = 40000;

export type ArenaId = 'belt' | 'rings' | 'junkyard' | 'giant' | 'corona' | 'hole' | 'derelict' | 'boneyard' | 'rheasilvia' | 'occator' | 'wall' | 'phobos' | 'callisto' | 'europa' | 'io' | 'ganymede' | 'titan';

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
  /** Half the thickness (units) of a layer of ice grains in the horizon plane, a ring's: harmless, but felt on the hull flying through (see Game.hullPatter). */
  grains?: number;
  /** Half the thickness (units) of a sheet drawn through the horizon plane, a ring's (see RING_SHEET): the President's battleship flies its lane clear of it. */
  sheet?: number;
  /** The light of the haze of its air (see view/haze), right under the deck and deep down, where it is not Jupiter's (see world/jupiter). */
  hazeLight?: { deck: THREE.Color; deep: THREE.Color };
  /** A place of the campaign: no edge, no grid; a ship may fly on into the empty dark as far as it likes. */
  open?: boolean;
  /** Where a place of the campaign prints the own clone, and the point it faces (units); without, wherever the round's spawning finds room. */
  start?: { at: [number, number, number]; toward: [number, number, number] };
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
 * field's center EARTH_ALTITUDE (units, 5,000 km) above it: a ball 68° across beneath the arena,
 * its disk wholly in front of the camera while the camera looks within 56° of its middle, and
 * beyond that only its rim in the picture, so it shows round, never as the pointed dome a horizon
 * reaching behind the camera makes (a deliberate deviation, see README: a real
 * mega-constellation orbits at some 550 km, where Earth is a floor filling half the sky). Not
 * straight below: tilted EARTH_TILT (11.5°) towards the sun, so the point beneath the arena lies
 * in the dusk (the sun 3.2° below its horizon): the terminator runs through the middle of the
 * ball, the day side towards the sun, the night with its cities away from it, and the arena
 * itself, high above, lies in sunlight (the sun 53° above Earth's rim as seen from it). Scenery
 * only: it neither pulls nor blocks.
 */
export const EARTH_RADIUS = 127420000;
export const EARTH_ALTITUDE = 100000000;
const EARTH_TILT = 0.2;
/** Straight down to the point beneath the arena, from the field's center. */
export const EARTH_DOWN = new THREE.Vector3(SUN_DIRECTION.x, 0, SUN_DIRECTION.z).normalize().multiplyScalar(sin(EARTH_TILT)).add(new THREE.Vector3(0, -cos(EARTH_TILT), 0));
export const EARTH_CENTER = EARTH_DOWN.clone().multiplyScalar(EARTH_RADIUS + EARTH_ALTITUDE);
/** Half the thickness of the ring's layer of ice grains through the arena's middle (units, 125 m: a layer 250 m thick). */
export const RING_LAYER = 2500;
/**
 * Saturn's ring is drawn as the two faces of a slab RING_SHEET above and below its plane (units,
 * 200 m): beyond the reach of every chunk of the layer (up to some 185 m) and short of the open
 * space's chunks (from some 255 m), so the sheet never cuts through the ice. Each face shows the
 * part of the slab beyond it as seen from the pilot, so the open space on the pilot's side stays
 * open (see world/landmarks, RING_THIN).
 */
export const RING_SHEET = 4000;

/** The camera of an arena's preview picture: far out and above, onto the center, so the landmark shows (see ArenaProfile.preview). */
export const PREVIEW_FROM: [number, number, number] = [70000, 30000, 70000];

/** The stern of the world ship drifted off: tilted by this angle (rad), sunk by STERN_DROP and shifted sideways by STERN_SHIFT (units). */
const STERN_TILT = 0.22;
const STERN_DROP = 4000;
const STERN_SHIFT = 3000;

/** Where a point along the stern's axis lies, `offset` units from where it broke. */
export const sternAt = (offset: number) => [offset * cos(STERN_TILT), -STERN_DROP + offset * sin(STERN_TILT)] as const;

/** The hull of the wrecked world ship: two halves broken apart, hull sections of `hullSet` (1 torn, 2 engine, 3 tower, 4 spar; 5, 6, 7 sections with its paint: PER ASPERA, emblem and registry, AD ASTRA). */
function derelict(): Placement[] {
  const pieces: Placement[] = [];
  // turned by roll, yaw and pitch in that order; 'ZYX' pitches last, about the world's z, as the
  // stern's hull is tilted, whatever the yaw
  // each half one body, welded (see Placement.weld): the bow 0, the stern 1
  let weld = 0;
  const add = (type: number, scale: number, x: number, y: number, z: number, yaw = 0, pitch = 0, roll = 0, order: THREE.EulerOrder = 'XYZ') =>
    pieces.push({
      kind: 'hull',
      type,
      scale,
      position: new THREE.Vector3(x, y, z),
      orientation: setFromEuler(new THREE.Quaternion(), roll, yaw, pitch, order),
      solid: true,
      weld,
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
  weld = 1;
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
 * Under the real sky (see world/starmap) the nebulae are veils of the arena's own light (dust,
 * the ring's glow, the sun's streamers), kept faint where they would cover the Milky Way as a
 * second, made-up one.
 */
const MOODS: Record<ArenaId, Mood> = {
  // dusty and warm: veils of amber and rust dust, a warm sky, ochre dust, a golden grade
  belt: {
    space: 0x040201,
    sky: 0xa08a70,
    ground: 0x30200f,
    ambient: 1.6,
    nebulae: [
      { at: [-1, 0.25, 0.3], color: [0.13, 0.06, 0.017], size: 576000, shape: 0, turn: 0.4 },
      { at: [0.75, -0.45, 0.55], color: [0.09, 0.033, 0.012], size: 504000, shape: 1, turn: 2.1 },
      { at: [0.15, 0.85, 0.6], color: [0.06, 0.039, 0.02], size: 432000, shape: 2, turn: 4 },
    ],
    stars: 0.75,
    starmap: true,
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
      { at: [0.7, 0.12, -0.7], color: [0.072, 0.084, 0.13], size: 648000, shape: 2, turn: 1.5 },
      { at: [-0.4, 0.55, 0.75], color: [0.095, 0.07, 0.033], size: 468000, shape: 0, turn: 3.3 },
      { at: [0.3, -0.7, 0.6], color: [0.043, 0.05, 0.085], size: 432000, shape: 1, turn: 0.7 },
    ],
    stars: 1,
    starmap: true,
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
      { at: [-0.6, 0.6, 0.5], color: [0.017, 0.026, 0.08], size: 612000, shape: 1, turn: 2.6 },
      { at: [0.5, 0.75, -0.4], color: [0.013, 0.033, 0.06], size: 504000, shape: 2, turn: 0.2 },
    ],
    stars: 1,
    starmap: true,
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
    starmap: true,
    dust: [0.72, 0.6, 0.45],
    grade: { gain: [1.04, 1, 0.92], lift: [0.0024, 0.0014, 0.0005], saturation: 1 },
  },
  // orange-white and blinding: the sky is the sun's scattered light, never black (see
  // world/corona), and lights everything warm from the sun's side, dim and orange from the far
  // side, so the shadows stay hard and dark; it drowns most stars, and the sun's outer
  // streamers glow across the sky
  corona: {
    space: 0x0a0402,
    sky: 0xffe2bc,
    ground: 0x5a2a0c,
    ambient: 1.3,
    sunward: true,
    nebulae: [
      { at: [0.5, 0.3, -1], color: [0.36, 0.26, 0.14], size: 756000, shape: 2, turn: 0.9 },
      { at: [-0.3, 0.05, -1], color: [0.24, 0.15, 0.07], size: 684000, shape: 0, turn: 2.5 },
      { at: [-0.6, -0.4, 0.7], color: [0.091, 0.039, 0.013], size: 540000, shape: 1, turn: 4.2 },
    ],
    stars: 0.15,
    starmap: true,
    dust: [0.9, 0.7, 0.5],
    grade: { gain: [1.06, 1, 0.9], lift: [0.006, 0.0032, 0.0011], saturation: 1 },
  },
  // warm and dark: a dark starfield (its stars a little brighter) with two faint dusky veils, so nothing
  // but the hole's own gas glows around it; a dim warm sky, warm dust, a warm grade
  hole: {
    space: 0x030202,
    sky: 0x5c4a3e,
    ground: 0x0e0806,
    ambient: 1,
    nebulae: [
      { at: [-1, 0.3, 0.2], color: [0.026, 0.02, 0.017], size: 612000, shape: 0, turn: 1 },
      { at: [0.6, -0.5, 0.8], color: [0.03, 0.017, 0.011], size: 504000, shape: 1, turn: 3.6 },
    ],
    stars: 1.15,
    starmap: true,
    dust: [0.85, 0.74, 0.62],
    grade: { gain: [1.03, 0.99, 0.94], lift: [0.0012, 0.0007, 0.0004], saturation: 1.03 },
  },
  // cold, washed out and solemn: a graveyard; a dim pale sun, a cold grey sky, one pale veil
  // over the wreck like a shroud, the colors drained
  derelict: {
    space: 0x020306,
    sky: 0x7c8aa0,
    ground: 0x15191f,
    ambient: 1.3,
    nebulae: [
      { at: [-0.3, 0.8, 0.4], color: [0.06, 0.07, 0.085], size: 612000, shape: 2, turn: 2 },
      { at: [0.7, -0.3, 0.6], color: [0.025, 0.03, 0.04], size: 504000, shape: 0, turn: 4.4 },
    ],
    stars: 0.9,
    starmap: true,
    dust: [0.55, 0.6, 0.66],
    grade: { gain: [0.97, 0.99, 1.02], lift: [0.001, 0.0015, 0.0022], saturation: 0.78 },
  },
  // the Belt gone cold: a grey-blue veil of the yard's dust, the sky's light pale, from below the
  // dull metal of Psyche, a cool grade with little color
  boneyard: {
    space: 0x020305,
    sky: 0x8894a4,
    ground: 0x2a2622,
    ambient: 1.4,
    nebulae: [
      { at: [-0.9, 0.3, 0.3], color: [0.05, 0.055, 0.07], size: 576000, shape: 0, turn: 1.1 },
      { at: [0.6, 0.6, -0.5], color: [0.035, 0.035, 0.04], size: 468000, shape: 1, turn: 3.6 },
    ],
    stars: 0.8,
    starmap: true,
    dust: [0.6, 0.62, 0.66],
    grade: { gain: [0.98, 1, 1.03], lift: [0.0012, 0.0014, 0.002], saturation: 0.82 },
  },
  // Vesta's flank: a sun farther off than at Psyche, the sky's light the warm grey of the basalt
  // below, the Belt's dust a little brown, a grade between the Belt's warmth and the yard's cold
  rheasilvia: {
    space: 0x030304,
    sky: 0x9a9286,
    ground: 0x3a342d,
    ambient: 1.3,
    nebulae: [
      { at: [-0.7, 0.4, 0.6], color: [0.06, 0.05, 0.045], size: 540000, shape: 1, turn: 0.7 },
      { at: [0.5, 0.7, -0.5], color: [0.04, 0.038, 0.036], size: 420000, shape: 0, turn: 2.4 },
    ],
    stars: 0.85,
    starmap: true,
    dust: [0.66, 0.62, 0.56],
    grade: { gain: [1.01, 1, 0.98], lift: [0.0016, 0.0014, 0.0012], saturation: 0.86 },
  },
  // Occator's wall: Ceres's dark dust, the sky's light the cold grey of it with the town's warm
  // glow from below, a grade a little colder than Vesta's, the neon carrying the color
  occator: {
    space: 0x020304,
    sky: 0x7c8088,
    ground: 0x2c2826,
    ambient: 1.25,
    nebulae: [
      { at: [-0.6, 0.5, 0.6], color: [0.045, 0.05, 0.06], size: 540000, shape: 0, turn: 1.9 },
      { at: [0.7, 0.5, -0.4], color: [0.05, 0.035, 0.045], size: 420000, shape: 1, turn: 0.4 },
    ],
    stars: 0.85,
    starmap: true,
    dust: [0.58, 0.6, 0.64],
    grade: { gain: [0.99, 1, 1.02], lift: [0.0012, 0.0013, 0.0017], saturation: 0.88 },
  },
  // the Solar Wall: open space on the lane to Mars, black and cold, the sun low beside the wall,
  // the searchlights' white and the sign's gold the only warmth
  wall: {
    space: 0x010203,
    sky: 0x5c6470,
    ground: 0x1a1c20,
    ambient: 1.1,
    nebulae: [
      { at: [0.7, 0.3, 0.6], color: [0.05, 0.03, 0.03], size: 560000, shape: 1, turn: 2.2 },
      { at: [-0.6, 0.6, -0.4], color: [0.03, 0.035, 0.05], size: 460000, shape: 0, turn: 0.9 },
    ],
    stars: 0.9,
    starmap: true,
    dust: [0.5, 0.52, 0.56],
    grade: { gain: [0.98, 1, 1.03], lift: [0.001, 0.0011, 0.0016], saturation: 0.84 },
  },
  // Phobos: its dark dust under Mars's rust-red glow, the sky's light warm from Mars's side
  phobos: {
    space: 0x020203,
    sky: 0x8a6a58,
    ground: 0x2a1e18,
    ambient: 1.2,
    nebulae: [
      { at: [-0.6, 0.4, -0.6], color: [0.04, 0.035, 0.045], size: 520000, shape: 0, turn: 1.4 },
      { at: [0.7, 0.3, 0.5], color: [0.06, 0.035, 0.025], size: 460000, shape: 1, turn: 2.8 },
    ],
    stars: 0.85,
    starmap: true,
    dust: [0.6, 0.52, 0.46],
    grade: { gain: [1.02, 1, 0.97], lift: [0.0016, 0.0012, 0.001], saturation: 0.9 },
  },
  // Valhalla: Callisto's dark, icy ground under Jupiter's cream and rust, the sky's light warm
  // from Jupiter's side, a far sun, a grade a little warmer than the inner moons'
  callisto: {
    space: 0x020202,
    sky: 0x9a8a70,
    ground: 0x24201a,
    ambient: 1.3,
    nebulae: [
      { at: [-0.6, 0.5, -0.5], color: [0.06, 0.04, 0.025], size: 540000, shape: 2, turn: 0.7 },
      { at: [0.6, 0.3, 0.6], color: [0.03, 0.035, 0.045], size: 460000, shape: 0, turn: 2.1 },
    ],
    stars: 0.9,
    starmap: true,
    dust: [0.64, 0.6, 0.54],
    grade: { gain: [1.02, 1, 0.95], lift: [0.0015, 0.0012, 0.0008], saturation: 0.92 },
  },
  // the Lineae: Europa's bright, cold ice under Jupiter's cream, the sky's light from the ice
  // itself, a grade cooler than Callisto's
  europa: {
    space: 0x020203,
    sky: 0x9aa4b0,
    ground: 0x3a4048,
    ambient: 1.35,
    nebulae: [
      { at: [-0.6, 0.5, -0.5], color: [0.055, 0.04, 0.03], size: 540000, shape: 2, turn: 1.3 },
      { at: [0.6, 0.3, 0.6], color: [0.03, 0.04, 0.055], size: 460000, shape: 0, turn: 0.4 },
    ],
    stars: 0.9,
    starmap: true,
    dust: [0.66, 0.7, 0.76],
    grade: { gain: [0.98, 1, 1.03], lift: [0.0012, 0.0013, 0.0016], saturation: 0.9 },
  },
  // Flux on Io: sulfur yellow under Jupiter's cream, the lava's orange from below, a warm grade
  io: {
    space: 0x030202,
    sky: 0xa89a70,
    ground: 0x4a3a18,
    ambient: 1.3,
    nebulae: [
      { at: [-0.6, 0.5, -0.5], color: [0.06, 0.045, 0.02], size: 540000, shape: 1, turn: 0.9 },
      { at: [0.6, 0.3, 0.6], color: [0.045, 0.03, 0.06], size: 460000, shape: 2, turn: 2.6 },
    ],
    stars: 0.9,
    starmap: true,
    dust: [0.72, 0.64, 0.42],
    grade: { gain: [1.03, 1, 0.94], lift: [0.0016, 0.0012, 0.0006], saturation: 0.95 },
  },
  // the Tug Yards: grey ice over Ganymede's grey and brown ground, Jupiter's cream from above
  ganymede: {
    space: 0x020203,
    sky: 0x9a968a,
    ground: 0x2a2826,
    ambient: 1.3,
    nebulae: [
      { at: [-0.6, 0.5, -0.5], color: [0.05, 0.04, 0.03], size: 540000, shape: 0, turn: 1.7 },
      { at: [0.6, 0.3, 0.6], color: [0.035, 0.04, 0.05], size: 460000, shape: 2, turn: 0.2 },
    ],
    stars: 0.9,
    starmap: true,
    dust: [0.66, 0.66, 0.66],
    grade: { gain: [1, 1, 1], lift: [0.0013, 0.0013, 0.0013], saturation: 0.88 },
  },
  // Kraken Mare: over the haze a dim, cold sky and Saturn's cream; under it all orange twilight
  titan: {
    space: 0x030201,
    sky: 0xa07850,
    ground: 0x3a2410,
    ambient: 1.4,
    nebulae: [
      { at: [-0.6, 0.5, -0.5], color: [0.07, 0.045, 0.02], size: 540000, shape: 1, turn: 2.2 },
      { at: [0.6, 0.3, 0.6], color: [0.04, 0.035, 0.03], size: 460000, shape: 0, turn: 1.1 },
    ],
    stars: 0.8,
    starmap: true,
    dust: [0.8, 0.6, 0.38],
    grade: { gain: [1.05, 1, 0.9], lift: [0.002, 0.0012, 0.0005], saturation: 0.95 },
  },
};

/**
 * The places of the campaign Lot 7731 (see docs/campaign/): flown alone, never in a tournament's
 * order of arenas. The Boneyard on Psyche: rows of racks of dead fighters (see world/yard) with
 * the lane to the yard office open through the middle, the yard's spoil (a few rocks) around
 * them, Psyche's metal 6 km below.
 */
export const PLACES: readonly ArenaProfile[] = [
  {
    id: 'boneyard',
    name: msg('The Boneyard'),
    tagline: msg('Forty thousand dead fighters in their racks, on a world of metal.'),
    // the yard's spoil: boulders of Psyche's metal pushed out to the yard's edge, lying just over the crater floor, still
    layout: { key: 'boneyard', seed: 7731, kind: 'rock', count: 18, minScale: 0.2, maxScale: 0.35, radius: FIELD_RADIUS, inner: FIELD_RADIUS * 0.85, flat: 30, lift: GROUND + 700, spin: 0, toughness: 800, placements: boneyardRacks(), fall: PSYCHE_FALL },
    cooling: 1,
    storms: false,
    sun: { size: 30000, intensity: 3, color: 0xfff0dc },
    mood: MOODS.boneyard,
    preview: { from: [20000, 9000, 30000] },
    references: [{ glyph: 'planet', label: msg('Psyche'), position: PSYCHE_CENTER, distance: true, radius: PSYCHE_RADIUS }],
    // in the lane beside rack 7731, at the yard's far end, facing down the lane to the office
    start: { at: [-YARD_END, RACK_Y, 0], toward: [BAY_MOUTH, RACK_Y, 0] },
    open: true,
  },
  {
    id: 'rheasilvia',
    name: msg('Rheasilvia'),
    tagline: msg('Claims on the flank of a mountain twice as high as Everest, in a crater nearly as wide as Vesta.'),
    // the claims: boulders of the peak's basalt lying on its flank (see world/vesta), set down on the slope
    layout: { key: 'rheasilvia', seed: 2002, kind: 'rock', count: 22, minScale: 1.6, maxScale: 3.2, radius: FIELD_RADIUS, inner: 0, flat: 30, lift: VESTA_GROUND, rest: { height: VESTA_GROUND, rise: RISE }, spin: 0, toughness: 800, placements: [slopeGround(VESTA_GROUND_TYPE)], fall: VESTA_FALL },
    cooling: 1,
    storms: false,
    // 2.4 AU from the sun, nearer than Psyche's 2.9: a little larger and brighter
    sun: { size: 36000, intensity: 3.4, color: 0xfff2e0 },
    mood: MOODS.rheasilvia,
    preview: { from: [26000, 9000, 30000] },
    references: [{ glyph: 'planet', label: msg('The summit'), position: SUMMIT, distance: true }],
    // down the flank from the claims, some 360 m over it, facing up the slope towards them
    start: { at: [-24000, 0, 6000], toward: [30000, 6000, 0] },
    open: true,
  },
  {
    id: 'occator',
    name: msg('Occator'),
    tagline: msg('The Rockborn capital, cut into the wall of a crater whose salt shines like two lamps left on.'),
    // a few boulders fallen from the wall, lying on the market terrace
    layout: { key: 'occator', seed: 3003, kind: 'rock', count: 8, minScale: 0.25, maxScale: 0.5, radius: FIELD_RADIUS, inner: 0, flat: 30, lift: TERRACE, rest: { height: TERRACE, rise: 0 }, spin: 0, toughness: 800, placements: occatorPlacements(OCCATOR_TYPE), fall: CERES_FALL },
    cooling: 1,
    storms: false,
    // 2.8 AU from the sun, a little nearer than Psyche
    sun: { size: 31000, intensity: 3.1, color: 0xfff0dc },
    mood: MOODS.occator,
    preview: { from: onPlace(-30000, 6000, 20000).toArray() },
    references: [
      { glyph: 'planet', label: msg('Cerealia Facula'), position: CEREALIA, distance: true },
      { glyph: 'planet', label: msg('The market'), position: MARKET, distance: true },
    ],
    // out over the terrace's edge, some 160 m over it, facing the wall and the market
    start: { at: onPlace(-30000, 2000, 0).toArray(), toward: MARKET.toArray() },
    open: true,
  },
  {
    id: 'wall',
    name: msg('The Solar Wall'),
    tagline: msg('The biggest wall in the history of walls, and Mars is going to pay for it.'),
    // a few pieces of rubble drifting by the wall, all else open space
    layout: { key: 'wall', seed: 3500, kind: 'rock', count: 6, minScale: 0.2, maxScale: 0.45, radius: FIELD_RADIUS, inner: FIELD_RADIUS * 0.5, flat: 20, spin: SPIN_RATE, toughness: 800, placements: [wallPlacement(WALL_TYPE)] },
    cooling: 1,
    storms: false,
    // 1.8 AU from the sun, on the lane from the Belt to Mars
    sun: { size: 40000, intensity: 3.6, color: 0xfff4e6 },
    mood: MOODS.wall,
    preview: { from: [-50000, 14000, 30000] },
    references: [{ glyph: 'planet', label: msg('The wall'), position: new THREE.Vector3(0, WALL_TOP, 0), distance: true }],
    // 2 km before the wall, facing it
    start: { at: [-40000, 0, 0], toward: [0, WALL_TOP, 0] },
    open: true,
  },  {
    id: 'phobos',
    name: msg('Stickney'),
    tagline: msg('The great crater of Phobos, and Mars filling half the sky.'),
    // nothing loose on the ground: its relief alone
    layout: { key: 'phobos', seed: 4000, kind: 'rock', count: 0, minScale: 1, maxScale: 1, radius: FIELD_RADIUS, inner: 0, spin: 0, toughness: 800, placements: [groundPlacement(PHOBOS_TYPE)], fall: PHOBOS_FALL },
    cooling: 1,
    storms: false,
    // 1.5 AU from the sun
    sun: { size: 46000, intensity: 3.8, color: 0xfff4e6 },
    mood: MOODS.phobos,
    preview: { from: [40000, 10000, 20000], at: [-20000, -10000, 0] },
    references: [
      { glyph: 'planet', label: msg('Stickney'), position: STICKNEY_FLOOR, distance: true },
      { glyph: 'planet', label: msg('Mars'), position: MARS_AT, distance: false },
    ],
    // over the crater's rim, facing down into it
    start: { at: [30000, 2000, 0], toward: [-20000, -8000, 0] },
    open: true,
  },
  {
    id: 'callisto',
    name: msg('Valhalla'),
    tagline: msg('The great basin of Callisto, its rings frozen like ripples in a pond, and Jupiter standing still over it.'),
    // nothing loose on the ground: its relief alone
    layout: { key: 'callisto', seed: 5000, kind: 'rock', count: 0, minScale: 1, maxScale: 1, radius: FIELD_RADIUS, inner: 0, spin: 0, toughness: 800, placements: [callistoGround(CALLISTO_TYPE), postPlacement(POST_TYPE)], fall: CALLISTO_FALL },
    cooling: 1,
    storms: false,
    // 5.2 AU from the sun, as Jupiter's arena
    sun: { size: 30000, intensity: 3.4, color: 0xfff0dd },
    mood: MOODS.callisto,
    preview: { from: [30000, 8000, 30000], at: [-20000, -2000, 0] },
    references: [
      { glyph: 'planet', label: msg('Valhalla'), position: VALHALLA_MARK, distance: true },
      { glyph: 'planet', label: msg('Jupiter'), position: JUPITER_AT, distance: false },
    ],
    // over the ground, facing along the rings towards the basin
    start: { at: [30000, 2000, 0], toward: [-30000, 0, 0] },
    open: true,
  },
  {
    id: 'europa',
    name: msg('The Lineae'),
    tagline: msg('The cracked ice shell of Europa over its hidden ocean, and Jupiter hanging huge in its sky.'),
    // nothing loose on the ice: its relief, and the science station in the Crack
    layout: { key: 'europa', seed: 6000, kind: 'rock', count: 0, minScale: 1, maxScale: 1, radius: FIELD_RADIUS, inner: 0, spin: 0, toughness: 800, placements: [europaGround(EUROPA_TYPE), stationPlacement(STATION_TYPE, POST_HALF)], fall: EUROPA_FALL },
    cooling: 1,
    storms: false,
    // 5.2 AU from the sun, as Jupiter's arena
    sun: { size: 30000, intensity: 3.4, color: 0xfff0dd },
    mood: MOODS.europa,
    preview: { from: [30000, 8000, 30000], at: [0, -4000, -10000] },
    references: [
      { glyph: 'planet', label: msg('The Crack'), position: CRACK_MARK, distance: true },
      { glyph: 'planet', label: msg('Jupiter'), position: EUROPA_JUPITER, distance: false },
    ],
    // over the ice beside the Crack, facing along it
    start: { at: [30000, 2000, 20000], toward: [0, 0, -30000] },
    open: true,
  },
  {
    id: 'io',
    name: msg('Flux'),
    tagline: msg('The sulfur plains of Io, a lava lake in its pit, and the flux tube crackling up to Jupiter.'),
    // nothing loose on the plain: its relief alone
    layout: { key: 'io', seed: 7000, kind: 'rock', count: 0, minScale: 1, maxScale: 1, radius: FIELD_RADIUS, inner: 0, spin: 0, toughness: 800, placements: [ioGround(IO_TYPE)], fall: IO_FALL },
    cooling: 1,
    storms: false,
    // 5.2 AU from the sun, as Jupiter's arena
    sun: { size: 30000, intensity: 3.4, color: 0xfff0dd },
    mood: MOODS.io,
    preview: { from: [30000, 8000, 30000], at: [0, -2000, 0] },
    references: [
      { glyph: 'planet', label: msg('The flux tube'), position: FLUX_MARK, distance: true },
      { glyph: 'planet', label: msg('Jupiter'), position: IO_JUPITER, distance: false },
    ],
    // over the plain, facing the flux tube
    start: { at: [40000, 2000, 30000], toward: [2000, 0, -2000] },
    open: true,
  },
  {
    id: 'ganymede',
    name: msg('The Tug Yards'),
    tagline: msg('Blocks of ice the tugs hauled in, parked over the grooves of Ganymede, where the Loose hide.'),
    // the yard's blocks of ice, floating in a layer 400 m thick over the ground far below
    layout: { key: 'ganymede', seed: 8000, kind: 'ice', count: 28, minScale: 0.3, maxScale: 0.9, radius: FIELD_RADIUS, inner: 6000, flat: 4000, spin: SPIN_RATE, toughness: 600, placements: [ganymedeGround(GANYMEDE_TYPE)], fall: GANYMEDE_FALL },
    cooling: 1,
    storms: false,
    // 5.2 AU from the sun, as Jupiter's arena
    sun: { size: 30000, intensity: 3.4, color: 0xfff0dd },
    mood: MOODS.ganymede,
    preview: { from: [30000, 8000, 30000], at: [0, -2000, 0] },
    references: [{ glyph: 'planet', label: msg('Jupiter'), position: GANYMEDE_JUPITER, distance: false }],
    // at the yard's edge, facing into it
    start: { at: [45000, 1000, 30000], toward: [0, 0, 0] },
    open: true,
  },
  {
    id: 'titan',
    name: msg('Kraken Mare'),
    tagline: msg('Titan’s methane sea under its orange haze, and Saturn over the haze, its ring a thin line.'),
    // nothing loose: the haze, and the sea under it
    layout: { key: 'titan', seed: 9000, kind: 'rock', count: 0, minScale: 1, maxScale: 1, radius: FIELD_RADIUS, inner: 0, spin: 0, toughness: 800, placements: [titanSea(TITAN_TYPE)], fall: TITAN_FALL, air: TITAN_AIR },
    cooling: 1,
    storms: false,
    // 9.5 AU from the sun, a small cold disk
    sun: { size: 16000, intensity: 3, color: 0xfff0dd },
    mood: MOODS.titan,
    hazeLight: { deck: TITAN_DECK_LIGHT, deep: TITAN_DEEP_LIGHT },
    preview: { from: [30000, 6000, 30000], at: [0, -6000, 0] },
    references: [{ glyph: 'planet', label: msg('Saturn'), position: TITAN_SATURN, distance: false }],
    // over the haze, facing down into it
    start: { at: [40000, 2000, 30000], toward: [0, -8000, 0] },
    open: true,
  },
];

/** Every arena. A tournament plays them in an order of its own; the default arena (see DEFAULT_ARENA) is the home of the flight school. */
export const ARENAS: readonly ArenaProfile[] = [
  {
    id: 'belt',
    name: msg('The Belt'),
    tagline: msg('Forty rocks, ten ships long each. Cover is everywhere.'),
    layout: { key: 'belt', seed: 11, kind: 'rock', count: 40, minScale: 2.5, maxScale: 7, radius: FIELD_RADIUS, inner: 0, spin: SPIN_RATE, toughness: 800, course: { form: 'circuit', layout: 'grand' } },
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
      course: { form: 'circuit', layout: 'sweep' },
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
    sheet: RING_SHEET,
    cooling: 1.2,
    storms: false,
    sun: { size: 26000, intensity: 3, color: 0xf2f4ff },
    mood: MOODS.rings,
    references: [{ glyph: 'planet', label: msg('Saturn'), position: SATURN_CENTER, distance: false }],
  },
  {
    id: 'junkyard',
    name: msg('The Satellite Junkyard'),
    tagline: msg('The Orbital Freedom Network rots in orbit. Its junk crosses at 25 m/s; Earth glows below.'),
    layout: {
      key: 'junkyard',
      seed: 31,
      // its junk orbits across the loop: two straights between two bends, lined up for between them
      course: { form: 'circuit', layout: 'sweep' },
      kind: 'debris',
      count: 90,
      minScale: 1,
      maxScale: 3,
      radius: FIELD_RADIUS * 1.2,
      inner: 12000,
      orbit: { axis: 'random', speed: 500 },
      spin: 0.15,
      toughness: 500,
      // the network's dead relay hub in the middle: an engine block and two spars across, one body
      placements: [
        { kind: 'hull', type: 2, scale: 6, position: new THREE.Vector3(0, 0, 0), orientation: new THREE.Quaternion(), solid: true, weld: 0 },
        { kind: 'hull', type: 4, scale: 8, position: new THREE.Vector3(0, 0, 0), orientation: setFromAxisAngle(new THREE.Quaternion(), new THREE.Vector3(0, 1, 0), Math.PI / 2), solid: true, weld: 0 },
        { kind: 'hull', type: 4, scale: 8, position: new THREE.Vector3(0, 0, 0), orientation: setFromAxisAngle(new THREE.Quaternion(), new THREE.Vector3(0, 0, 1), Math.PI / 2), solid: true, weld: 0 },
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
      course: { form: 'circuit', layout: 'grand' },
      seed: 47,
      kind: 'rock',
      count: 22,
      minScale: 2,
      maxScale: 5,
      radius: FIELD_RADIUS,
      inner: 0,
      spin: SPIN_RATE,
      toughness: 800,
      well: { position: JUPITER_CENTER, radius: JUPITER_RADIUS - JUPITER_FLOOR, surfaceGravity: JUPITER_GRAVITY * pow(JUPITER_RADIUS / (JUPITER_RADIUS - JUPITER_FLOOR), 2) },
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
    layout: { key: 'corona', seed: 59, kind: 'rock', count: 30, minScale: 2.5, maxScale: 6, radius: FIELD_RADIUS, inner: 0, spin: SPIN_RATE, toughness: 800, course: { form: 'circuit', layout: 'hairpin' } },
    cooling: 0.6,
    storms: true,
    sun: { size: 150000, intensity: 9, color: 0xffe0b4 },
    mood: MOODS.corona,
    references: [],
  },
  {
    id: 'hole',
    name: msg('Event Horizon'),
    tagline: msg('A black hole in the middle pulls everything in. Past 555 m no drive gets out.'),
    layout: {
      key: 'hole',
      seed: 61,
      course: { form: 'ellipse', near: 32000, far: 52000 },
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
      well: { position: new THREE.Vector3(0, 0, 0), radius: HOLE_RADIUS, surfaceGravity: (HOLE_PULL * HOLE_PULL_AT * HOLE_PULL_AT) / (HOLE_RADIUS * HOLE_RADIUS) },
    },
    cooling: 1,
    storms: false,
    sun: { size: 20000, intensity: 2.6, color: 0xffe6cc },
    mood: MOODS.hole,
    preview: { from: [40000, 16000, 40000] },
    // the hole is the field's center: it takes the center's mark, measured to its horizon
    references: [{ glyph: 'hole', label: msg('Black hole'), position: new THREE.Vector3(), distance: true, radius: HOLE_RADIUS }],
  },
  {
    id: 'derelict',
    name: msg('The Derelict'),
    tagline: msg('A world ship, broken in two. Nothing else out here: only its hull to hide behind.'),
    layout: { key: 'derelict', seed: 71, kind: 'rock', count: 0, minScale: 1, maxScale: 1, radius: FIELD_RADIUS, inner: 0, spin: 0, toughness: 800, course: { form: 'circuit', layout: 'sweep' }, placements: derelict() },
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

export const arenaById = (id: string): ArenaProfile | undefined => ARENAS.find((arena) => arena.id === id) ?? PLACES.find((place) => place.id === id);

/** The arena the game shows unless something else is chosen: the menu's backdrop, the flight school's home and the solo round's first choice. */
export const DEFAULT_ARENA: ArenaProfile = arenaById('rings')!;

/** The arena whose field has this layout key (see FieldState). */
export const arenaByKey = (key: string): ArenaProfile | undefined => ARENAS.find((arena) => arena.layout.key === key) ?? PLACES.find((place) => place.layout.key === key);

/**
 * The arena of a tournament round: the room's code shuffles the arenas into an order of its
 * own, and the rounds walk through it, so no arena comes twice before all others have come.
 * Every browser works it out alike from code and round.
 */
export function arenaOfRound(room: string, round: number): ArenaProfile {
  const order = ARENAS.map((arena, i) => ({ arena, key: hash(textSeed(room), i, 13) })).sort((a, b) => a.key - b.key);
  return order[round % order.length].arena;
}
