import * as THREE from 'three';
import type { Asteroid, AsteroidField } from '../world/asteroids';
import type { Controls } from '../input/input';
import type { Ship } from '../ship/ship';
import { SUN_DIRECTION } from '../world/space';
import { SCHOOL, SCHOOL_PRAISE } from '../music/lines';

/** What a flight school drill can see and do. */
export interface SchoolContext {
  me: Ship;
  controls: Controls;
  /** The pilot holds the brake (the flight computer flips and burns). */
  braking: boolean;
  /** The impact warning is on. */
  impactAhead: boolean;
  /** The autopilot takes out the drift across the nose; off, the ship drifts freely. */
  autopilot: boolean;
  /** The camera sits in the cockpit instead of behind the ship. */
  cockpit: boolean;
  /** What the Host flies with; touch has no fine aim. */
  device: Device;
  field: AsteroidField;
  now: number;
  dt: number;
  /** The target drone, once a drill has spawned it. */
  drone: Ship | null;
  /** Places the target drone at a point, drifting with a velocity, its drive towards the pilot. */
  spawnDrone(position: THREE.Vector3, velocity: THREE.Vector3): void;
  /** The sparring bot of the final exam. */
  bot: Ship | null;
  /** A bot at a point; an unarmed one only flees. Skill as in Bot (0..1). */
  spawnBot(position: THREE.Vector3, armed: boolean, skill: number): void;
  removeBot(): void;
  /** A laser shot from a point through a target point, for show: it costs no hull, a hit only sparks and shakes the link. */
  fireAt(from: THREE.Vector3, through: THREE.Vector3): void;
  /** The flight computer is still talking. */
  speaking: boolean;
  /** The flight computer says lines, one after the other, after whatever it is saying; false when it could not speak yet (voice still loading, audio not yet allowed). */
  say(lines: string[]): boolean;
}

/** The running state of one attempt at a drill. */
interface Attempt {
  /** Repetition of the drill, from 0. */
  rep: number;
  seconds: number;
  /** Seconds a condition has held without interruption (see holdFor). */
  held: number;
  /** The pilot's nose when the attempt began, for drills that forbid turning. */
  forward: THREE.Vector3;
  /** Points of the drill: markers, the ring course, the debris, a rock. */
  points: THREE.Vector3[];
  /** Facing of each ring of the course. */
  normals: THREE.Vector3[];
  /** Index of the next ring of the course. */
  next: number;
  /** Signed distance of the pilot to the plane of the next ring, the frame before. */
  side: number;
  /** The impact warning has come up in this attempt. */
  warned: boolean;
  /** The pilot used the S brake in this attempt; a brake still held from the drill before only counts once let go. */
  usedBrake: boolean;
  brakeLetGo: boolean;
  /** Distance the attempt started from its target (units). */
  reach: number;
  /** The side the pilot last pushed to with the thrusters (-1 left, 1 right, 0 not yet), and how often it changed. */
  jinkSide: number;
  jinks: number;
  /** When a drill's gunner fired last (attempt seconds). */
  lastShot: number;
}

interface Drill {
  /** Said and shown when the drill begins. */
  line: string;
  /** Said once the drill is mastered: praise and the physics behind it. */
  praise?: string;
  /** What the pilot uses in this drill; the panel shows the keys of the Host's device. */
  keys: Command[];
  reps?: number;
  /** Said instead of `line` from the second repetition on. */
  repLine?: string;
  enter?(ctx: SchoolContext, attempt: Attempt, markers: Markers): void;
  done(ctx: SchoolContext, attempt: Attempt, markers: Markers): boolean;
  /** A line when the attempt failed; the attempt then starts over. */
  fail?(ctx: SchoolContext, attempt: Attempt): string | null;
  leave?(ctx: SchoolContext): void;
  /** A point the HUD marks for the pilot. */
  waypoint?(ctx: SchoolContext, attempt: Attempt): THREE.Vector3 | null;
  /** What the waypoint is, written under it. */
  mark?(ctx: SchoolContext, attempt: Attempt): string;
  /** The autopilot setting the drill leaves behind, so a flight school resumed later starts with it. */
  autopilotAfter?: boolean;
  /** The drill does not apply to the Host's device: it is passed over without a word. */
  skip?(ctx: SchoolContext): boolean;
}

