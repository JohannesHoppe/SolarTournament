import * as THREE from 'three';
import type { AsteroidField } from '../world/asteroids';
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
  field: AsteroidField;
  now: number;
  dt: number;
  /** The target drone, once a drill has spawned it. */
  drone: Ship | null;
  /** Places the target drone at a point, drifting with a velocity, facing the pilot. */
  spawnDrone(position: THREE.Vector3, velocity: THREE.Vector3): void;
  /** The sparring bot of the final exam. */
  bot: Ship | null;
  /** A bot at a point; an unarmed one only flees. Skill as in Bot (0..1). */
  spawnBot(position: THREE.Vector3, armed: boolean, skill: number): void;
  removeBot(): void;
  /** The flight computer is still talking. */
  speaking: boolean;
  /** The flight computer says lines, one after the other; it cuts off whatever it was saying. */
  say(lines: string[]): void;
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
}

interface Drill {
  /** Said and shown when the drill begins. */
  line: string;
  /** Said once the drill is mastered: praise and the physics behind it. */
  praise?: string;
  /** Keys the panel shows. */
  keys: string[];
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
}

/** 50 m/s and 5 m/s in world units (1 unit = 5 cm). */
const FAST = 1000;
const STOPPED = 100;
/** Ring radius of the course: 55 m, comfortable for a 35 m ship. */
const RING_RADIUS = 1100;
/** Radius of the debris of the dodge drill: 15 m. */
const DEBRIS_RADIUS = 300;
/** Speed of the debris: 60 m/s. */
const DEBRIS_SPEED = 1200;
/** Turning more than this (rad) breaks a drill that forbids turning. */
const NO_TURN = 0.35;

const scratch = new THREE.Vector3();
const toTarget = new THREE.Vector3();
const inverse = new THREE.Quaternion();

/** A point given in the pilot's frame (-Z ahead, +X right, +Y up), in world space. */
function ahead(ctx: SchoolContext, x: number, y: number, z: number) {
  return new THREE.Vector3(x, y, z).applyQuaternion(ctx.me.flight.orientation).add(ctx.me.flight.position);
}

/** A world point in the pilot's frame. */
function local(ctx: SchoolContext, point: THREE.Vector3, target = scratch) {
  inverse.copy(ctx.me.flight.orientation).invert();
  return target.copy(point).sub(ctx.me.flight.position).applyQuaternion(inverse);
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
  return asteroid && scratch.copy(asteroid.position).addScaledVector(SUN_DIRECTION, -(asteroid.radius + 1500));
}

