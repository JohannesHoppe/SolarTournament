import * as THREE from 'three';
import type { Assets } from '../assets';
import { IDLE, type Controls, type Device } from '../input/input';
import { Bot, evenSkills, pressOn, raceSpeedOf, skillsFrom, type Skill, type Skills } from '../ship/bots';
import { flyByNose, MAIN_THRUST, MAX_SPEED } from '../ship/flight';
import { AIM_ASSIST_ANGLE, AIM_ASSIST_RANGE, assistAim, Brake, keepUpright } from '../ship/computer';
import { cos, sin } from '../detmath';
import { firstHull, LASER_RANGE, MAX_HEAT, Ship } from '../ship/ship';
import { bounceOff, impactDamage, ram, RAM_SAFE, SAFE_IMPACT } from '../ship/impact';
import { FlightSchool, type Attempt, type SchoolContext } from '../game/school';
import { approachGate, coilPush } from '../game/race';
import { RacingLine } from '../game/racingline';
import { aimHook, anchorPoint, clearOf, flightTime, floorOf, HOOK_RECHARGE, newTether, pullOn, type Tether } from '../game/hook';
import { readOrbit, orbitable, type OrbitState } from '../game/orbit';
import { Torpedoes, TORPEDO_DAMAGE, type Torpedo } from '../game/torpedoes';
import { BOT_GEAR, hullLooks } from '../game/hangar';
import { hullOf, spareSkills, type Campaign, type Choice, type Mission } from '../campaign/campaign';
import type { SceneName } from '../campaign/scenes';
import type { ItemKind } from '../game/items';
import { arenaById, DEFAULT_ARENA, type ArenaProfile } from '../world/arenas';
import { ARENA_LIMIT } from '../world/arena';
import { FIELD_RADIUS, raySphere, type AsteroidField, type RayHit } from '../world/asteroids';
import { airStep, dragOn, reachIn, SIGHT_DEPTH } from '../world/air';
import { IMMOVABLE, massOf, MASS, type Body } from '../world/bodies';
import type { Claim } from '../world/mining';
import { DETAIL } from '../world/rocks';
import { FieldContacts } from '../world/contacts';
import { claimsIn, testField } from './field';
import { SHIP_RADIUS } from './pilot';

/**
 * A headless stand-in for the game around the flight school (see SchoolContext): the campaign's
 * jobs flown in Node, drill by drill, through the drills' own code, by a simulated Host. What it
 * keeps of the game: the place's real field (its gravity, air and ground), the ships as the game's
 * Ship with the flight model, the clone's hull and the campaign's parts, every other ship flown by
 * a Bot of ship/bots as the game sets it up (drones, sparring bots, raiders, rivals, wingmen),
 * lasers along the nose through rock, hulls and the drill's props, torpedoes, the own hook on rock
 * and ship, the orbit readout. What it leaves out is said where it is left out.
 */

/** The simulation steps at 30 frames a second, a slow browser's rate (the game's longest step). */
export const JOB_STEP = 1 / 30;
/** A line takes this long to say (s) per word, and this long at least: Nicole's pace, read off the rendered voice roughly. */
const WORD_SECONDS = 0.38;
const LINE_MIN = 1.5;
/** A dead clone's next is printed after this (s), as the game's RESPAWN_SECONDS; a bot's after its ad as well (see sponsors). */
const CLONE_SECONDS = 3;
const BOT_CLONE_SECONDS = 8;
/** The last clone's death goes black this long before the attempt starts over (see Drill.lastClone). */
const NO_CLONE_SECONDS = 4;
/** The game's sides and numbers for raiders (see Game.jumpers): the side they fight on, how near a ship comes before they fight it, how far their saw reaches. */
const JUMPER_TEAM = 1;
const ALLY_TEAM = 2;
const SAW_DISTANCE = 8000;
const SAW_REACH = 200;
const JUMPER_NOTICE = 16000;
const SPARED_HULL = 30;
/** A comet's shower strikes this much harder than a beam (see Game.pelt). */
const SHOWER_WEIGHT = 1.5;
/** Rivals line up this far apart beside the start (see Game.spawnRacers). */
const RIVAL_GAP = 1200;
/** A bump slower than this only clunks (see Game.collideShips). */
const SHOVE_SPEED = 100;
/** The bots go easy on a Host who keeps dying (see Game.ease): up this much a death of the own clone to a killer, down this much a kill of the Host's, fading over EASE_FADE seconds. */
const DEATH_EASE = 0.35;
const KILL_EASE = 0.1;
const EASE_FADE = 90;
/** The simulated Host stays at the Gullet's plate this long (s) before it leaves by it. */
const GULLET_STAY = 3;
/** Bots send a torpedo at a locked target this often a second (see Game, BOT_TORPEDO_RATE), within this cone and reach. */
const BOT_TORPEDO_RATE = 0.08;
const LOCK_ANGLE = 0.3;
const LOCK_DISTANCE = 60000;

/** A ship's model for Node: a collider box as big as the game's hulls (hit radius SHIP_RADIUS), with the parts a Ship looks for. */
function hullModel(): THREE.Object3D {
  const root = new THREE.Group();
  // the hit radius is 0.8 of the collider's bounding sphere (see Ship, sharedRadius)
  const half = SHIP_RADIUS / 0.8 / Math.sqrt(3);
  const collider = new THREE.Mesh(new THREE.BoxGeometry(half * 2, half * 2, half * 2));
  collider.userData.collider = true;
  root.add(collider);
  for (const name of ['trim', 'trimStern']) root.add(Object.assign(new THREE.Group(), { name }));
  root.add(Object.assign(new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshBasicMaterial()), { name: 'radiator' }));
  return root;
}

/** The assets a Ship takes, without a GPU or the model files. */
export function nodeAssets(): Assets {
  return { ships: { human: hullModel(), alien: hullModel(), sovereign: hullModel(), magpie: hullModel() }, textures: { flameFrames: [], glow: new THREE.Texture() } } as unknown as Assets;
}

/** What a simulated Host does with its hands this step: the stick, drive and thrusters, and the keys a drill may ask for. */
export interface Hands {
  controls: Controls;
  /** The brake held (the flight computer flips and burns to rest). */
  brake: boolean;
  /** The hook's key pressed this step (a toggle: fire, or let go). */
  hook: boolean;
  /** The self-destruct's key held. */
  selfDestruct: boolean;
  /** A torpedo fired this step. */
  torpedo: boolean;
  /** The autopilot as the Host wants it: its key pressed where it is otherwise (left out: as it is). */
  autopilot?: boolean;
}