/** What the Host flies with. */
export type Device = 'keyboard' | 'gamepad' | 'touch';

/** What a drill asks the pilot to use. */
type Command = 'turn' | 'fine' | 'drive' | 'brake' | 'flip' | 'slide' | 'fire' | 'autopilot' | 'camera';

/** The keys, buttons and sticks of each device, as the keycaps show them. */
const CONTROLS: Record<Device, Record<Command, string[]>> = {
  keyboard: {
    turn: ['← ↑ ↓ →', 'Mouse'],
    fine: ['Shift'],
    drive: ['W'],
    brake: ['S'],
    flip: ['X'],
    slide: ['A', 'D'],
    fire: ['Space', 'Click'],
    autopilot: ['T'],
    camera: ['C'],
  },
  gamepad: {
    turn: ['Left stick'],
    fine: ['L3'],
    drive: ['RT'],
    brake: ['B'],
    flip: ['Y'],
    slide: ['Right stick'],
    fire: ['LT'],
    autopilot: ['R3'],
    camera: ['View'],
  },
  touch: {
    turn: ['Left stick'],
    fine: [],
    drive: ['DRIVE'],
    brake: ['BRAKE'],
    flip: ['FLIP'],
    slide: ['Right stick'],
    fire: ['FIRE'],
    autopilot: ['AUTO'],
    camera: [],
  },
};

/** 50 m/s and 5 m/s in world units (1 unit = 5 cm). */
const FAST = 1000;
const STOPPED = 100;
/** Ring radius of the course: 55 m, comfortable for a 35 m ship. */
const RING_RADIUS = 1100;
/** Radius of the zone the stop drill wants the ship to rest in: 200 m, shown as a sphere around the marker. */
const STOP_RADIUS = 4000;
/** At rest in the stop drill means slower than this: 10 m/s. */
const STOP_SPEED = 200;
/** Radius of the debris of the dodge drill: 15 m. */
const DEBRIS_RADIUS = 300;
/** Speed of the debris: 60 m/s. */
const DEBRIS_SPEED = 1200;
/** Turning more than this (rad, about 45°) breaks a drill that forbids turning; a mouse pointer slightly off-center does not get there. */
const NO_TURN = 0.8;
/** The jinking drill's gunner fires every GUNNER_INTERVAL seconds at where the ship was GUNNER_LAG seconds ago (a smoothing time constant). */
const GUNNER_INTERVAL = 0.7;
const GUNNER_LAG = 0.35;
/** Changes of side the jinking drill wants: left, right, left, right, left. */
const JINKS = 4;
/** A drill waits this long for the voice to say its lines (s), then goes on without. */
const UNSAID_PATIENCE = 10;


const scratch = new THREE.Vector3();
const toTarget = new THREE.Vector3();

/** A point given in the pilot's frame (-Z ahead, +X right, +Y up), in world space. */
function ahead(ctx: SchoolContext, x: number, y: number, z: number) {
  return ctx.me.flight.toWorld(new THREE.Vector3(x, y, z));
}

/** A world point in the pilot's frame. */
function local(ctx: SchoolContext, point: THREE.Vector3, target = scratch) {
  return ctx.me.flight.toLocal(point, target);
}

/** Angle between the pilot's nose and a point (rad). */
function aimError(ctx: SchoolContext, point: THREE.Vector3) {
  return ctx.me.flight.angleTo(toTarget.copy(point).sub(ctx.me.flight.position));
}

/** Moves a point out of any asteroid, so markers never sit inside rock. */
function clear(ctx: SchoolContext, point: THREE.Vector3, radius: number) {
  for (let i = 0; i < 12 && ctx.field.overlap(point, radius); i++) point.add(scratch.randomDirection().multiplyScalar(radius * 2));
  return point;
}

/** Counts seconds the condition has held without interruption. */
function holdFor(ctx: SchoolContext, attempt: Attempt, condition: boolean, seconds: number) {
  attempt.held = condition ? attempt.held + ctx.dt : 0;
  return attempt.held >= seconds;
}

function stop(ctx: SchoolContext) {
  ctx.me.flight.velocity.set(0, 0, 0);
  ctx.me.flight.angularVelocity.set(0, 0, 0);
}

