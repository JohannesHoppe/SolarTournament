import * as THREE from 'three';
import { hypot } from '../detmath';
import { COURIER_PLACES, MINING_PLACES } from '../campaign/missions';
import { MAX_HEAT } from '../ship/ship';
import { LASER_RANGE } from '../ship/ship';
import { HOOK_FLING } from '../game/school';
import { HOOK_RANGE } from '../game/hook';
import { CHARGE_BLAST } from '../game/charges';
import { wellMu } from '../game/orbit';
import type { Asteroid } from '../world/asteroids';
import { HATCHES, TOWER_HALF } from '../world/bridgetower';
import { GROOVE_WAY, inGrooves, surfaceHeight as phobosHeight } from '../world/phobos';
import { standard, type Behavior, type Intent } from './jobhost';
import type { JobWorld } from './jobs';

/**
 * What the simulated Host (see jobhost) does in a drill that asks for a maneuver of its own, by
 * job and by the drill's place in it; every other drill it flies as the default does. Each is a
 * pilot's way of doing what the drill's line asks, read off what the HUD and the window show.
 */

/** It fires while its laser is cooler than this (see Ship.heat), so it never locks up. */
const HOT = MAX_HEAT - 30;
/** It keeps this far off a rock's surface to wait for a glint among its pieces (units, 100 m). */
const CUT_STANDOFF = 2000;
/** It sets a charge this far off a rock's mean surface (units, 25 m): well within CHARGE_REACH. */
const CHARGE_STANDOFF = 500;
/** It waits for its charge this much farther off than the blast reaches (units, 50 m). */
const BLAST_MARGIN = 1000;
/** A marker on a rock sits on its middle as the step began; the rock may have drifted a little since (units, 2.5 m). */
const MARKER_SLACK = 50;
/** On target: the nose within this share of the target's apparent size. */
const ON = 0.6;

const aim = new THREE.Vector3();
const away = new THREE.Vector3();

/** Whether the nose points at a sphere (center, radius) closely enough to hit it. */
function onTarget(world: JobWorld, center: THREE.Vector3, radius: number): boolean {
  const flight = world.me.flight;
  const distance = center.distanceTo(flight.position);
  return flight.noseAngleTo(aim.subVectors(center, flight.position)) < (radius * ON) / Math.max(distance, 1);
}

/** Fire while on target, in reach, and the laser cool enough. */
const fireAt = (world: JobWorld, center: THREE.Vector3, radius: number) =>
  onTarget(world, center, radius) && center.distanceTo(world.me.flight.position) < LASER_RANGE * world.me.perks.laserReach * 0.95 && !world.me.overheated && world.me.heat < HOT;

/** The rock whose middle the marker sits on, if any: a marker on a rock asks for it cut. */
function rockAt(world: JobWorld, point: THREE.Vector3 | null): Asteroid | null {
  if (!point) return null;
  for (const rock of world.field.asteroids.values()) if (!rock.solid && rock.object.position.distanceTo(point) < MARKER_SLACK) return rock;
  return null;
}

/**
 * Breaking rock for its ore (First Cut, Cut and Haul, the mining runs): on a marker on a rock it
 * flies close in on the side it comes from and sets a charge (see game/charges), then flies clear
 * of the blast on the same side and waits for it; a marker on a glint of ore is flown through.
 */