function nearestAsteroid(ctx: SchoolContext): { position: THREE.Vector3; radius: number } | null {
  let best: { position: THREE.Vector3; radius: number } | null = null;
  let bestDistance = Infinity;
  for (const asteroid of ctx.field.asteroids.values()) {
    const distance = asteroid.object.position.distanceTo(ctx.me.flight.position);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = { position: asteroid.object.position, radius: asteroid.radius };
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
    keys: ['← ↑ ↓ →', 'Mouse'],
    reps: TURN_MARKERS.length,
    enter(ctx, a, markers) {
      stop(ctx);
      const [x, y, z] = TURN_MARKERS[a.rep];
      a.points = [markers.buoy(ahead(ctx, x, y, z).sub(ctx.me.flight.position).setLength(3000).add(ctx.me.flight.position))];
    },
    done: (ctx, a) => holdFor(ctx, a, aimError(ctx, a.points[0]) < 0.05, 0.4),
    waypoint: (_, a) => a.points[0],
  },
  {
    line: SCHOOL.fineAim,
    praise: SCHOOL_PRAISE.fineAim,
    keys: ['Shift'],
    enter(ctx, a, markers) {
      stop(ctx);
      a.points = [markers.buoy(ahead(ctx, 0.12, -0.07, -1).sub(ctx.me.flight.position).setLength(8000).add(ctx.me.flight.position), 0.5)];
    },
    done: (ctx, a) => holdFor(ctx, a, aimError(ctx, a.points[0]) < 0.015, 0.8),
    waypoint: (_, a) => a.points[0],
  },
  {
    line: SCHOOL.drive,
    praise: SCHOOL_PRAISE.drive,
    keys: ['W'],
    enter: (ctx) => stop(ctx),
    done: (ctx) => speed(ctx) >= FAST,
  },
  {
    line: SCHOOL.drift,
    praise: SCHOOL_PRAISE.drift,
    keys: [],
    done: (ctx, a) => holdFor(ctx, a, ctx.controls.thrust === 0 && speed(ctx) > FAST / 2, 2.5),
  },
  {
    line: SCHOOL.lookBack,
    praise: SCHOOL_PRAISE.lookBack,
    keys: ['← ↑ ↓ →', 'Mouse'],
    enter(ctx) {
      if (speed(ctx) < FAST * 0.8) drift(ctx, FAST);
    },
    done: (ctx, a) => holdFor(ctx, a, ctx.me.flight.angleTo(ctx.me.flight.velocity) > 2.4, 1),
  },
  {
    line: SCHOOL.brake,
    praise: SCHOOL_PRAISE.brake,
    keys: ['S'],
    enter(ctx) {
      if (speed(ctx) < FAST * 0.8) drift(ctx, FAST * 1.2, speed(ctx) > 10 ? ctx.me.flight.velocity : undefined);
    },
    done: (ctx) => speed(ctx) < STOPPED,
  },
  {
    line: SCHOOL.flipBurn,
    praise: SCHOOL_PRAISE.flipBurn,
    repLine: SCHOOL.flipBurnAgain,
    keys: ['X', 'W'],
    reps: 2,
    enter: (ctx, a) => drift(ctx, a.rep === 0 ? 1500 : 2400),
    done: (ctx) => speed(ctx) < STOPPED,
    fail: (ctx) => (ctx.braking ? SCHOOL.byHand : null),
  },
  {
    line: SCHOOL.stopAt,
    praise: SCHOOL_PRAISE.stopAt,
    repLine: SCHOOL.stopAtFar,
    keys: ['W', 'X', 'S'],
    reps: 2,
    enter(ctx, a, markers) {
      stop(ctx);
      a.points = [markers.buoy(clear(ctx, a.rep === 0 ? ahead(ctx, 0, 0, -8000) : ahead(ctx, 3000, 1500, -15000), 1500))];
    },
    done: (ctx, a) => holdFor(ctx, a, ctx.me.flight.position.distanceTo(a.points[0]) < 1000 && speed(ctx) < STOPPED, 0.3),
    fail: (ctx, a) => (ctx.me.flight.position.distanceTo(a.points[0]) > 30000 ? SCHOOL.again : null),
    waypoint: (_, a) => a.points[0],
  },
  {
    line: SCHOOL.slide,
    praise: SCHOOL_PRAISE.slide,
    repLine: SCHOOL.slideBack,
    keys: ['A', 'D'],
    reps: 2,
    enter(ctx, a, markers) {
      stop(ctx);
      a.points = [markers.buoy(ahead(ctx, a.rep === 0 ? 1500 : -1500, 0, -4000))];
    },
    done(ctx, a) {
      const offset = local(ctx, a.points[0]).x;
      const drifting = local(ctx, toTarget.copy(ctx.me.flight.velocity).add(ctx.me.flight.position)).x;
      return holdFor(ctx, a, Math.abs(offset) < 150 && Math.abs(drifting) < 60, 0.5);
    },
    fail: (ctx, a) => (turned(ctx, a) ? SCHOOL.noTurn : null),
    waypoint: (_, a) => a.points[0],
  },
  {
    line: SCHOOL.dodge,
    praise: SCHOOL_PRAISE.dodge,
    keys: ['A', 'D'],
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
    line: SCHOOL.rings,
    praise: SCHOOL_PRAISE.rings,
    keys: ['W', 'S', 'X'],
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
  },
  {
    line: SCHOOL.shoot,
    praise: SCHOOL_PRAISE.shoot,
    keys: ['Space', 'Click'],
    enter(ctx) {
      stop(ctx);
      ctx.spawnDrone(ahead(ctx, 0, 0, -6000), new THREE.Vector3());
    },
    done: (ctx) => !!ctx.drone && !ctx.drone.alive,
    waypoint: (ctx) => (ctx.drone?.alive ? ctx.drone.flight.position : null),
  },
  {
    line: SCHOOL.shootMoving,
    praise: SCHOOL_PRAISE.shootMoving,
    keys: ['Space', 'Shift'],
    enter(ctx) {
      stop(ctx);
      const right = new THREE.Vector3(1, 0, 0).applyQuaternion(ctx.me.flight.orientation);
      ctx.spawnDrone(ahead(ctx, -2500, 0, -7000), right.multiplyScalar(450));
    },
    done: (ctx) => !!ctx.drone && !ctx.drone.alive,
    fail: (ctx) => (ctx.drone && ctx.drone.flight.position.distanceTo(ctx.me.flight.position) > 20000 ? SCHOOL.again : null),
    waypoint: (ctx) => (ctx.drone?.alive ? ctx.drone.flight.position : null),
  },
  {
    line: SCHOOL.overheat,
    praise: SCHOOL_PRAISE.overheat,
    keys: ['Space'],
    enter: (ctx) => stop(ctx),
    done: (ctx) => ctx.me.overheated,
  },
  {
    line: SCHOOL.shadow,
    praise: SCHOOL_PRAISE.shadow,
    keys: ['W', 'S'],
    done: (ctx, a) => holdFor(ctx, a, ctx.me.inShadow, 1),
    waypoint: (ctx) => nearestShadow(ctx),
  },
  {
    line: SCHOOL.impact,
    praise: SCHOOL_PRAISE.impact,
    keys: ['S', 'A', 'D'],
    enter(ctx, a) {
      const rock = nearestAsteroid(ctx);
      if (!rock) return;
      // between the rock and the field's center, heading for the rock at 100 m/s
      const outward = rock.position.clone().normalize();
      const start = rock.position.clone().addScaledVector(outward, -(rock.radius + 14000));
      const flight = ctx.me.flight;
      flight.position.copy(start);
      flight.orientation.setFromRotationMatrix(new THREE.Matrix4().lookAt(start, rock.position, new THREE.Vector3(0, 1, 0)));
      drift(ctx, 2000, outward);
      a.points = [rock.position];
    },
    done(ctx, a) {
      a.warned ||= ctx.impactAhead;
      if (!a.points.length) return true;
      const away = toTarget.copy(a.points[0]).sub(ctx.me.flight.position).dot(ctx.me.flight.velocity) < 0;
      return holdFor(ctx, a, a.warned && !ctx.impactAhead && (speed(ctx) < STOPPED || away), 1);
    },
  },
  ...(
    [
      [SCHOOL.chase, SCHOOL_PRAISE.chase, ['W', 'S', 'Space'], { armed: false, skill: 0.1 }],
      [SCHOOL.evade, SCHOOL_PRAISE.evade, ['A', 'D', 'Space'], { armed: true, skill: 0.05 }],
      [SCHOOL.duel, SCHOOL_PRAISE.duel, ['W', 'S', 'A', 'D', 'Space'], { armed: true, skill: 0.2 }],
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
}

/**
 * The guided training: one drill after another, each one maneuver, some repeated. A failed
 * attempt or a dead training clone starts the attempt over; training clones are free.
 */
export class FlightSchool {
  private readonly markers = new Markers();
  private index = 0;
  private attempt: Attempt | null = null;
  /** The attempt has to start over (failed, or the clone died). */
  private restart = false;
  /** Lines to say before the next attempt: the praise of the last drill, or why the attempt failed. */
  private pending: string[] = [];
  private line: string = DRILLS[0].line;

  /** Group of the drills' props; the game adds it to the scene. */
  get root(): THREE.Object3D {
    return this.markers.root;
  }

  get finished() {
    return this.index >= DRILLS.length;
  }

  /** Advances the training; returns the waypoint to mark, if any. */
  update(ctx: SchoolContext): THREE.Vector3 | null {
    if (this.finished) return null;
    const drill = DRILLS[this.index];
    if (!ctx.me.alive) {
      this.restart = true;
      return null;
    }
    if (!this.attempt || this.restart) this.begin(ctx, this.attempt?.rep ?? 0);
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
    return drill.waypoint?.(ctx, attempt) ?? null;
  }

  private begin(ctx: SchoolContext, rep: number) {
    const drill = DRILLS[this.index];
    const fresh = !this.attempt || this.attempt.rep !== rep;
    this.markers.clear();
    this.attempt = { rep, seconds: 0, held: 0, forward: ctx.me.flight.forward(), points: [], normals: [], next: 0, side: -Infinity, warned: false };
    drill.enter?.(ctx, this.attempt, this.markers);
    this.restart = false;
    // the panel keeps the instruction; a repetition without a line of its own just goes on
    const instruction = rep > 0 && drill.repLine ? drill.repLine : drill.line;
    const spoken = [...this.pending, ...(fresh && (rep === 0 || drill.repLine) ? [instruction] : [])];
    this.line = instruction;
    this.pending = [];
    if (spoken.length) ctx.say(spoken);
  }

  /** "Flight school 3/19", the current line, the keys to use. */
  get status(): { step: string; text: string; keys: string[] } {
    const index = Math.min(this.index, DRILLS.length - 1);
    const drill = DRILLS[index];
    return { step: `Flight school ${index + 1}/${DRILLS.length}`, text: this.line, keys: drill.keys };
  }

  get stepIndex() {
    return this.index;
  }
}
