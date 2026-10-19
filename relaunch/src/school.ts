import * as THREE from 'three';
import type { AsteroidField } from './asteroids';
import type { Controls } from './input';
import type { Ship } from './ship';
import { SUN_DIRECTION } from './space';

/** What a flight school step can see and do. */
export interface SchoolContext {
  me: Ship;
  controls: Controls;
  field: AsteroidField;
  now: number;
  dt: number;
  /** The target drone, once a step has called spawnDrone(). */
  drone: Ship | null;
  /** Places the target drone in front of the pilot. */
  spawnDrone(): void;
  /** The flight computer is still reading something out. */
  speaking: boolean;
}

interface Step {
  text: string;
  enter?(ctx: SchoolContext): void;
  /** True once the pilot has done what the step asks; `seconds` counts time in the step. */
  done(ctx: SchoolContext, seconds: number, progress: { held: number }): boolean;
  /** A point the HUD marks for the pilot. */
  waypoint?(ctx: SchoolContext): THREE.Vector3 | null;
}

/** 50 m/s and 5 m/s in world units (1 unit = 5 cm). */
const FAST = 1000;
const STOPPED = 100;

const retrograde = new THREE.Vector3();
const shadowPoint = new THREE.Vector3();

/** A point in the shadow of the asteroid nearest to the pilot. */
function nearestShadow(ctx: SchoolContext): THREE.Vector3 | null {
  let best: { position: THREE.Vector3; radius: number } | null = null;
  let bestDistance = Infinity;
  for (const asteroid of ctx.field.asteroids.values()) {
    const distance = asteroid.object.position.distanceTo(ctx.me.flight.position);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = { position: asteroid.object.position, radius: asteroid.radius };
    }
  }
  if (!best) return null;
  return shadowPoint.copy(best.position).addScaledVector(SUN_DIRECTION, -(best.radius + 1500));
}

/** Counts seconds the condition has held without interruption. */
function holdFor(progress: { held: number }, condition: boolean, dt: number, seconds: number) {
  progress.held = condition ? progress.held + dt : 0;
  return progress.held >= seconds;
}

const STEPS: Step[] = [
  {
    // the briefing: the story of the games, read out by the flight computer (see SCHOOL_SPEECH)
    text: 'The year is 2584. The United Solar States rule the planets, and the Orange President rules the United Solar States. To keep his people quiet and entertained, his Ministry of War stages the Presidential Games. You are one of the chosen hosts, and it is an honor to die for the President. You fly a printed clone over a live link, and when the clone dies, the next one is already waiting in the printer. You will die again and again through your clones: that is your destiny now. Training clones like this one are free, but in the tournament every new clone costs you an advertisement. Make the great President happy. That is all that counts.',
    // over once it has been read out; a muted computer leaves time to read it
    done: (ctx, seconds) => (seconds > 2 && !ctx.speaking) || seconds > 50,
  },
  {
    text: 'Welcome to flight school. Training clones are free — enjoy it while it lasts.',
    done: (_, seconds) => seconds > 5,
  },
  {
    text: 'Main drive: hold W, RT or DRIVE until you fly 50 m/s.',
    done: (ctx) => ctx.me.flight.velocity.length() >= FAST,
  },
  {
    text: 'Let go of the drive. Nothing slows you down out here: you keep drifting.',
    done: (ctx, _, progress) => holdFor(progress, ctx.controls.thrust === 0, ctx.dt, 3),
  },
  {
    text: 'To stop, your drive has to point into the flight direction. Press X, Y or FLIP: the flight computer flips the ship.',
    done: (ctx) => ctx.me.flight.angleTo(retrograde.copy(ctx.me.flight.velocity).negate()) < 0.15,
  },
  {
    text: 'Now burn until you are below 5 m/s. The orange cross on the HUD always marks the braking direction.',
    done: (ctx) => ctx.me.flight.velocity.length() < STOPPED,
  },
  {
    text: 'Maneuvering thrusters push you sideways: A/D and R/F, the right stick, or the right thumb stick on touch. Sidestep for a moment.',
    done: (ctx, _, progress) => holdFor(progress, ctx.me.flight.rcs.length() > 0.5, ctx.dt, 1.5),
  },
  {
    text: 'A target drone. Turn towards it and fire: Space, click, LT or FIRE. Three hits wreck any hull, a shot through the center hits the reactor.',
    enter: (ctx) => ctx.spawnDrone(),
    done: (ctx) => !!ctx.drone && !ctx.drone.alive,
    waypoint: (ctx) => (ctx.drone?.alive ? ctx.drone.flight.position : null),
  },
  {
    text: 'Every shot heats your ship. In the shadow of an asteroid the radiators cool much faster. Fly into the marked shadow.',
    done: (ctx) => ctx.me.inShadow,
    waypoint: nearestShadow,
  },
  {
    text: 'When IMPACT appears below the crosshair, flip and burn or steer past. A rock at more than 70 m/s ends your clone.',
    done: (_, seconds) => seconds > 8,
  },
  {
    text: 'Flight school complete. Your clone is cleared for the tournament.',
    done: (_, seconds) => seconds > 5,
  },
];

/** The guided training: one step after another, each checked against the pilot's flying. */
export class FlightSchool {
  private index = 0;
  private enteredAt = 0;
  private readonly progress = { held: 0 };
  private entered = false;

  get finished() {
    return this.index >= STEPS.length;
  }

  /** Advances the training; returns the waypoint to mark, if any. */
  update(ctx: SchoolContext): THREE.Vector3 | null {
    if (this.finished) return null;
    const step = STEPS[this.index];
    if (!this.entered) {
      this.entered = true;
      this.enteredAt = ctx.now;
      this.progress.held = 0;
      step.enter?.(ctx);
    }
    if (ctx.me.alive && step.done(ctx, ctx.now - this.enteredAt, this.progress)) {
      this.index++;
      this.entered = false;
      return null;
    }
    return step.waypoint?.(ctx) ?? null;
  }

  /** "Step 3/10" and the instruction of the current step. */
  get status(): { step: string; text: string } {
    const step = STEPS[Math.min(this.index, STEPS.length - 1)];
    return { step: `Flight school ${Math.min(this.index + 1, STEPS.length)}/${STEPS.length}`, text: step.text };
  }

  get stepIndex() {
    return this.index;
  }
}