/** Sets the pilot drifting along a direction, or along the nose. */
function drift(ctx: SchoolContext, speed: number, direction?: THREE.Vector3) {
  const flight = ctx.me.flight;
  flight.velocity.copy(direction ?? flight.forward()).normalize().multiplyScalar(speed);
  flight.angularVelocity.set(0, 0, 0);
}

const turned = (ctx: SchoolContext, attempt: Attempt) => ctx.me.flight.angleTo(attempt.forward) > NO_TURN;
const speed = (ctx: SchoolContext) => ctx.me.flight.velocity.length();

/** A point in the shadow of the asteroid nearest to the pilot. */
function nearestShadow(ctx: SchoolContext): THREE.Vector3 | null {
  const asteroid = nearestAsteroid(ctx);
  return asteroid && scratch.copy(asteroid.object.position).addScaledVector(SUN_DIRECTION, -(asteroid.radius + 1500));
}

function nearestAsteroid(ctx: SchoolContext): Asteroid | null {
  let best: Asteroid | null = null;
  let bestDistance = Infinity;
  for (const asteroid of ctx.field.asteroids.values()) {
    const distance = asteroid.object.position.distanceTo(ctx.me.flight.position);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = asteroid;
    }
  }
  return best;
}

const TURN_MARKERS: [number, number, number][] = [
  [0.55, 0.1, -1],
  [-0.5, 0.45, -1],
  [0.8, -0.35, 0.3],
];