const mine: Behavior = (world, pilot) => {
  // a charge of its own ticking close by: clear of its blast first, whatever the marker shows
  for (const set of world.charges.set) {
    const at = world.charges.positionOf(set, world.field, aim);
    if (at && at.distanceTo(world.me.flight.position) < CHARGE_BLAST + world.me.radius + BLAST_MARGIN) {
      world.note = `clear of the charge on ${set.rock}`;
      return { goto: at.clone().add(away.subVectors(world.me.flight.position, at).setLength(CHARGE_BLAST + world.me.radius + BLAST_MARGIN * 2)), look: at.clone() };
    }
  }
  const glint = world.waypoint;
  const rock = rockAt(world, glint);
  if (!glint) return standard(world, pilot);
  if (!rock) {
    // a glint still among the pieces it sprang from is waited for off them, until it drifts clear;
    // one come to rest against a rock that breaks is freed with a charge
    const among = world.field.overlap(glint, world.me.radius + 100);
    // a glint come to rest against a rock that breaks (on the ground under it, or in it) is freed with a charge
    const blocking = glintAtRest(glint) && world.chargesLeft > 0 ? blocker(world, glint) : null;
    if (blocking) return charge(world, blocking);
    if (!among || among.ground) return { goto: glint, cruise: 1200 };
    const center = among.object.position;
    world.note = `waiting for a glint in ${among.id}`;
    return { goto: center.clone().add(aim.subVectors(world.me.flight.position, center).setLength(among.radius + CUT_STANDOFF)), look: glint };
  }
  return charge(world, rock);
};

/** The piece of rock that breaks nearest a glint and close enough to keep the hull off it, if any. */
function blocker(world: JobWorld, glint: THREE.Vector3): Asteroid | null {
  let best: Asteroid | null = null;
  let nearest = world.me.radius * 2 + 100;
  for (const rock of world.field.asteroids.values()) {
    const gap = rock.object.position.distanceTo(glint) - rock.radius;
    if (gap < nearest && world.field.chargesFor(rock) > 0) {
      nearest = gap;
      best = rock;
    }
  }
  return best;
}

/** A glint that has not moved since the step before (come to rest on a world's ground). */
function glintAtRest(glint: THREE.Vector3): boolean {
  const was = lastGlint.get(glint);
  lastGlint.set(glint, glint.clone());
  return !!was && was.distanceTo(glint) < 0.01;
}
const lastGlint = new WeakMap<THREE.Vector3, THREE.Vector3>();

/** Flies close in to a rock on the side it comes from and sets a charge (see game/charges), then clear of the blast on the same side to wait for it. */
function charge(world: JobWorld, rock: Asteroid): Intent {
  const center = rock.object.position;
  const away = aim.subVectors(world.me.flight.position, center).normalize();
  // a charge of its own already ticking on the rock: clear of the blast, and wait
  if (world.charges.set.some((charge) => charge.rock === rock.id)) {
    world.note = `clear of the charge on ${rock.id}`;
    return { goto: center.clone().addScaledVector(away, rock.radius + CHARGE_BLAST + BLAST_MARGIN), look: center };
  }
  const spot = center.clone().addScaledVector(away, rock.meanRadius + CHARGE_STANDOFF);
  const close = world.charges.rockFor(world.field, world.me.flight.position, world.me.radius) === rock;
  world.note = `charge ${rock.id} r${Math.round(rock.radius)} at ${Math.round(center.distanceTo(world.me.flight.position))}`;
  return { goto: spot, look: center, charge: close && world.chargesLeft > 0, cruise: 1500 };
}

/** The hulls drifting at Patience, each shot before it strikes her (Docking Lane). */
const shootDrones: Behavior = (world, pilot) => (world.drone?.alive ? { fight: true, prey: world.drone, goto: world.waypoint } : standard(world, pilot));

/** The tug's winch on the hull's tail: shot at until the cable snaps (Repo Men). */
const shootWinch: Behavior = (world) => {
  const winch = world.waypoint;
  if (!winch || world.attempt?.reach === 0) return { fight: true, goto: winch };
  return { look: winch, fire: fireAt(world, winch, 400) };
};

/** The gel, left alone: the clone takes it (the launch ring's choice). */
const gel: Behavior = () => ({ idle: true });

/** Scout One scanned: the crosshair held on her from well within the scan's reach (The Drain). */
const scan: Behavior = (world, pilot) => {
  const scout = world.drone;
  if (!scout) return standard(world, pilot);
  const at = scout.flight.position;
  const spot = at.clone().add(aim.subVectors(world.me.flight.position, at).setLength(15000));
  return { goto: spot, look: at };
};