/** A simulated Host: given the world as the HUD shows it, its hands for the step. */
export type Host = (world: JobWorld) => Hands;

/** What happened to the clones of a job, for the test's verdict. */
export interface Deaths {
  /** Deaths of the own clone by cause. */
  causes: Record<string, number>;
  total: number;
}

const up = new THREE.Vector3(0, 1, 0);
const gravity = new THREE.Vector3();
const scratch = new THREE.Vector3();
const scratch2 = new THREE.Vector3();
const normal = new THREE.Vector3();
const surface = new THREE.Vector3();
const sweep = new THREE.Vector3();
const apart = new THREE.Vector3();
const facing = new THREE.Matrix4();
const rayHit: RayHit = { asteroid: null, distance: 0, center: new THREE.Vector3() };
const sawHit: RayHit = { asteroid: null, distance: 0, center: new THREE.Vector3() };

/** A turn that looks from `eye` at `target`. */
export const lookingAt = (eye: THREE.Vector3, target: THREE.Vector3, upward: THREE.Vector3 = up) => new THREE.Quaternion().setFromRotationMatrix(facing.lookAt(eye, target, upward));

interface Raiders {
  bots: Bot[];
  rock: string | null;
  rig: THREE.Vector3;
  hold: number;
  hits: number;
  guard: boolean;
  hooks: boolean;
  spares: boolean;
  blanks: boolean;
}

interface Rivals {
  bots: Bot[];
  rings: THREE.Vector3[];
  normals: THREE.Vector3[];
  radius: number;
  line: RacingLine;
  laps: number;
  passed: number[];
  sides: number[];
  finished: number;
}

/**
 * One job of the campaign in flight: its place's field, the own clone in the campaign's hull, the
 * drill's ships, and the flight school running the job's drills, stepped JOB_STEP at a time. It is
 * the drills' SchoolContext, filled in each step as the game's teach() does.
 */
export class JobWorld implements SchoolContext {
  readonly field: AsteroidField;
  readonly school: FlightSchool;
  readonly ships: Ship[] = [];
  readonly bots = new Map<Ship, Bot>();
  readonly me: Ship;
  readonly deaths: Deaths = { causes: {}, total: 0 };
  readonly assets = nodeAssets();
  venue: ArenaProfile = DEFAULT_ARENA;
  /** The waypoint and its label the drill showed last step (the HUD's marker). */
  waypoint: THREE.Vector3 | null = null;
  /** The scene in person the clone stands in, if any: the hull waits in its clamps, the Host's hands only turn its head. */
  scene: SceneName | null = null;
  /** What the simulated Host is up to, in a few words, for a trace of a job. */
  note = '';
  /** The lines said so far, in order, and the drill's fail lines among them. */
  readonly said: string[] = [];
  /** Seconds the voice still speaks (see say). */
  private voice = 0;
  private readonly torpedoList: Torpedoes;
  private tether: Tether | null = null;
  private hookReadyAt = 0;
  private jumpers: Raiders | null = null;
  private racers: Rivals | null = null;
  private sparring: { bot: Bot; armed: boolean } | null = null;
  private wingmanBot: Bot | null = null;
  private readonly flockShips: Ship[] = [];
  private readonly brake = { held: false };
  private noClone = false;
  /** How often the own clone was printed inside a piece of the field. */
  buried = 0;
  private ease = 0;
  private shipCount = 0;

  // what the drills read and set (see SchoolContext)
  controls: Controls = { ...IDLE };
  braking = false;
  hooked = false;
  hookedShip: Ship | null = null;
  hookedRock: SchoolContext['hookedRock'] = null;
  impactAhead = false;
  orbit: OrbitState | null = null;
  autopilot = false;
  keepDrift = false;
  towDrone = false;
  cockpit = false;
  device: Device = 'keyboard';
  now = 0;
  dt = JOB_STEP;
  drone: Ship | null = null;
  rocksBroken = 0;
  rigBeams = 0;
  torpedoesDown = 0;
  torpedoesHit = 0;
  dodges = 0;
  readonly brokenAt = new THREE.Vector3();
  brokenId = '';
  selfDestructing = false;
  fined = 0;
  owed = 0;
  gold = false;
  readonly choices: Choice[] = [];

  constructor(
    readonly mission: Mission,
    readonly campaign: Campaign,
    private readonly host: Host,
    start = 0,
  ) {
    this.field = testField(DETAIL);
    this.torpedoList = new Torpedoes({ puff: () => undefined } as never);
    this.me = this.addShip('me', 'Host', 'magpie');
    this.me.outfit(hullOf(campaign));
    this.school = new FlightSchool(null, start, mission);
    this.enter(arenaById(this.school.arena ?? '') ?? DEFAULT_ARENA);
    this.respawn(this.me);
    this.autopilot = this.school.startsWithAutopilot;
  }

  // ---- the game's round, stepped ----

  /** One step of the job: the Host's hands, every ship, the field, the hook, then the drill (as the game's updateRound runs them). */
  step() {
    const now = (this.now += JOB_STEP);
    this.voice = Math.max(0, this.voice - JOB_STEP);
    this.ease = Math.max(0, this.ease - JOB_STEP / EASE_FADE);
    const hands = this.me.alive && !this.scene ? this.host(this) : { controls: IDLE, brake: false, hook: false, selfDestruct: false, torpedo: false };
    this.selfDestructing = hands.selfDestruct;
    this.braking = hands.brake && this.me.alive;
    const mine = this.flightComputer(hands);
    if (hands.hook && this.me.alive) this.pressHook();
    if (hands.torpedo && this.me.alive) this.fireTorpedo(this.me);
    if (this.jumpers) pressOn(this.jumpers.bots, this.me);
    for (const ship of [...this.ships]) {
      if (!ship.alive) {
        this.reprint(ship);
        continue;
      }
      const bot = this.bots.get(ship);
      const thought = bot ? this.think(bot) : null;
      // the target drone keeps its drive turned to the pilot (see Game.updateRound)
      if (ship === this.drone && this.me.alive) ship.flight.orientation.setFromRotationMatrix(facing.lookAt(this.me.flight.position, ship.flight.position, this.me.flight.up(scratch)));
      // in a scene in person the hull waits in its clamps
      const steered = ship === this.me ? (this.scene ? IDLE : mine) : (thought ?? IDLE);
      const holds = steered.fire && ((this.spares(ship) && !this.onDrive(ship)) || (this.harpooner(ship) && this.onDrive(ship)));
      const controls = holds ? { ...steered, fire: false } : steered;
      this.outside(ship, gravity);
      ship.sunCooling = this.venue.cooling;
      if (ship.update(JOB_STEP, now, controls, gravity)) this.fireLaser(ship);
      if (bot && bot !== this.sparring?.bot && (bot.target || bot.siege) && ship.torpedoes > 0 && Math.random() < JOB_STEP * BOT_TORPEDO_RATE) this.fireTorpedo(ship);
      this.friction(ship);
      this.keepInArena(ship);
      this.collide(ship);
    }
    this.collideShips();
    this.updateHook();
    this.torpedoList.update(JOB_STEP, now, this.field, this.ships, (torpedo, hit) => this.detonate(torpedo, hit));
    this.teach();
    // then the field steps on, its pieces meeting each other and the ground (see Game.draw, knock)
    this.field.update(JOB_STEP);
    this.contacts.run(this.field);
    this.field.crumble();
  }
  private readonly contacts = new FieldContacts();