const DRILLS: Drill[] = [
  {
    line: SCHOOL.briefing,
    keys: [],
    done: (ctx, a) => (a.seconds > 2 && !ctx.speaking) || a.seconds > 30,
  },
  {
    line: SCHOOL.turn,
    praise: SCHOOL_PRAISE.turn,
    keys: ['turn'],
    reps: TURN_MARKERS.length,
    enter(ctx, a, markers) {
      stop(ctx);
      const [x, y, z] = TURN_MARKERS[a.rep];
      a.points = [markers.buoy(ahead(ctx, x, y, z).sub(ctx.me.flight.position).setLength(3000).add(ctx.me.flight.position))];
    },
    done: (ctx, a) => holdFor(ctx, a, aimError(ctx, a.points[0]) < 0.05, 0.4),
    waypoint: (_, a) => a.points[0],
    mark: () => 'Target',
  },
  {
    line: SCHOOL.fineAim,
    praise: SCHOOL_PRAISE.fineAim,
    keys: ['fine'],
    enter(ctx, a, markers) {
      stop(ctx);
      a.points = [markers.buoy(ahead(ctx, 0.12, -0.07, -1).sub(ctx.me.flight.position).setLength(8000).add(ctx.me.flight.position), 0.5)];
    },
    // touch sticks have no fine aim: there the marker only has to sit in the crosshair
    done: (ctx, a) => holdFor(ctx, a, aimError(ctx, a.points[0]) < (ctx.device === 'touch' ? 0.04 : 0.015), 0.8),
    waypoint: (_, a) => a.points[0],
    mark: () => 'Target',
  },
  {
    line: SCHOOL.cockpit,
    praise: SCHOOL_PRAISE.cockpit,
    keys: ['camera'],
    // touch screens have no camera switch: there the drill is not given at all
    skip: (ctx) => ctx.device === 'touch',
    // in, then out again
    done(ctx, a) {
      if (ctx.cockpit) a.next = 1;
      return a.next === 1 && !ctx.cockpit;
    },
  },
  {
    line: SCHOOL.drive,
    praise: SCHOOL_PRAISE.drive,
    keys: ['drive'],
    enter: (ctx) => stop(ctx),
    done: (ctx) => speed(ctx) >= FAST,
  },
  {
    line: SCHOOL.freeDrift,
    praise: SCHOOL_PRAISE.freeDrift,
    keys: ['autopilot'],
    done: (ctx) => !ctx.autopilot,
    autopilotAfter: false,
  },
  {
    line: SCHOOL.drift,
    praise: SCHOOL_PRAISE.drift,
    keys: [],
    // a fresh clone (after a crash) starts at rest: it gets the drift it would have had
    enter(ctx) {
      if (speed(ctx) < FAST / 2) drift(ctx, FAST);
    },
    done: (ctx, a) => holdFor(ctx, a, ctx.controls.thrust === 0 && speed(ctx) > FAST / 2, 2.5),
  },
  {
    line: SCHOOL.lookBack,
    praise: SCHOOL_PRAISE.lookBack,
    keys: ['turn'],
    enter(ctx) {
      if (speed(ctx) < FAST * 0.8) drift(ctx, FAST);
    },
    done: (ctx, a) => holdFor(ctx, a, ctx.me.flight.angleTo(ctx.me.flight.velocity) > 2.4, 1),
    // without drift there is no course to look away from
    fail: (ctx) => (speed(ctx) < FAST * 0.3 ? SCHOOL.again : null),
  },
  {
    line: SCHOOL.brake,
    praise: SCHOOL_PRAISE.brake,
    keys: ['brake'],
    enter(ctx) {
      if (speed(ctx) < FAST * 0.8) drift(ctx, FAST * 1.2, speed(ctx) > 10 ? ctx.me.flight.velocity : undefined);
    },
    done: (ctx) => speed(ctx) < STOPPED,
  },
  {
    line: SCHOOL.flipBurn,
    praise: SCHOOL_PRAISE.flipBurn,
    repLine: SCHOOL.flipBurnAgain,
    keys: ['flip', 'drive'],
    reps: 2,
    enter: (ctx, a) => drift(ctx, a.rep === 0 ? 1500 : 2400),
    // counts once the burn has taken out the drift along the course; a burn by hand never
    // hits the flight direction exactly, so some sideways drift is allowed to remain
    done: (ctx, a) => ctx.me.flight.velocity.dot(a.forward) < STOPPED && !a.usedBrake,
    // stopping with the S brake does not count; the attempt starts over once the ship is at rest
    fail(ctx, a) {
      a.brakeLetGo ||= !ctx.braking;
      a.usedBrake ||= ctx.braking && a.brakeLetGo;
      return a.usedBrake && speed(ctx) < STOPPED ? SCHOOL.byHand : null;
    },
  },
  {
    line: SCHOOL.stopAt,
    praise: SCHOOL_PRAISE.stopAt,
    repLine: SCHOOL.stopAtFar,
    keys: ['drive', 'flip', 'brake'],
    reps: 2,
    enter(ctx, a, markers) {
      stop(ctx);
      a.points = [markers.buoy(clear(ctx, a.rep === 0 ? ahead(ctx, 0, 0, -10000) : ahead(ctx, 3000, 1500, -18000), STOP_RADIUS))];
      markers.zone(a.points[0], STOP_RADIUS);
    },
    done: (ctx, a) => holdFor(ctx, a, ctx.me.flight.position.distanceTo(a.points[0]) < STOP_RADIUS && speed(ctx) < STOP_SPEED, 0.3),
    fail: (ctx, a) => (ctx.me.flight.position.distanceTo(a.points[0]) > 30000 ? SCHOOL.again : null),
    waypoint: (_, a) => a.points[0],
    mark: () => 'Stop here',
  },
  {
    line: SCHOOL.slide,
    praise: SCHOOL_PRAISE.slide,
    keys: ['slide'],
    // a gunner on the pilot's tail fires where the ship was a moment ago: jinking left and
    // right with the thrusters is what makes the shots go past; turning and drift do not matter
    enter(ctx, a) {
      stop(ctx);
      a.points = [ctx.me.flight.position.clone()];
    },
    done(ctx, a) {
      const push = ctx.controls.strafeX;
      const side = push > 0.5 ? 1 : push < -0.5 ? -1 : 0;
      if (side && side !== a.jinkSide) {
        if (a.jinkSide) a.jinks++;
        a.jinkSide = side;
      }
      a.points[0].lerp(ctx.me.flight.position, 1 - Math.exp(-ctx.dt / GUNNER_LAG));
      if (a.seconds - a.lastShot > GUNNER_INTERVAL) {
        a.lastShot = a.seconds;
        ctx.fireAt(ahead(ctx, (Math.random() - 0.5) * 3000, 800, 12000), a.points[0]);
      }
      return a.jinks >= JINKS;
    },
  },
  {
    line: SCHOOL.dodge,
    praise: SCHOOL_PRAISE.dodge,
    keys: ['slide'],
    reps: 2,
    enter(ctx, a, markers) {
      stop(ctx);
      const start = ahead(ctx, 0, 0, -9000);
      const velocity = ctx.me.flight.position.clone().sub(start).setLength(DEBRIS_SPEED);
      a.points = [markers.debris(start, velocity, DEBRIS_RADIUS)];
    },
    done: (ctx, a) => local(ctx, a.points[0]).z > 1500,
    fail(ctx, a) {
      if (ctx.me.flight.position.distanceTo(a.points[0]) < DEBRIS_RADIUS + ctx.me.radius) return SCHOOL.dodgeHit;
      return turned(ctx, a) ? SCHOOL.noTurn : null;
    },
  },
  {
    line: SCHOOL.autopilotOn,
    praise: SCHOOL_PRAISE.autopilotOn,
    keys: ['autopilot'],
    done: (ctx) => ctx.autopilot,
    autopilotAfter: true,
  },
  {
    line: SCHOOL.rings,
    praise: SCHOOL_PRAISE.rings,
    keys: ['drive', 'brake', 'flip'],
    enter(ctx, a, markers) {
      stop(ctx);
      const course: [number, number, number][] = [
        [0, 0, -7000],
        [2500, 800, -14000],
        [500, 3000, -21000],
        [-2000, 1000, -28000],
      ];
      a.points = course.map(([x, y, z]) => clear(ctx, ahead(ctx, x, y, z), RING_RADIUS * 1.5));
      // each ring faces the way from the one before
      a.normals = a.points.map((point, i) => point.clone().sub(i === 0 ? ctx.me.flight.position : a.points[i - 1]).normalize());
      a.points.forEach((point, i) => markers.ring(point, a.normals[i]));
      markers.highlight(0);
    },
    done(ctx, a, markers) {
      const normal = a.normals[a.next];
      const offset = toTarget.copy(ctx.me.flight.position).sub(a.points[a.next]);
      const side = offset.dot(normal);
      // passed: the pilot crossed the ring's plane, inside the ring
      if (a.side < 0 && side >= 0 && offset.addScaledVector(normal, -side).length() < RING_RADIUS) {
        a.next++;
        markers.highlight(a.next);
        a.side = -Infinity;
        return a.next >= a.points.length;
      }
      a.side = side;
      return false;
    },
    fail: (ctx, a) => (ctx.me.flight.position.distanceTo(a.points[a.points.length - 1]) > 50000 ? SCHOOL.again : null),
    waypoint: (_, a) => a.points[a.next] ?? null,
    mark: (_, a) => `Ring ${a.next + 1}/${a.points.length}`,
  },
  {
    line: SCHOOL.shoot,
    praise: SCHOOL_PRAISE.shoot,
    keys: ['fire'],
    enter(ctx) {
      stop(ctx);
      ctx.spawnDrone(ahead(ctx, 0, 0, -6000), new THREE.Vector3());
    },
    done: (ctx) => !!ctx.drone && !ctx.drone.alive,
    waypoint: (ctx) => (ctx.drone?.alive ? ctx.drone.flight.position : null),
    mark: () => 'Drone',
  },
  {
    line: SCHOOL.shootMoving,
    praise: SCHOOL_PRAISE.shootMoving,
    keys: ['fire', 'fine'],
    enter(ctx) {
      stop(ctx);
      const right = new THREE.Vector3(1, 0, 0).applyQuaternion(ctx.me.flight.orientation);
      ctx.spawnDrone(ahead(ctx, -2500, 0, -7000), right.multiplyScalar(450));
    },
    done: (ctx) => !!ctx.drone && !ctx.drone.alive,
    fail: (ctx) => (ctx.drone && ctx.drone.flight.position.distanceTo(ctx.me.flight.position) > 20000 ? SCHOOL.again : null),
    waypoint: (ctx) => (ctx.drone?.alive ? ctx.drone.flight.position : null),
    mark: () => 'Drone',
  },
  {
    line: SCHOOL.overheat,
    praise: SCHOOL_PRAISE.overheat,
    keys: ['fire'],
    // a laser still hot from the last drill would pass this one before the first shot
    enter(ctx) {
      stop(ctx);
      ctx.me.heat = 0;
      ctx.me.overheated = false;
    },
    done: (ctx) => ctx.me.overheated,
  },
  {
    line: SCHOOL.shadow,
    praise: SCHOOL_PRAISE.shadow,
    keys: ['drive', 'brake'],
    done: (ctx, a) => holdFor(ctx, a, ctx.me.inShadow, 1),
    waypoint: (ctx) => nearestShadow(ctx),
    mark: () => 'Shadow',
  },
  {
    line: SCHOOL.impact,
    praise: SCHOOL_PRAISE.impact,
    keys: ['brake', 'slide'],
    enter(ctx, a) {
      // between a rock and the field's center, heading for the rock at 100 m/s: the nearest
      // rock whose start lies in open space and whose way there no other rock blocks
      const flight = ctx.me.flight;
      const rocks = [...ctx.field.asteroids.values()].sort((p, q) => p.object.position.distanceTo(flight.position) - q.object.position.distanceTo(flight.position));
      let rock: Asteroid | null = null;
      const start = new THREE.Vector3();
      const outward = new THREE.Vector3();
      for (const candidate of rocks) {
        outward.copy(candidate.object.position).normalize();
        start.copy(candidate.object.position).addScaledVector(outward, -(candidate.radius + 14000));
        if (ctx.field.overlap(start, ctx.me.radius * 4)) continue;
        if (ctx.field.raycast(start, outward, Infinity)?.asteroid !== candidate) continue;
        rock = candidate;
        break;
      }
      if (!rock) return;
      flight.position.copy(start);
      flight.orientation.setFromRotationMatrix(new THREE.Matrix4().lookAt(start, rock.object.position, new THREE.Vector3(0, 1, 0)));
      drift(ctx, 2000, outward);
      a.points = [rock.object.position];
      a.reach = start.distanceTo(rock.object.position);
    },
    done(ctx, a) {
      a.warned ||= ctx.impactAhead;
      if (!a.points.length) return true;
      const away = toTarget.copy(a.points[0]).sub(ctx.me.flight.position).dot(ctx.me.flight.velocity) < 0;
      // braking before the warning even comes up is good flying too; sliding past only
      // counts once the warning has been seen
      return holdFor(ctx, a, !ctx.impactAhead && (speed(ctx) < STOPPED || (away && a.warned)), 1);
    },
    // slid past without ever being warned: the lesson did not happen, once more
    fail: (ctx, a) => (a.points.length && !a.warned && ctx.me.flight.position.distanceTo(a.points[0]) > a.reach + 3000 ? SCHOOL.again : null),
  },
  ...(
    [
      [SCHOOL.chase, SCHOOL_PRAISE.chase, ['drive', 'brake', 'fire'], { armed: false, skill: 0.1 }],
      [SCHOOL.evade, SCHOOL_PRAISE.evade, ['slide', 'fire'], { armed: true, skill: 0.05 }],
      [SCHOOL.duel, SCHOOL_PRAISE.duel, ['drive', 'brake', 'slide', 'fire'], { armed: true, skill: 0.2 }],
    ] as const
  ).map(
    ([line, praise, keys, bot]): Drill => ({
      line,
      praise,
      keys: [...keys],
      enter(ctx) {
        stop(ctx);
        ctx.spawnBot(clear(ctx, ahead(ctx, 0, 0, -8000), 2000), bot.armed, bot.skill);
      },
      done: (ctx) => !!ctx.bot && !ctx.bot.alive,
      leave: (ctx) => ctx.removeBot(),
      waypoint: (ctx) => (ctx.bot?.alive ? ctx.bot.flight.position : null),
      mark: () => 'Bot',
    }),
  ),
  {
    line: SCHOOL.done,
    keys: [],
    done: (ctx, a) => a.seconds > 3 && !ctx.speaking,
  },
];