/** The hook fired once the nose is on what it is to bite, within its reach (its rock, the comet, Scout One). */
function hookOn(world: JobWorld, center: THREE.Vector3, radius: number): boolean {
  const distance = center.distanceTo(world.me.flight.position) - radius;
  return !world.hooked && distance < HOOK_RANGE * 0.8 && onTarget(world, center, radius);
}

/**
 * Swinging round a rock on the hook (Swing Shift, as the flight school's hook drill): the hook on
 * the rock it is put before, the drive along the swing until it is fast enough, and let go while
 * the swing carries it away from the rock.
 */
const swing: Behavior = (world, pilot) => {
  const rock = world.waypoint;
  const flight = world.me.flight;
  if (!rock) return { idle: true };
  if (!world.hooked) {
    if (pilot.memo.flung) return { goto: rock.clone().add(aim.subVectors(flight.position, rock).setLength(30000)) };
    const radius = rockAt(world, rock)?.radius ?? 1000;
    return { look: rock, hook: hookOn(world, rock, radius) };
  }
  const outward = aim.subVectors(flight.position, rock).normalize();
  const fast = flight.velocity.length() > HOOK_FLING * 1.15;
  if (fast && flight.velocity.dot(outward) > -0.2 * flight.velocity.length()) {
    pilot.memo.flung = true;
    return { hook: true, look: flight.position.clone().add(flight.velocity) };
  }
  // the drive along the swing
  return burnAlong(world);
};

/** The drive held along the flight (more swing on the hook). */
function burnAlong(world: JobWorld): Intent {
  return { through: true, goto: world.me.flight.position.clone().addScaledVector(world.me.flight.velocity, 3) };
}

/** On the hook of the comet (Ride the Comet): hooked from within reach, then held on to, swinging round it on the thrusters so the shed pieces miss. */
const ride: Behavior = (world) => {
  const comet = world.waypoint;
  if (!comet) return { idle: true };
  const flight = world.me.flight;
  const radius = rockAt(world, comet)?.radius ?? 2000;
  if (!world.hooked) {
    const reach = radius + HOOK_RANGE * 0.5;
    if (comet.distanceTo(flight.position) > reach) return { goto: comet.clone().add(aim.subVectors(flight.position, comet).setLength(reach * 0.9)), look: comet };
    return { look: comet, hook: hookOn(world, comet, radius) };
  }
  return { look: comet, strafe: new THREE.Vector3(1, 0, 0) };
};

/** Scout One towed off the comet's route (The Feeders' Comet, the tow): hooked, then pulled away square to the route. */
const TOW_ROUTE = new THREE.Vector3(-1, 0.15, -0.4).normalize();
const TOW_AWAY = new THREE.Vector3().crossVectors(TOW_ROUTE, new THREE.Vector3(0, 1, 0)).normalize();
const tow: Behavior = (world) => {
  const scout = world.drone;
  if (!scout) return { idle: true };
  const at = scout.flight.position;
  const flight = world.me.flight;
  if (world.hookedShip !== scout) {
    const reach = HOOK_RANGE * 0.5;
    if (at.distanceTo(flight.position) > reach) return { goto: at.clone().add(aim.subVectors(flight.position, at).setLength(reach * 0.8)), look: at };
    return { look: at, hook: hookOn(world, at, scout.radius) };
  }
  return { goto: at.clone().addScaledVector(TOW_AWAY, 12000), cruise: 800 };
};

/** Scout One on the hook at once, the orbit then flown in free drift (Orbit): she drifts ahead on the nose as it begins. */
const towInOrbit: Behavior = (world) => {
  const scout = world.drone;
  if (scout && world.hookedShip !== scout) return { idle: true, hook: onTarget(world, scout.flight.position, scout.radius * 2) };
  return circle(world);
};

/**
 * Into an orbit about the hole, as the flight school's orbit drill is flown (see courses.test.ts):
 * along the circle it is on at the speed of a circular orbit there, until the readout says the
 * orbit is ready; then free drift, hands off.
 */