  /** The flight computer of the own ship, as the game's: the brake while held, else the stick as the Host gives it (the simulated Host flies in free drift, see Host). */
  private flightComputer(hands: Hands): Controls {
    // the autopilot's key, pressed where the Host wants it otherwise
    if (hands.autopilot !== undefined && hands.autopilot !== this.autopilot) this.setAutopilot(hands.autopilot);
    if (!this.brake.held && hands.brake) this.brakeComputer.release();
    this.brake.held = hands.brake;
    const flight = this.me.flight;
    if (hands.brake) return this.brakeComputer.fly(flight, hands.controls, this.me.drive * this.me.perks.drive, this.computed);
    // with the autopilot the ship flies where its nose points, unless the drill's drift is the point or the hook holds (see Game.trimDrift)
    const out = !this.autopilot || this.keepDrift || this.tether ? Object.assign(this.computed, hands.controls) : flyByNose(flight, hands.controls, this.outside(this.me, gravity), this.computed);
    return this.assistAim(keepUpright(flight, out));
  }

  /** The game's aim assist for the Host (see Game.assistAim, aimTarget): a ship of another side in sight close to the nose pulls it on. */
  private assistAim(out: Controls): Controls {
    const flight = this.me.flight;
    let best: Ship | null = null;
    let angle = AIM_ASSIST_ANGLE;
    for (const ship of this.ships) {
      if (ship === this.me || !ship.alive || ship.allyOf(this.me)) continue;
      const line = scratch.subVectors(ship.flight.position, flight.position);
      const off = flight.noseAngleTo(line);
      if (off < angle && line.length() <= AIM_ASSIST_RANGE && this.field.lineOfSight(flight.position, ship.flight.position)) {
        best = ship;
        angle = off;
      }
    }
    return best ? assistAim(flight, scratch.subVectors(best.flight.position, flight.position), out) : out;
  }
  /** The brake as the game's flight computer flies it while the Host holds it: a flip and a burn against the flight to rest. */
  private readonly brakeComputer = new Brake();
  private readonly computed: Controls = { ...IDLE };

  /** The drill for this step, as the game's teach(): the context filled in, the arena changed where the drill flies elsewhere. */
  private teach() {
    this.hooked = !!this.tether?.anchor && this.tether.flying <= 0;
    this.hookedShip = this.hooked ? (this.tether!.anchor!.ship ?? null) : null;
    this.hookedRock = this.hooked ? (this.tether!.anchor!.rock ?? null) : null;
    this.orbit = this.readOrbit();
    const arena = arenaById(this.school.arena ?? '') ?? DEFAULT_ARENA;
    if (arena !== this.venue) {
      this.enter(arena);
      if (this.me.alive) this.respawn(this.me);
    }
    this.waypoint = this.school.update(this);
  }

  /** The orbit readout as the HUD shows it (see Game.wellAlarm): only with Nicole's wells module, near a well an orbit fits about. */
  private readOrbit(): OrbitState | null {
    const well = this.field.well;
    if (!this.me.alive || !well || !this.campaign.modules.includes('wells') || !orbitable(well)) return null;
    const thrust = MAIN_THRUST * Math.max(this.me.drive * this.me.perks.drive, 0.01);
    return readOrbit(well, this.me.flight.position, this.me.flight.velocity, thrust, true, this.orbit === 'ready' || this.orbit === 'stable');
  }

  /** The place's field, generated anew (see Game.enterArena). */
  private enter(arena: ArenaProfile) {
    this.dropHook();
    this.venue = arena;
    this.field.generate(arena.layout);
    this.contacts.reset();
  }

  /** What pulls and brakes a ship: the field's gravity and an air's drag (see Game.outside). */
  private outside(ship: Ship, target: THREE.Vector3) {
    this.field.gravity(ship.flight.position, target);
    if (this.field.air) dragOn(this.field.air, ship.flight.position, ship.flight.velocity, JOB_STEP, target);
    return target;
  }

  /** A planet's air heats a ship by its speed and depth; what the radiators cannot shed burns the hull (see Game.friction). */
  private friction(ship: Ship) {
    const air = this.field.air;
    if (!air || !ship.alive) {
      ship.finSpin.set(0, 0, 0);
      return;
    }
    const burn = airStep(ship, air, JOB_STEP, MAX_HEAT);
    if (burn > 0 && ship.structural(burn, this.now) === 'destroyed') this.destroyed(ship, null, 'air');
  }

  /** A place of the campaign has no edge; an arena of the Games loses a ship far out (see Game.keepInArena, the school's patience). */
  private keepInArena(ship: Ship) {
    if (!ship.alive || this.venue.open || ship.flight.position.length() < ARENA_LIMIT) return;
    if (ship.flight.position.length() < ARENA_LIMIT * 4) return;
    ship.structural(Infinity, this.now);
    if (!ship.alive) this.destroyed(ship, null, 'space');
  }