/** The 3D props of the drills: marker buoys, rings of the course, debris. */
class Markers {
  readonly root = new THREE.Group();
  private readonly buoyGeometry = new THREE.OctahedronGeometry(1, 0);
  private readonly ringGeometry = new THREE.TorusGeometry(RING_RADIUS, 40, 8, 48);
  private readonly debrisGeometry = new THREE.IcosahedronGeometry(1, 0);
  private readonly zoneGeometry = new THREE.IcosahedronGeometry(1, 2);
  private readonly bright = new THREE.MeshBasicMaterial({ color: 0xff9d00, wireframe: true });
  private readonly dim = new THREE.MeshBasicMaterial({ color: 0x4d91ff, wireframe: true, transparent: true, opacity: 0.45 });
  private readonly rock = new THREE.MeshBasicMaterial({ color: 0xff4d2e, wireframe: true });
  private rings: THREE.Mesh[] = [];
  private moving: { mesh: THREE.Object3D; position: THREE.Vector3; velocity: THREE.Vector3 }[] = [];

  /** A spinning diamond (150 units, about 7.5 m, by default). */
  buoy(position: THREE.Vector3, scale = 1) {
    const mesh = new THREE.Mesh(this.buoyGeometry, this.bright);
    mesh.scale.setScalar(150 * scale);
    mesh.position.copy(position);
    mesh.userData.spin = true;
    this.root.add(mesh);
    return mesh.position;
  }