function circle(world: JobWorld): Intent {
  const well = world.field.well;
  if (!well || world.orbit === 'ready' || world.orbit === 'stable') return { idle: true };
  const flight = world.me.flight;
  const out = aim.subVectors(flight.position, well.position);
  const radius = out.length();
  const along = flight.velocity.clone().addScaledVector(out, -flight.velocity.dot(out) / (radius * radius));
  if (along.lengthSq() < 1) along.crossVectors(out, new THREE.Vector3(0, 1, 0));
  const speed = Math.sqrt(wellMu(well) / radius);
  return { goto: flight.position.clone().addScaledVector(along.normalize(), speed * 2), through: true, cruise: speed, moving: new THREE.Vector3() };
}

/** Low and fast along a groove beyond Stickney's rim, for the camera drone (Groove Shoot). */
const GROOVE_OVER = 500;
const groove: Behavior = (world, pilot) => {
  const flight = world.me.flight;
  if (world.waypoint) return { goto: world.waypoint };
  // along the grooves, the way that stays among them
  const way = (pilot.memo.way as THREE.Vector3 | undefined) ?? GROOVE_WAY.clone();
  const ahead = flight.position.clone().addScaledVector(way, 3000);
  if (!inGrooves(ahead.x, ahead.z)) way.negate();
  pilot.memo.way = way;
  ahead.copy(flight.position).addScaledVector(way, 3000);
  ahead.y = phobosHeight(ahead.x, ahead.z) + GROOVE_OVER;
  return { goto: ahead, through: true, cruise: 900 };
};

/** Up into the bridge tower from its open bottom and through the hatch of every deck in turn (The Memorial). */
const climb: Behavior = (world, pilot) => {
  const attempt = world.attempt;
  const target = world.waypoint;
  if (!attempt?.live || !target) return standard(world, pilot);
  const flight = world.me.flight;
  const next = attempt.next;
  // the tower's middle from the hatches' world positions
  const base = target.clone().sub(next < HATCHES.length ? HATCHES[next] : new THREE.Vector3(0, (HATCHES.length + 0.5) * 1600, 0));
  const inside = Math.abs(flight.position.x - base.x) < TOWER_HALF && Math.abs(flight.position.z - base.z) < TOWER_HALF && flight.position.y > base.y - 400;
  if (!inside) {
    const below = base.clone().add(new THREE.Vector3(HATCHES[0].x, -3000, 0));
    if (flight.position.distanceTo(below) > 800 && flight.position.y > base.y - 2000) return { goto: below, cruise: 1500 };
    return { goto: below.setY(base.y + 800), cruise: 300 };
  }
  if (next >= HATCHES.length) return { goto: target, cruise: 300 };
  const hatch = target;
  const under = hatch.clone().setY(hatch.y - 800);
  if (flight.position.y < hatch.y - 500 && hypot(flight.position.x - hatch.x, flight.position.z - hatch.z) > 150) return { goto: under, cruise: 300 };
  return { goto: hatch.clone().setY(hatch.y + 900), cruise: 300 };
};

/** A smuggling run: to the drop, the drive cold while a patrol is near enough to see it burn (with room for the patrol's circle). */
const PATROL_SIGHT = 48000;
const smuggle: Behavior = (world) => {
  const near = world.formation.some((patrol) => patrol.flight.position.distanceTo(world.me.flight.position) < PATROL_SIGHT);
  return { goto: world.waypoint, quiet: near };
};

export const BEHAVIORS: Record<string, Record<number, Behavior>> = {
  firstCut: { 1: mine },
  dockingLane: { 1: shootDrones },
  rheasilvia: { 0: gel },
  cutAndHaul: { 1: mine },
  repoMen: { 2: shootWinch },
  grooveShoot: { 0: groove },
  swingShift: { 0: swing },
  rideComet: { 0: ride },
  theDrain: { 1: scan },
  feedersComet: { 1: tow },
  lastOrbit: { 0: towInOrbit },
  theMemorial: { 1: climb },
  ...Object.fromEntries(COURIER_PLACES.map(([place]) => [`smuggle:${place}`, { 0: smuggle }])),
  ...Object.fromEntries(MINING_PLACES.map((place) => [`mining:${place}`, { 0: mine }])),
};