  /** A ship against the well, rock (swept along its way), the drill's rings and hulls (see Game.collide). */
  private collide(ship: Ship) {
    const flight = ship.flight;
    if (this.field.insideWell(flight.position, ship.radius)) {
      ship.protectedUntil = Math.min(ship.protectedUntil, this.now);
      if (ship.structural(Infinity, this.now) === 'destroyed') this.destroyed(ship, null, 'well');
      return;
    }
    const moved = flight.position.distanceTo(ship.previous);
    if (moved > ship.radius) {
      sweep.subVectors(flight.position, ship.previous).divideScalar(moved);
      const hit = this.field.raycast(ship.previous, sweep, moved, false, rayHit);
      if (hit) flight.position.copy(ship.previous).addScaledVector(sweep, Math.max(0, hit.distance - 1));
    }
    const rock = this.field.overlap(flight.position, ship.radius);
    if (rock && this.field.resolve(rock, flight.position, ship.radius, normal)) {
      this.field.surfaceVelocity(rock, scratch.copy(flight.position).addScaledVector(normal, -ship.radius), surface);
      this.bounce(ship, surface, 'rock');
    } else if (this.school.touchesRing(flight.position, ship.radius, normal)) this.bounce(ship, surface.set(0, 0, 0), 'gate');
    else if (this.school.touchesHull(flight.position, ship.radius, normal)) this.bounce(ship, surface.set(0, 0, 0), 'hull');
  }

  /** A ship touched a surface moving at `moving` (`normal` outward): it bounces off, and an impact hurts (see Game.bounce). */
  private bounce(ship: Ship, moving: THREE.Vector3, what: string) {
    const approach = bounceOff(ship.flight.velocity, moving, normal);
    if (approach < SAFE_IMPACT) return;
    if (ship.structural(impactDamage(approach), this.now) === 'destroyed') this.destroyed(ship, null, what);
  }

  /** No hull passes through another: two ships in contact bounce apart, a fast one rams (see Game.collideShips, the shove's spin left out). */
  private collideShips() {
    const living = this.ships.filter((ship) => ship.alive);
    living.forEach((a, i) => living.slice(i + 1).forEach((b) => this.contact(a, b)));
  }

  /** Two ships, `a` and `b`: pushed out of each other half each, bouncing as equal bodies, each rammed where the other struck it. */
  private contact(a: Ship, b: Ship) {
    if (!a.alive || !b.alive) return;
    const overlap = a.radius + b.radius - apart.subVectors(b.flight.position, a.flight.position).length();
    if (overlap <= 0) return;
    if (apart.lengthSq() > 1e-12) apart.normalize();
    else apart.set(0, 1, 0);
    b.flight.position.addScaledVector(apart, overlap / 2);
    a.flight.position.addScaledVector(apart, -overlap / 2);
    const closing = ram(a.body, b.body, apart, true, true);
    if (closing < Math.max(SHOVE_SPEED, RAM_SAFE)) return;
    if (b.rammed(apart, closing, this.now).status === 'destroyed') this.destroyed(b, a, 'ram');
    if (a.rammed(apart.negate(), closing, this.now).status === 'destroyed') this.destroyed(a, b, 'ram');
  }

  /** A ship's laser fires along its nose: the first of rock, a hull or a drill's prop takes the beam (see Game.fireLaser; wreckage and rings' housings left out). */
  private fireLaser(shooter: Ship) {
    shooter.protectedUntil = Math.min(shooter.protectedUntil, this.now);
    // an actor's shot for the cameras flies wide and hurts nothing (see SchoolContext.blanks)
    if (this.jumpers?.blanks && this.isRaider(shooter)) return;
    const origin = shooter.nose(new THREE.Vector3());
    const direction = shooter.flight.forward(new THREE.Vector3());
    const range = LASER_RANGE * shooter.perks.laserReach;
    const reach = this.field.air ? reachIn(this.field.air, origin, direction, SIGHT_DEPTH, range) : range;
    let rock = this.field.raycast(origin, direction, reach, false, rayHit);
    let length = rock?.distance ?? reach;
    const hull = firstHull(this.ships, shooter, origin, direction, length);
    let struck = hull?.ship ?? null;
    if (hull) {
      rock = null;
      length = hull.distance;
    }
    const blocked = this.school.hullRay(origin, direction, length);
    if (blocked !== null) {
      rock = struck = null;
      length = blocked;
    }
    // a torpedo before all of it takes the beam and goes off
    const torpedo = this.torpedoList.raycast(origin, direction, length, shooter, this.now);
    if (torpedo) {
      this.torpedoList.remove(torpedo.torpedo);
      if (shooter === this.me) this.torpedoesDown++;
      return;
    }
    const raid = this.jumpers;
    if (raid && raid.rock === null && blocked !== null && this.isRaider(shooter)) {
      // the Loose fire harpoons at the tugs they raid, never beams
      if (raid.hooks) {
        if (this.school.harpoonAlong(origin, direction, blocked + 1, shooter)) return;
      } else if (this.school.bargeRay(origin, direction, blocked + 1) !== null) raid.hits++;
    }
    const end = origin.clone().addScaledVector(direction, length);
    if (blocked !== null && shooter === this.me) this.school.struck(end);
    if (struck) this.laserHit(struck, origin, direction, shooter);
    const asteroid = rock?.asteroid;
    if (!asteroid) return;
    if (shooter === this.me && rock!.part) this.rigBeams++;
    if (raid && rock!.part && asteroid.id === raid.rock && this.isRaider(shooter)) {
      raid.hits++;
      return;
    }
    if (asteroid.solid) return;
    const broken = this.field.hit(asteroid.id);
    if (broken && shooter === this.me) {
      this.rocksBroken++;
      this.brokenAt.copy(broken.object.position);
      this.brokenId = broken.id;
    }
  }

  /** A beam through a ship (see Game.applyLaserHit): a raider who spares clones only scorches a hull worn down. */
  private laserHit(ship: Ship, origin: THREE.Vector3, direction: THREE.Vector3, shooter: Ship | null, weight = 1) {
    if (shooter && ship.hull <= SPARED_HULL && this.spares(shooter)) return;
    const { status, zone } = ship.laserHit(origin, direction, this.now, weight);
    if (status === 'protected') return;
    if (shooter && (zone === 'drive' || zone === 'reactor')) this.bots.get(ship)?.struck(shooter, this.now);
    if (status === 'destroyed') this.destroyed(ship, shooter, shooter ? 'laser' : 'shower');
  }

