import * as THREE from 'three';

/**
 * The Satellite Junkyard's pieces as what they are built of (README, "The Satellite Junkyard"):
 * thin sheets (a solar wing's panels, a fairing's composite shell, an empty stage's tank walls)
 * and dense cores (a satellite's bus, a stage's thrust frame and engine, a stack of satellites
 * packed as they were launched). A hull meeting a sheet punches through it: it carries the plug
 * it tears out along and flies on, the piece taking that plug's momentum and a tumble. A hull
 * meeting a core strikes the whole piece, the two trading momentum by their masses, so a light
 * satellite is knocked away where a stack stops a ship as rock does. The same on every browser:
 * every number here is fixed, from the shapes' own measures.
 */

/** The kinds of junk (see world/shapes, debrisSet). */
export type JunkKind = 'satellite' | 'shredded' | 'stage' | 'fairing' | 'stack' | 'sign';

/** What a junk template is built of, in its own frame and at its own size (see debrisSet); a piece of it grown by `scale` (see junkMass). */
export interface JunkBuild {
  kind: JunkKind;
  /** The mass of its sheets and of what grows with them (kg at the template's size; by the square of a piece's scale). */
  sheets: number;
  /** The mass of its dense core (kg at the template's size; by the cube of a piece's scale). */
  core: number;
  /** Where its core lies along its long axis (x in the template's frame, units): a strike there meets the whole piece; elsewhere a sheet. Everywhere for a stack, nowhere for a fairing. */
  hard: { min: number; max: number } | 'all' | null;
  /** The mass per square meter a hull punches out of its sheets where it passes through (kg/m²: one panel, or a tank's two walls). */
  ply: number;
}

/** Meters per world unit. */
const METERS = 0.05;
/** A cubic or square meter in template units (see METERS). */
export const CUBIC = METERS * METERS * METERS;
export const SQUARE = METERS * METERS;

/**
 * Mass per square meter (kg/m²) of the sheets: a solar wing's rigid panels (cells on a
 * honeycomb board, about 2 to 3 kg/m² on satellites flying today), a payload fairing's carbon
 * skin over an aluminium honeycomb (a fairing half today, 13 m by 5 m, near a tonne: about
 * 10 kg/m²), an upper stage's tank wall with its stringers (a stage today, 12 m by 3.7 m, near
 * 4 t dry: about 20 kg/m² a wall).
 */
export const WING_SHEET = 3;
export const FAIRING_SHEET = 10;
export const TANK_WALL = 20;
/**
 * Density of a satellite's bus over its box (kg/m³): satellites today weigh 100 to 260 kg a
 * cubic meter of their bus (a flat one of the large constellations 260, a large one in a high
 * orbit nearer 100); the network's buses are many times their size and mostly empty, so the low
 * end. A stack packs its satellites so close that it weighs half as much again over its box.
 */
export const BUS_DENSITY = 100;
export const STACK_DENSITY = 150;
/** An upper stage's engine and thrust frame weigh this share of its tanks (a stage today: some half a tonne of a four tonnes dry). */
export const ENGINE_SHARE = 0.15;

/**
 * The cross-section an interceptor punches through a sheet with (m²): a hull 35 m long, nose
 * on, some 25 square meters of armor; the plug it tears out is that much of the sheet.
 */
export const FRONTAL_AREA = 25;

/** The mass of a piece of junk (kg) built as `build`, grown by `scale` from its template. */
export function junkMass(build: JunkBuild, scale: number): number {
  return build.sheets * scale * scale + build.core * scale * scale * scale;
}

/** The plug of sheet a hull tears out of a piece built as `build` (kg; see FRONTAL_AREA). */
export function plugMass(build: JunkBuild): number {
  return FRONTAL_AREA * build.ply;
}

/** Whether a point in a piece's template frame (`local`, see world/asteroids, Asteroid.inverse) lies on its core (see JunkBuild.hard). */
export function onCore(build: JunkBuild, local: THREE.Vector3): boolean {
  const hard = build.hard;
  if (hard === 'all') return true;
  return hard !== null && local.x >= hard.min && local.x <= hard.max;
}