  /** A faint wire sphere around a point: the zone a drill wants the ship in. */
  zone(position: THREE.Vector3, radius: number) {
    const mesh = new THREE.Mesh(this.zoneGeometry, this.dim);
    mesh.scale.setScalar(radius);
    mesh.position.copy(position);
    this.root.add(mesh);
  }

  ring(position: THREE.Vector3, normal: THREE.Vector3) {
    const mesh = new THREE.Mesh(this.ringGeometry, this.dim);
    mesh.position.copy(position);
    mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), normal);
    this.root.add(mesh);
    this.rings.push(mesh);
  }

  /** The next ring glows orange, passed rings disappear. */
  highlight(next: number) {
    this.rings.forEach((ring, i) => {
      ring.visible = i >= next;
      ring.material = i === next ? this.bright : this.dim;
    });
  }

  /** A tumbling chunk that drifts; returns its live position. */
  debris(position: THREE.Vector3, velocity: THREE.Vector3, radius: number) {
    const mesh = new THREE.Mesh(this.debrisGeometry, this.rock);
    mesh.scale.setScalar(radius);
    mesh.position.copy(position);
    mesh.userData.spin = true;
    this.root.add(mesh);
    this.moving.push({ mesh, position: mesh.position, velocity });
    return mesh.position;
  }

  update(dt: number) {
    for (const { position, velocity } of this.moving) position.addScaledVector(velocity, dt);
    for (const child of this.root.children) {
      if (child.userData.spin) child.rotation.y += dt * 1.5;
    }
  }

  clear() {
    this.root.clear();
    this.rings = [];
    this.moving = [];
  }

  /** Frees the geometries and materials on the GPU when the flight school ends. */
  dispose() {
    this.clear();
    for (const resource of [this.buoyGeometry, this.ringGeometry, this.debrisGeometry, this.zoneGeometry, this.bright, this.dim, this.rock]) resource.dispose();
  }
}