  /** A torpedo of a ship at the ship nearest its nose within the lock's cone (see Game.fireTorpedo, torpedoTarget). */
  private fireTorpedo(ship: Ship) {
    if (!ship.alive || ship.torpedoes <= 0) return;
    let target: Ship | null = null;
    let angle = LOCK_ANGLE;
    for (const other of this.ships) {
      if (other === ship || !other.alive || other.allyOf(ship) || other.protectedUntil > this.now) continue;
      const line = scratch.subVectors(other.flight.position, ship.flight.position);
      const off = ship.flight.noseAngleTo(line);
      if (line.length() < LOCK_DISTANCE && off < angle && this.field.lineOfSight(ship.flight.position, other.flight.position)) {
        target = other;
        angle = off;
      }
    }
    if (!target && ship !== this.me) return;
    ship.torpedoes--;
    ship.protectedUntil = Math.min(ship.protectedUntil, this.now);
    this.torpedoList.launch(`${ship.id}.${ship.torpedoesFired++}`, ship, target, ship.nose(new THREE.Vector3()), Torpedoes.launchVelocity(ship), this.now, true);
  }

  /** A torpedo went off; on a ship, it takes TORPEDO_DAMAGE of its hull (see Game.detonate, applyTorpedoHit). */
  private detonate(torpedo: Torpedo, hit: Ship | null) {
    this.torpedoList.remove(torpedo);
    if (!hit) return;
    const status = hit.structural(TORPEDO_DAMAGE, this.now);
    if (status === 'protected') return;
    if (torpedo.shooter === this.me) this.torpedoesHit++;
    hit.thrusters = Math.max(0, hit.thrusters - 0.3);
    if (status === 'destroyed') this.destroyed(hit, torpedo.shooter, 'torpedo');
  }

  /** A ship lost: its killer's kill, its clone's wait (see Game.shipDestroyed). */
  private destroyed(victim: Ship, killer: Ship | null, cause: string) {
    victim.respawnAt = this.now + (victim === this.me ? CLONE_SECONDS : BOT_CLONE_SECONDS);
    if (killer && killer !== victim && !killer.allyOf(victim)) killer.kills++;
    if (victim === this.me && killer && killer !== victim) this.ease = Math.min(1, this.ease + DEATH_EASE);
    if (killer === this.me && victim !== this.me) this.ease = Math.max(0, this.ease - KILL_EASE);
    if (victim === this.me) {
      this.deaths.total++;
      this.deaths.causes[cause] = (this.deaths.causes[cause] ?? 0) + 1;
      this.dropHook();
    }
  }

  /** A dead ship's next clone (see Game.updateRound): the own one at the job's start; the drill's drone, sparring bot, wingman and raiders stay down. */
  private reprint(ship: Ship) {
    if (this.now < ship.respawnAt || ship === this.drone || ship === this.sparring?.bot.ship || ship === this.wingmanBot?.ship || this.isRaider(ship) || this.flockShips.includes(ship)) return;
    if (ship === this.me && this.school.lastClone && !this.noClone) {
      this.noClone = true;
      ship.respawnAt = this.now + NO_CLONE_SECONDS;
      return;
    }
    this.noClone = false;
    this.respawn(ship);
  }

  /**
   * A clone printed: the own one where the job's story starts (see Game.respawn: the mission's
   * start, else the place's), any other on the field's edge, clear of rock.
   */
  private respawn(ship: Ship) {
    if (ship === this.me) this.dropHook();
    const start = ship === this.me ? (this.mission.start ?? this.venue.start) : undefined;
    const at = new THREE.Vector3();
    const toward = new THREE.Vector3();
    if (start) {
      at.set(...start.at);
      toward.set(...start.toward);
    } else {
      for (let i = 0; i < 24; i++) {
        at.randomDirection().multiplyScalar(FIELD_RADIUS);
        if (!this.field.overlap(at, ship.radius * 10) && !this.field.insideWell(at, ship.radius * 40)) break;
      }
    }
    ship.spawn(at, lookingAt(at, toward), this.now);
    if (ship === this.me && this.field.overlap(at, ship.radius)) this.buried++;
  }

  // ---- the own hook (see Game.hookOwn, fireHook, updateHooks): on rock and on ships, none of the cores, probes or torpedoes ----

  private pressHook() {
    if (this.tether) {
      this.dropHook();
      return;
    }
    if (this.now < this.hookReadyAt || !this.me.perks.hook) return;
    // a target drone is no ship to hook, unless the drill has it there to be towed
    const aim = aimHook(this.me, this.field, this.ships.filter((ship) => ship !== this.drone || this.towDrone));
    const end = aim ? aim.at : this.me.nose(new THREE.Vector3()).addScaledVector(this.me.flight.forward(scratch), 20000);
    this.tether = newTether(this.me, aim?.anchor ?? null, flightTime(aim?.distance ?? 20000), end, 0, new THREE.Line());
  }

  private dropHook() {
    if (this.tether) this.hookReadyAt = this.now + HOOK_RECHARGE;
    this.tether = null;
  }

  private readonly bite = new THREE.Vector3();
  private readonly rockBody: Body & { mass: number } = { position: new THREE.Vector3(), velocity: new THREE.Vector3(), mass: IMMOVABLE };

  private updateHook() {
    const tether = this.tether;
    if (!tether) return;
    const owner = tether.owner;
    const fresh = tether.flying > 0 && (tether.flying -= JOB_STEP) <= 0;
    if (tether.flying > 0) return;
    const at = tether.anchor ? anchorPoint(tether.anchor, this.bite) : null;
    if (!at || !tether.anchor) {
      this.dropHook();
      return;
    }
    if (fresh) {
      tether.cable.follow(this.field, at, owner.flight.position, false);
      tether.length = tether.cable.length(at, owner.flight.position);
    }
    if (!tether.cable.follow(this.field, at, owner.flight.position, !fresh)) {
      this.dropHook();
      return;
    }
    const target = tether.anchor.ship;
    const rock = tether.anchor.rock;
    if (!target) {
      this.rockBody.mass = rock ? massOf(rock) : IMMOVABLE;
      this.rockBody.position.copy(at);
      if (rock) this.field.surfaceVelocity(rock, at, this.rockBody.velocity);
      else this.rockBody.velocity.set(0, 0, 0);
    }
    const path = tether.cable.path(true);
    const floor = path ? clearOf(owner, path.nearRock) : floorOf(owner, tether.anchor);
    const length = pullOn(owner.body, target ? target.body : this.rockBody, tether.length, true, floor, MAX_SPEED + 800, JOB_STEP, target ? 'moved' : 'fixed', path, path ? clearOf(owner, path.farRock) : 0);
    if (length === null) this.dropHook();
    else tether.length = length;
  }

  // ---- the drill's ships (see the Game's spawnDrone, spawnSparring, spawnJumpers, spawnRacers, wingman, flock) ----

