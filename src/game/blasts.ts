import * as THREE from 'three';
import type { Asteroid, AsteroidField } from '../world/asteroids';
import { METERS_PER_UNIT } from '../ship/flight';

/**
 * Big blasts by their energy. In vacuum there is no blast wave: a blast kills by the radiation
 * and the debris it throws, so what it does falls with the square of the distance (its fluence,
 * the energy per area, E / 4πd²). A hull dies where that reaches KILL_FLUENCE; so a blast's
 * energy follows from how far it kills, E = 4π r² KILL_FLUENCE, the same rule for each:
 *
 * - a nova core, killing out to 800 m: about 8e13 J, some 19 kilotons of TNT, the annihilation of
 *   less than a gram of antimatter in a sponsor's core (E = mc²: 0.9 g of matter and antimatter);
 * - the President's battleship going down, out to 1 km: about 1.3e14 J, its reactor scrammed,
 *   the blast what was left in its loops;
 * - an interceptor's self-destruct, out to 60 m: about 4.5e11 J, its reactor overloaded on purpose.
 *
 * Rock caught in one breaks when the energy its face takes in (its cross-section πR² of the
 * fluence, times COUPLING) passes what disrupts it: DISRUPT (J/kg) of its mass, a loose pile of
 * rubble held together by its own weak gravity. So a blast breaks a rock out to
 * d = √(3·COUPLING·E / (16π·DISRUPT·ρ·R)): a nova a 110 m rock within about 300 m, a fragment of
 * 20 m within about 700 m, a 350 m rock only within about 170 m. Ice is lighter and weaker. A
 * rock in the way shields what lies behind it, from the radiation as from the debris.
 */

/** The fluence that kills a fighter's hull (J/m²): about 1e7, an order of magnitude (the game's own figure). */
export const KILL_FLUENCE = 1e7;
/** The share of the fluence a rock's face takes in that goes into breaking it apart (the rest re-radiates or boils off its skin): a few tenths. */
export const COUPLING = 0.4;
/** What disrupts a body of rubble a hundred meters across (J/kg), of the order of 10² for rock; ice's lower. */
const DISRUPT = { rock: 90, ice: 40 } as const;
/** Their densities (kg/m³): loose rock and porous ice. */
const DENSITY = { rock: 2000, ice: 900 } as const;

/** A blast's energy (J) from how far it kills a hull (units). */
export function blastEnergy(killRadius: number): number {
  const r = killRadius * METERS_PER_UNIT;
  return 4 * Math.PI * r * r * KILL_FLUENCE;
}

/** How far from a blast of `energy` (J) a piece of `kind` and mean radius `meanRadius` (units) still breaks (units, center to center). */
export function breakReach(energy: number, meanRadius: number, kind: 'rock' | 'ice'): number {
  const radius = Math.max(1, meanRadius * METERS_PER_UNIT);
  const reach = Math.sqrt((3 * COUPLING * energy) / (16 * Math.PI * DISRUPT[kind] * DENSITY[kind] * radius));
  return reach / METERS_PER_UNIT;
}

/** The grid of field time a blast breaks rock on (s): the comet's (comet BREAK_STEP; comet.ts takes the nova's energy from here, so the grid is kept here too, the test holding them alike). */
export const BLAST_STEP = 0.1;
/** A blast's field time on that grid, alike on every browser that heard of it. */
export const blastTime = (at: number) => Math.floor(at / BLAST_STEP) * BLAST_STEP;

const toward = new THREE.Vector3();

/**
 * The pieces of rock and ice a blast of `energy` (J) at `center` breaks at field time `at`
 * (see breakReach): each whole one into its fragments, a fragment to dust, as the comet breaks
 * them; nothing that stands, is solid or is a world's ground. Each is chosen before any breaks,
 * by id, so every browser breaks the same; a piece shielded by another between it and the blast
 * stands. Returns what broke.
 */
export function blastBreaks(field: AsteroidField, center: THREE.Vector3, energy: number, at: number): Asteroid[] {
  const doomed: Asteroid[] = [];
  for (const rock of field.asteroids.values()) {
    if (rock.solid || rock.ground || (rock.kind !== 'rock' && rock.kind !== 'ice')) continue;
    const distance = rock.object.position.distanceTo(center);
    if (distance > breakReach(energy, rock.meanRadius, rock.kind)) continue;
    // the first piece on the line from the blast to it is it: nothing shields it
    if (distance > rock.radius) {
      toward.subVectors(rock.object.position, center).divideScalar(distance);
      if (field.raycast(center, toward, distance)?.asteroid !== rock) continue;
    }
    doomed.push(rock);
  }
  doomed.sort((p, q) => (p.id < q.id ? -1 : p.id > q.id ? 1 : 0));
  const broken: Asteroid[] = [];
  for (const rock of doomed) {
    const piece = rock.generation === 0 ? field.shatter(rock.id, at) : field.pulverize(rock.id, at);
    if (piece) broken.push(piece);
  }
  return broken;
}