/**
 * The guided training: one drill after another, each one maneuver, some repeated. A failed
 * attempt or a dead training clone starts the attempt over; training clones are free.
 */
export class FlightSchool {
  private readonly markers = new Markers();
  private index: number;
  private attempt: Attempt | null = null;
  /** The attempt has to start over (failed, or the clone died). */
  private restart = false;
  /** Lines to say before the next attempt: the praise of the last drill, or why the attempt failed. */
  private pending: string[] = [];
  /** Lines of the beginning attempt the voice could not say yet, and since when (see speak). */
  private unsaid: { lines: string[]; since: number } | null = null;
  private line: string;
  /** What the current waypoint is, for its label in the HUD. */
  mark = '';

  /** Starts at a drill: 0 for the briefing, or where a Host left off. */
  constructor(start = 0) {
    this.index = THREE.MathUtils.clamp(Math.floor(start), 0, DRILLS.length - 1);
    this.line = DRILLS[this.index].line;
    // the very first words of the school: Nicole introduces herself before the briefing
    if (this.index === 0) this.pending = [SCHOOL.hello];
  }

  /** Number of drills, for the menu's "continue at drill n of m". */
  static get drills() {
    return DRILLS.length;
  }

  /** Whether the autopilot is on at the starting drill: as the drills before it left it. */
  get startsWithAutopilot() {
    let on = true;
    for (let i = 0; i < this.index; i++) on = DRILLS[i].autopilotAfter ?? on;
    return on;
  }