  private addShip(id: string, name: string, type: 'human' | 'alien' | 'magpie'): Ship {
    const ship = new Ship(id === 'me' ? id : `${id}#${++this.shipCount}`, name, type, this.assets, id === 'me');
    this.ships.push(ship);
    return ship;
  }

  private removeShip(ship: Ship) {
    const i = this.ships.indexOf(ship);
    if (i >= 0) this.ships.splice(i, 1);
    this.bots.delete(ship);
    if (this.tether?.anchor?.ship === ship) this.dropHook();
  }

  private addBot(id: string, name: string, type: 'human' | 'alien', skills: Skills): Bot {
    const ship = this.addShip(id, name, type);
    const bot = new Bot(ship, skills);
    this.bots.set(ship, bot);
    return bot;
  }

  private isRaider(ship: Ship) {
    return !!this.jumpers?.bots.some((bot) => bot.ship === ship);
  }

  private spares(ship: Ship) {
    return !!this.jumpers?.spares && this.isRaider(ship);
  }

  private harpooner(ship: Ship) {
    return !!this.jumpers?.hooks && this.isRaider(ship);
  }

  /** Whether the first hull on a ship's nose shows it its drive. */
  private onDrive(shooter: Ship): boolean {
    const direction = shooter.flight.forward(scratch2);
    const hull = firstHull(this.ships, shooter, shooter.nose(scratch), direction, LASER_RANGE * shooter.perks.laserReach);
    return !!hull?.ship && hull.ship.tailToward(direction);
  }

  /** A bot's thought this step, with what the game tells it first (see Game.updateRound): a raider's saw, a rival's ring. */
  private think(bot: Bot): Controls {
    const ship = bot.ship;
    const raid = this.jumpers;
    bot.ease = this.ease;
    const sawing = !!raid && !raid.guard && raid.bots.includes(bot);
    bot.prey = null;
    bot.siege = sawing ? this.sawPoint(bot, raid) : null;
    // a raider keeps to the place it raids (see Game.updateRound)
    bot.homeAt = raid?.bots.includes(bot) ? raid.rig : null;
    bot.raceSpeed = raceSpeedOf(bot.skills);
    if (this.racers?.bots.includes(bot)) this.raceRival(bot, this.racers);
    const ships = sawing ? this.ships.filter((other) => other === ship || other.flight.position.distanceTo(ship.flight.position) < JUMPER_NOTICE) : this.ships;
    const thought = bot.think(this.now, ships, this.field);
    if (bot === this.sparring?.bot && !this.sparring.armed) thought.fire = false;
    return thought;
  }

  /** Where a raider saws at its target: holding off it on its own side, firing while nothing but the target lies in the way (see Game.sawPoint). */
  private sawPoint(bot: Bot, raid: Raiders): THREE.Vector3 {
    const from = bot.ship.flight.position;
    bot.siegeHold.subVectors(from, raid.rig).normalize().multiplyScalar(raid.hold).add(raid.rig);
    const way = scratch.subVectors(raid.rig, from);
    const distance = way.length();
    const first = this.field.raycast(from, way.divideScalar(Math.max(distance, 1)), distance + SAW_REACH, false, sawHit);
    bot.siegeClear = raid.rock !== null ? first?.asteroid?.id === raid.rock : !first;
    return raid.rig;
  }

  /** A rival of a mission's race through its next ring, counting its rings (see Game.raceRival). */
  private raceRival(bot: Bot, racers: Rivals) {
    const i = racers.bots.indexOf(bot);
    if (racers.passed[i] >= racers.rings.length * racers.laps) {
      bot.through = bot.waypoint = null;
      return;
    }
    const k = racers.passed[i] % racers.rings.length;
    const flight = bot.ship.flight;
    const offset = scratch.subVectors(flight.position, racers.rings[k]);
    const side = offset.dot(racers.normals[k]);
    const before = racers.sides[i];
    racers.sides[i] = side;
    if (Number.isFinite(before) && before < 0 !== side < 0 && offset.addScaledVector(racers.normals[k], -side).length() < racers.radius) {
      racers.passed[i]++;
      racers.sides[i] = NaN;
      if (racers.passed[i] >= racers.rings.length * racers.laps) racers.finished++;
      return;
    }
    bot.through = { center: racers.rings[k], facing: racers.normals[k], radius: racers.radius };
    const ahead = racers.line.target(flight.position, k, flight.velocity.length(), this.field, scratch2);
    bot.waypoint = approachGate(racers.rings[k], racers.normals[k], racers.radius, flight.position, flight.velocity, bot.ship.radius, ahead.clone());
  }

  // ---- SchoolContext ----

  setAutopilot(on: boolean) {
    this.autopilot = on;
  }

  readyOverdrive() {}

  spawnDrone(position: THREE.Vector3, velocity: THREE.Vector3, name = 'Target drone', mass: number = MASS.ship) {
    this.drone ??= this.addShip('drone', name, 'alien');
    if (!this.ships.includes(this.drone)) this.ships.push(this.drone);
    this.drone.name = name;
    this.drone.body.mass = mass;
    this.drone.spawn(position, lookingAt(this.me.flight.position, position, this.me.flight.up(scratch)), this.now);
    this.drone.flight.velocity.copy(velocity);
    this.drone.protectedUntil = this.now;
  }

  removeDrone() {
    if (this.drone) this.removeShip(this.drone);
    this.drone = null;
  }

  get bot() {
    return this.sparring?.bot.ship ?? null;
  }

  spawnBot(position: THREE.Vector3, armed: boolean, skill: number) {
    this.removeBot();
    const bot = this.addBot('sparring', 'Sparring bot', 'alien', evenSkills(skill));
    bot.armed = armed;
    this.sparring = { bot, armed };
    bot.ship.spawn(position, lookingAt(position, this.me.flight.position), this.now);
    bot.ship.protectedUntil = this.now;
  }

  removeBot() {
    if (this.sparring) this.removeShip(this.sparring.bot.ship);
    this.sparring = null;
  }

  /** A gunner's shot for show (see Game.drillShot): whether it passed the own hull. */
  fireAt(from: THREE.Vector3, through: THREE.Vector3): boolean {
    return raySphere(from, scratch.subVectors(through, from).normalize(), this.me.flight.position, this.me.radius) !== null;
  }

  fine(coins: number) {
    this.fined = coins;
  }

  claims(): Claim[] {
    return claimsIn(this.field, DETAIL);
  }

  stage(name: SceneName | null) {
    this.scene = name;
  }

  feel() {}

  /** The Gullet's plate: the simulated Host looks at it for GULLET_STAY seconds and leaves by it. */
  gulletPlate(open: boolean) {
    this.plateAt = open ? this.now : null;
  }

  get gulletLeft() {
    return this.plateAt !== null && this.now - this.plateAt > GULLET_STAY;
  }

  get gulletRegular() {
    return this.campaign.gullet;
  }

  visitGullet() {
    this.campaign.gullet = true;
  }

  private plateAt: number | null = null;

  boost(through: THREE.Vector3) {
    coilPush(this.me.flight.velocity, through, MAX_SPEED);
  }

  arm(item: 'torpedo' | 'nova') {
    if (item === 'nova') this.me.nova = true;
    else this.me.torpedoes = Math.max(this.me.torpedoes, 2);
  }

  torpedoAt(from: Ship) {
    this.torpedoList.launch(`${from.id}.${from.torpedoesFired++}`, from, this.me, from.nose(new THREE.Vector3()), Torpedoes.launchVelocity(from), this.now, true);
  }

  get torpedoes() {
    return this.torpedoList.list.length;
  }

  get incoming() {
    return this.torpedoList.list[0]?.position ?? null;
  }

  get tracked() {
    return this.torpedoList.list.some((torpedo) => torpedo.target === this.me);
  }

  spawnJumpers(rock: string | null, rig: THREE.Vector3, count: number, skill: Skill | readonly Skill[], names: readonly string[] = ['Saw'], hold = SAW_DISTANCE, guard = false, hooks = false) {
    this.removeJumpers();
    const bots: Bot[] = [];
    for (let i = 0; i < count; i++) {
      const bot = this.addBot(`jumper${i}`, names[i % names.length], i % 2 ? 'alien' : 'human', skillsFrom(Array.isArray(skill) ? (skill[i] ?? skill[0]) : (skill as Skill)));
      bot.ship.team = JUMPER_TEAM;
      const angle = (i / count) * Math.PI * 2;
      const at = new THREE.Vector3(cos(angle) * hold, hold * 0.5, sin(angle) * hold).add(rig);
      bot.ship.spawn(at, lookingAt(at, rig), this.now);
      bot.ship.protectedUntil = this.now;
      bots.push(bot);
    }
    this.jumpers = { bots, rock, rig: rig.clone(), hold, hits: 0, guard, hooks, spares: false, blanks: false };
  }

  moveJumpers(to: THREE.Vector3) {
    this.jumpers?.rig.copy(to);
  }

  removeJumpers() {
    for (const bot of this.jumpers?.bots ?? []) this.removeShip(bot.ship);
    this.jumpers = null;
  }

  get jumpersDown() {
    return this.jumpers?.bots.filter((bot) => !bot.ship.alive).length ?? 0;
  }

  get rigWear() {
    return this.jumpers?.hits ?? 0;
  }

  wingman(name: string, skill: Skill, at: THREE.Vector3) {
    this.removeWingman();
    const bot = this.addBot('wingman', name, 'human', skillsFrom(skill));
    this.wingmanBot = bot;
    bot.ship.team = this.me.team = ALLY_TEAM;
    bot.ship.spawn(at, lookingAt(at, this.me.flight.position), this.now);
    bot.ship.protectedUntil = this.now;
  }

  removeWingman() {
    if (this.wingmanBot) this.removeShip(this.wingmanBot.ship);
    this.wingmanBot = null;
    this.me.team = -1;
  }

  get spare(): Skills {
    return spareSkills(this.campaign.habits);
  }

  flock(positions: readonly THREE.Vector3[], names: readonly string[], velocity: THREE.Vector3) {
    for (const gone of this.flockShips.splice(positions.length)) this.removeShip(gone);
    for (let i = this.flockShips.length; i < positions.length; i++) {
      // in formation, never a target
      const ship = this.addShip(`flock${i}`, names[i % names.length], i % 2 ? 'alien' : 'human');
      ship.spawn(positions[i], lookingAt(positions[i], scratch.copy(positions[i]).add(velocity)), this.now);
      ship.protectedUntil = Infinity;
      this.flockShips.push(ship);
    }
    this.flockShips.forEach((ship, i) => {
      ship.flight.position.copy(positions[i]);
      ship.flight.velocity.copy(velocity);
    });
  }

  armLeader() {
    const leader = this.jumpers?.bots[0]?.ship;
    leader?.outfit(hullLooks(leader.type, BOT_GEAR));
  }

  announce() {}

  goldTime() {
    this.gold = true;
  }

  pelt(at: THREE.Vector3, direction: THREE.Vector3, ship?: Ship) {
    const hull = ship ?? this.me;
    if (hull.alive) this.laserHit(hull, at, direction, null, SHOWER_WEIGHT);
  }

  brawl() {
    for (const bot of this.jumpers?.bots ?? []) bot.ship.team = -1;
  }

  blanks() {
    if (this.jumpers) this.jumpers.blanks = true;
  }

  ambush(count: number, skill: number, names: readonly string[], hold: number) {
    const actors = this.jumpers?.bots.map((bot) => bot.ship) ?? [];
    const rig = this.jumpers?.rig ?? new THREE.Vector3();
    this.jumpers = null;
    this.spawnJumpers(null, rig, count, skill, names, hold);
    const raiders = this.jumpers!.bots;
    actors.forEach((actor, i) => {
      if (actor.alive) raiders[i % raiders.length].ship.kills++;
      this.removeShip(actor);
    });
  }

  get jumperKills() {
    return this.jumpers?.bots.map((bot) => bot.ship.kills) ?? [];
  }

  get leaderHull() {
    return this.jumpers?.bots[0]?.ship.hull ?? 0;
  }

  spareClones() {
    if (this.jumpers) this.jumpers.spares = true;
  }

  standDown(to: THREE.Vector3) {
    if (!this.jumpers) return;
    this.jumpers.guard = false;
    this.jumpers.rig.copy(to);
    this.jumpers.hold = 0;
  }

  jumperNear(point: THREE.Vector3, reach: number) {
    return !!this.jumpers?.bots.some((bot) => bot.ship.alive && bot.ship.flight.position.distanceTo(point) < reach);
  }

  choose(choice: Choice) {
    if (!this.choices.includes(choice)) this.choices.push(choice);
  }

  get leaderDown() {
    return !!this.jumpers && !this.jumpers.bots[0].ship.alive;
  }