  /** Group of the drills' props; the game adds it to the scene. */
  get root(): THREE.Object3D {
    return this.markers.root;
  }

  get finished() {
    return this.index >= DRILLS.length;
  }

  dispose() {
    this.markers.dispose();
  }

  /** Advances the training; returns the waypoint to mark, if any. */
  update(ctx: SchoolContext): THREE.Vector3 | null {
    if (!this.attempt) while (!this.finished && DRILLS[this.index].skip?.(ctx)) this.index++;
    if (this.finished) return null;
    const drill = DRILLS[this.index];
    if (!ctx.me.alive) {
      this.restart = true;
      return null;
    }
    if (!this.attempt || this.restart) this.begin(ctx, this.attempt?.rep ?? 0);
    if (!this.speak(ctx)) return null;
    const attempt = this.attempt!;
    attempt.seconds += ctx.dt;
    this.markers.update(ctx.dt);

    const failure = drill.fail?.(ctx, attempt) ?? null;
    if (failure) {
      this.pending = [failure];
      this.restart = true;
      return null;
    }
    if (drill.done(ctx, attempt, this.markers)) {
      if (attempt.rep + 1 < (drill.reps ?? 1)) {
        this.begin(ctx, attempt.rep + 1);
      } else {
        drill.leave?.(ctx);
        this.pending = drill.praise ? [drill.praise] : [];
        this.markers.clear();
        this.index++;
        this.attempt = null;
      }
      return null;
    }
    this.mark = drill.mark?.(ctx, attempt) ?? '';
    return drill.waypoint?.(ctx, attempt) ?? null;
  }

  private begin(ctx: SchoolContext, rep: number) {
    const drill = DRILLS[this.index];
    const fresh = !this.attempt || this.attempt.rep !== rep;
    this.markers.clear();
    this.attempt = { rep, seconds: 0, held: 0, forward: ctx.me.flight.forward(), points: [], normals: [], next: 0, side: -Infinity, warned: false, usedBrake: false, brakeLetGo: false, reach: 0, jinkSide: 0, jinks: 0, lastShot: 0 };
    drill.enter?.(ctx, this.attempt, this.markers);
    this.restart = false;
    // the panel keeps the instruction; a repetition without a line of its own just goes on
    const instruction = rep > 0 && drill.repLine ? drill.repLine : drill.line;
    const spoken = [...this.pending, ...(fresh && (rep === 0 || drill.repLine) ? [instruction] : [])];
    this.line = instruction;
    this.pending = [];
    if (spoken.length) this.unsaid = { lines: spoken, since: ctx.now };
  }

  /**
   * Says the lines of the beginning attempt. Until the voice can speak (still loading, or the
   * browser has not allowed audio yet) the drill waits, so no instruction is lost; after
   * UNSAID_PATIENCE seconds it goes on without.
   */
  private speak(ctx: SchoolContext): boolean {
    const unsaid = this.unsaid;
    if (!unsaid) return true;
    if (ctx.say(unsaid.lines) || ctx.now - unsaid.since > UNSAID_PATIENCE) this.unsaid = null;
    return !this.unsaid;
  }

  /**
   * "Flight school 3/24", the current line, the keys of the Host's device. The same object
   * every frame; it only changes with the drill, the line or the device.
   */
  status(device: Device): { step: string; text: string; keys: string[] } {
    const index = Math.min(this.index, DRILLS.length - 1);
    const shown = this.shown;
    if (shown.index !== index || shown.status.text !== this.line || shown.device !== device) {
      shown.index = index;
      shown.device = device;
      shown.status = {
        step: `Flight school ${index + 1}/${DRILLS.length}`,
        text: this.line,
        keys: DRILLS[index].keys.flatMap((command) => CONTROLS[device][command]),
      };
    }
    return shown.status;
  }

  private readonly shown = { index: -1, device: 'keyboard' as Device, status: { step: '', text: '', keys: [] as string[] } };

  get stepIndex() {
    return this.index;
  }
}