  spawnRacers(rings: THREE.Vector3[], normals: THREE.Vector3[], radius: number, laps: number, count: number, skill: number, start: THREE.Vector3, names: readonly string[] = ['Nix', 'Bean', 'Spark'], skills?: readonly number[]) {
    this.removeRacers();
    // beside the start, to either side in turn, each facing the first ring
    const grid = lookingAt(start, rings[0]);
    const bots = Array.from({ length: count }, (_, i) => {
      const bot = this.addBot(`racer${i}`, names[i % names.length], i % 2 ? 'human' : 'alien', evenSkills(skills?.[i] ?? skill));
      const at = new THREE.Vector3((i % 2 ? 1 : -1) * (i + 1) * RIVAL_GAP, 0, 0).applyQuaternion(grid).add(start);
      bot.ship.spawn(at, lookingAt(at, rings[0]), this.now);
      bot.ship.protectedUntil = this.now;
      return bot;
    });
    this.racers = { bots, rings, normals, radius, line: new RacingLine(rings, true), laps, passed: new Array(count).fill(0), sides: new Array(count).fill(NaN), finished: 0 };
  }

  removeRacers() {
    for (const bot of this.racers?.bots ?? []) this.removeShip(bot.ship);
    this.racers = null;
  }

  get racersFinished() {
    return this.racers?.finished ?? 0;
  }

  /** Probes are not in any job (see Game.spawnProbe); one asked for waits where it is put. */
  spawnProbe(position: THREE.Vector3, _kind: ItemKind): THREE.Vector3 {
    return position.clone();
  }

  countdown() {}

  perfectStart() {}

  stall() {}

  /** The voice is busy while the lines it was given last take to say (see WORD_SECONDS). */
  get speaking() {
    return this.voice > 0;
  }

  say(lines: string[]): boolean {
    for (const line of lines) {
      this.said.push(line);
      this.voice += Math.max(LINE_MIN, line.split(/\s+/).length * WORD_SECONDS);
    }
    return true;
  }

  crash() {
    this.voice = 0;
  }

  owe(coins: number) {
    this.owed += coins;
  }

  linkLost() {
    this.voice = 0;
  }

  linkStatic() {}

  agony() {}

  // ---- what the simulated Host reads ----

  /** The ships a drill holds in formation (the Parade's clones, a smuggling run's patrols), as the Host sees them. */
  get formation(): readonly Ship[] {
    return this.flockShips;
  }

  /** The nearest torpedo homing on the own ship, if any (the lock warning shows where it comes from). */
  get homing(): THREE.Vector3 | null {
    let best: THREE.Vector3 | null = null;
    for (const torpedo of this.torpedoList.list) if (torpedo.target === this.me && (!best || torpedo.position.distanceTo(this.me.flight.position) < best.distanceTo(this.me.flight.position))) best = torpedo.position;
    return best;
  }

  /** The ships of the drill around the own one that are against it: the raiders and an armed sparring bot, alive. */
  get hostiles(): Ship[] {
    const raid = this.jumpers?.blanks ? [] : (this.jumpers?.bots ?? []);
    return [...raid, ...(this.sparring?.armed ? [this.sparring.bot] : [])].map((bot) => bot.ship).filter((ship) => ship.alive && !ship.allyOf(this.me));
  }

  /** The rivals of a mission's race, alive: they race and shoot whoever is ahead of them, as the Host may them. */
  get rivals(): Ship[] {
    return (this.racers?.bots ?? []).map((bot) => bot.ship).filter((ship) => ship.alive);
  }

  /** The rings or pipes of the running attempt, as the Host sees them set out in space (the race's marks, a time trial's coils), with where it counts from. */
  get course(): { points: readonly THREE.Vector3[]; normals: readonly THREE.Vector3[]; next: number; live: boolean; pipes: boolean } | null {
    const attempt = this.attempt;
    return attempt && attempt.normals.length ? attempt : null;
  }

  /** The running attempt of the drill, read as the HUD reads what it shows of it (its rings, its marker); null between attempts. */
  get attempt(): Attempt | null {
    return (this.school as unknown as { attempt: Attempt | null }).attempt;
  }

  /** The drill running now, as the panel names it. */
  get drillIndex() {
    return this.school.stepIndex;
  }
}

/** How one drill of a job went: its seconds, its attempts, the lines that started one over (or the clone's death), and whether it was done. */
export interface DrillRun {
  index: number;
  seconds: number;
  attempts: number;
  fails: string[];
  /** Attempts that failed within QUICK_FAIL seconds of counting: a drill that fails before a Host can act. */
  quick: number;
  done: boolean;
}

/** An attempt that fails within this long (s) of counting fails before a Host can do anything about it. */
export const QUICK_FAIL = 1;

/** How a job went: every drill reached, the deaths of the own clone, and whether all of it was done. */
export interface JobRun {
  done: boolean;
  seconds: number;
  drills: DrillRun[];
  deaths: Deaths;
  /** How often the own clone was printed inside a piece of the field. */
  buried: number;
}

/**
 * Flies a job (see JobWorld) from its first drill until its last is done, or a drill has run
 * `limit` seconds of simulated time, or has been started over `tries` times; how it went.
 * `watch` sees the world after every step (to look into a job that fails).
 */
export function flyJob(mission: Mission, campaign: Campaign, host: Host, limit = 900, tries = 12, watch?: (world: JobWorld) => void): JobRun {
  const world = new JobWorld(mission, campaign, host);
  const drills: DrillRun[] = [];
  let run = null as DrillRun | null;
  let attempt: Attempt | null = null;
  let heard = 0;
  let started = 0;
  while (!world.school.finished) {
    const index = world.drillIndex;
    if (run?.index !== index) {
      run = { index, seconds: 0, attempts: 0, fails: [], quick: 0, done: false };
      drills.push(run);
      started = world.now;
      attempt = null;
    }
    const now = world.attempt;
    if (now && now !== attempt) {
      // a new attempt at the same repetition is a start over: the line said for it, or the clone lost
      if (attempt && now.rep === attempt.rep) {
        const line = world.said.slice(heard).pop();
        run.fails.push(line ?? 'clone lost');
        if (line && attempt.seconds < QUICK_FAIL) run.quick++;
      }
      if (!attempt || now.rep === attempt.rep) run.attempts++;
      attempt = now;
      heard = world.said.length;
    }
    if (world.now - started > limit || run.attempts > tries) break;
    world.step();
    watch?.(world);
    run.seconds = world.now - started;
    if (world.drillIndex !== index || world.school.finished) run.done = true;
  }
  return { done: world.school.finished, seconds: world.now, drills, deaths: world.deaths, buried: world.buried };
}
