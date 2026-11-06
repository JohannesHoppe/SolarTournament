import * as THREE from 'three';
import { colliderRadius, type Assets, type ShipType } from '../assets';
import { FlightModel, MAIN_THRUST, METERS_PER_UNIT, RCS_THRUST, TURN_ACCELERATION } from './flight';
import { firing, NOZZLES, thrustersOf, type Thrusters } from './thrusters';
import { THRUSTER_LAYOUTS } from './models';
import { MASS, type Body } from '../world/bodies';
import { raySphere } from '../world/asteroids';
import { CLOG_LOSS } from '../world/air';
import { ramDamage, type RamZone } from './impact';
import type { Controls } from '../input/input';
import { ONLINE_LOAD, TORPEDOES } from '../game/torpedoes';
import { packItems, unpackItems } from '../game/items';
import { packLooks, STOCK, unpackLooks, type Perks } from '../game/hangar';
import { runningLight } from '../view/textures';
import { botTint, SOVEREIGN_TINT, TINTS } from './tints';
import { cos, exp, hypot, pow, sin } from '../detmath';
import { setFromAxisAngle, slerp } from '../detthree';

/** Hull integrity of an intact ship. There are no shields: every hit stays. */
export const MAX_HULL = 100;
/**
 * The ships are heavily armored: a beam from the front or the side only scorches the armor
 * (this many hull points; fifty such hits wreck a ship). The drive is the weak spot.
 */
const ARMOR_DAMAGE = 2;
/**
 * A beam from behind, within REAR_CONE of the ship's axis, goes into the drive: each hit costs
 * this share of the thrust, and the hit that leaves nothing of it sends the drive's reactor
 * critical, so five hits from behind destroy a ship.
 */
const DRIVE_HIT = 0.2;
/** Half the opening angle of the cone behind a ship from which a beam reaches the drive (rad, 50°). */
const REAR_CONE = 0.87;
const REAR_CONE_COS = cos(REAR_CONE);
/** Damage a beam into the flanks deals to the maneuvering thrusters (0..1), on top of the armor. */
const THRUSTER_HIT = 0.1;
/**
 * A ship whose Host bought them carries nanobots (see Ship.nanobots): NANO_WAIT (s) after the last blow
 * to the drive or the thrusters they begin to mend both, back to whole in NANO_SECONDS (s) from
 * nothing, so nobody flies on with a broken drive for the rest of a life. The hull they leave alone.
 */
export const NANO_WAIT = 10;
export const NANO_SECONDS = 20;
/** Holes a hull keeps at most (four hits from behind); the oldest has vented long since and goes first. */
const MAX_HOLES = 8;
/** Venting from a hole fades with this time constant (s): the compartment runs out of air. */
const VENT_TIME = 2.5;
/** Push of the escaping air right after the hit (units/s²). */
const VENT_THRUST = 120;
/** Spin the escaping air causes per unit of lever arm (rad/s²); it acts off-center, so the ship tumbles. */
const VENT_SPIN = 6;
/** Rotation kick of the explosive decompression at the moment of the hit (rad/s). */
const DECOMPRESSION_KICK = 1.2;
/** The exit hole tears wider than the entry hole and vents more. */
const ENTRY_HOLE = 0.4;
const EXIT_HOLE = 1;

/** Name, type, score, kills and deaths travel at least this often (s), even unchanged. */
const SLOW_STATE_SECONDS = 1;

/** A ship with a nova core pulses this often (Hz). */
const NOVA_PULSE = 2;
/** Freshly spawned ships cannot be damaged for this long (s), long enough to get the bearings; firing ends it early. */
const SPAWN_PROTECTION = 5;

/** The laser heats the ship; radiators shed the heat, much better in the shadow of an asteroid. */
export const MAX_HEAT = 100;
const HEAT_PER_SHOT = 20;
export const COOLING_SUN = 20;
export const COOLING_SHADOW = 50;
/** An overheated laser stays locked until the ship has cooled down to this. */
const OVERHEAT_RESUME = 30;
/**
 * The radiators glow with the heat they shed (see models' radiator): from RADIATOR_GLOW of the
 * laser's limit on, dull red, deepening to orange-red at the limit, as hot metal does. The metal
 * follows the heat over RADIATOR_LAG seconds, so a shot's heat warms it instead of flashing it.
 */
const RADIATOR_GLOW = 0.25;
const RADIATOR_LAG = 0.4;
/** Minimum time between two shots (s), so a full bank fires as a quick burst. */
const LASER_COOLDOWN = 0.18;

/** One standard gravity in units/s² (1 unit = 5 cm). */
export const G = 9.81 / METERS_PER_UNIT;
/**
 * The clone's body under g: above G_TOLERANCE (g) of its own engines' push it starts to grey
 * out; at the main drive's full push (13 g) it takes G_ONSET seconds to full strain, and below
 * the tolerance it recovers from full strain in G_RECOVERY seconds. Every clone alike, a Host's
 * and a bot's: a Host's screen darkens at its edges, a bot aims wider and reacts later (see
 * ship/bots).
 */
const G_TOLERANCE = 3;
const G_ONSET = 5;
const G_RECOVERY = 3;

/** A clone's strain (0..1) after `dt` seconds under a push of `acceleration` (units/s²) from its own engines. */
export function strainAfter(strain: number, acceleration: number, dt: number): number {
  const load = acceleration / G;
  const next = load > G_TOLERANCE ? strain + ((load - G_TOLERANCE) / (MAIN_THRUST / G - G_TOLERANCE)) * (dt / G_ONSET) : strain - dt / G_RECOVERY;
  return THREE.MathUtils.clamp(next, 0, 1);
}

/** Ships farther away than this never show as having their nose on another (units, 3 km): the sensors' reach for a lock warning. */
export const LOCK_RANGE = 60000;
/**
 * Silent running: a ship whose drive has not burned (its flame above SILENT_THROTTLE) and which
 * has not fired for SILENT_AFTER seconds shows no heat the sensors pick up from afar. The radar,
 * the HUD's marks, a torpedo's lock and the bots find it only within SILENT_RANGE (units, 1 km;
 * the radar reaches 2.5 km, a lock 3 km); the eye still sees it where nothing hides it.
 */
export const SILENT_AFTER = 2;
export const SILENT_THROTTLE = 0.05;
export const SILENT_RANGE = 20000;

/** Whether the sensors at `from` find `ship` (its line of sight is the caller's): always within SILENT_RANGE, beyond it only while it does not run silent. */
export function detectable(ship: Ship, from: THREE.Vector3, now: number): boolean {
  return !ship.silent(now) || ship.flight.position.distanceTo(from) <= SILENT_RANGE;
}
/** A nose within this many times the other ship's angular radius counts as TRACKED. */
const LOCK_TRACKING = 4;

/**
 * How a ship's nose lies on another ship (`at`, of hit radius `radius`), as the sensors of the
 * other one see it: 2 when its laser would hit now (LOCKED), 1 when the nose is close (TRACKED),
 * 0 otherwise or beyond LOCK_RANGE. Line of sight is the caller's to check. The own lock warning
 * and the bots' sense of a ship on their tail read the same.
 */
export function noseOn(shooter: FlightModel, at: THREE.Vector3, radius: number): 0 | 1 | 2 {
  const line = local.subVectors(at, shooter.position);
  const distance = line.length();
  if (distance > LOCK_RANGE) return 0;
  const angle = shooter.noseAngleTo(line);
  const size = radius / Math.max(distance, 1);
  return angle < size ? 2 : angle < size * LOCK_TRACKING ? 1 : 0;
}

/** Reach of the laser (units, 10 km), far beyond the arena; also the length of the rays that find the shadow of the rocks. */
export const LASER_RANGE = 200000;

/** The first hull on a line (see firstHull), kept: the laser asks once a shot. */
const lineHit = { ship: null as Ship | null, distance: 0 };

/**
 * The first hull a line from `origin` along `direction` (unit length) strikes within `reach`:
 * the living ship whose hit sphere it enters first, `from` left out, and how
 * far along; null for none. A laser's beam ends there, whichever side the ship is on.
 */
export function firstHull(ships: readonly Ship[], from: Ship, origin: THREE.Vector3, direction: THREE.Vector3, reach: number): Readonly<typeof lineHit> | null {
  lineHit.ship = null;
  lineHit.distance = reach;
  for (const ship of ships) {
    if (ship === from || !ship.alive) continue;
    const distance = raySphere(origin, direction, ship.flight.position, ship.radius);
    if (distance === null || distance > lineHit.distance) continue;
    lineHit.ship = ship;
    lineHit.distance = distance;
  }
  return lineHit.ship ? lineHit : null;
}

/** The engine flame slides this far (model units) into the hull at zero thrust. */
const FLAME_RETRACT = 16;
const GLOW_MAX_SCALE = 3;
/** Brightness of the drive glow at idle, as a share of full thrust. */
const GLOW_IDLE = 0.25;
/** The drive light sits this far behind the ship's center (units, 20 m), where the exhaust glows. */
const ENGINE_LIGHT_OFFSET = 400;
/** The drive flame's tint by the steps of its upgrade: stock, azure, violet, white-hot. */
const FLAME_TINTS = [new THREE.Color(1, 1, 1), new THREE.Color(0.45, 0.75, 1.6), new THREE.Color(1.1, 0.45, 1.6), new THREE.Color(2, 2, 2.2)];
/**
 * The neon trim's light strips (see ship/models) in sun orange, by the steps of its upgrade: the
 * flanks lit, then brighter with the stern bar, then brighter still with a running light.
 */
const TRIM_COLOR = new THREE.Color(0xff9d00);
/** Kept low enough that the tube's core stays orange instead of burning out to white; from the second step it blooms. */
const TRIM_BRIGHTNESS = [0, 0.8, 1.25, 1.5];
/** The running light: pulses on a strip at once, and how many strips' lengths they travel per second. */
const TRIM_PULSES = 2;
const TRIM_RUN = 0.5;
/** Each hull's maneuvering thrusters (see ship/thrusters), where models.ts puts them. */
const THRUSTERS: Record<ShipType, Thrusters> = {
  human: thrustersOf(THRUSTER_LAYOUTS.human),
  alien: thrustersOf(THRUSTER_LAYOUTS.alien),
  sovereign: thrustersOf(THRUSTER_LAYOUTS.sovereign),
  // the campaign's scrap hull is the human interceptor's, thrusters and all
  magpie: thrustersOf(THRUSTER_LAYOUTS.human),
};
/** How fast a nozzle's puff follows its firing (1/s): there at once, gone a little slower, so a flight computer's quick corrections do not flicker. */
const JET_RISE = 40;
const JET_FALL = 14;
/** How long the dodge's kick fires its nozzles at full push (s). */
const JET_KICK = 0.15;
/**
 * Another browser's ship: the push and turn of its thrusters read from how its velocity and spin
 * changed between two states (see applyState), what pulls and brakes it from outside taken out
 * (see `pull`), shown only above these shares of their full push and turn, so the pull of a rock
 * or the network's rounding does not fire them. Ignored after
 * this long without a state (s).
 */
const REMOTE_PUSH_FLOOR = 0.3;
const REMOTE_TURN_FLOOR = 0.2;
const REMOTE_JETS_HOLD = 0.3;
const firingNow = new Float32Array(NOZZLES);
const jetPush = new THREE.Vector3();

export type Zone = 'reactor' | 'drive' | 'thrusters' | 'armor';
type DamageStatus ='protected' | 'hit' | 'destroyed';

interface EngineParts {
  flame: THREE.Mesh | null;
  flameMaterial: THREE.MeshBasicMaterial | null;
  flameZ: number;
  glows: THREE.Object3D[];
  glowMaterial: THREE.MeshBasicMaterial;
}

interface Hole {
  /** Position in ship space. */
  point: THREE.Vector3;
  /** Direction the air escapes, in ship space. */
  vent: THREE.Vector3;
  size: number;
  at: number;
}

/**
 * A ship as it travels over the network; short keys keep the 15 Hz updates small. Name, type,
 * score, kills, deaths and race progress change rarely: they come along when they changed, at
 * least once a second, and in every state right after a newcomer arrived (see Ship.toState);
 * a state carries all of them or none.
 */
export type ShipState = {
  id: string;
  /** name and ship type */
  n?: string;
  k?: ShipType;
  /** position, velocity, orientation (quaternion), rotation rate in ship space */
  p: number[];
  v: number[];
  q: number[];
  w: number[];
  /** visible drive output */
  th: number;
  a: boolean;
  /** hull, drive and thruster health */
  h: number;
  dr: number;
  tr: number;
  /** score, kills, deaths */
  s?: number;
  ki?: number;
  de?: number;
  /** gates passed in a race, and the second of the round it finished (-1 while racing) */
  g?: number;
  fi?: number;
  /** items held (see packItems) */
  it?: number;
  /** the looks of its upgrades and its radiators' step (see packLooks) */
  lo?: number;
  /** the tint its Host chose, an index into TINTS (see Ship.wish) */
  co?: number;
  /** torpedoes left to its clone: a lead that adopts a bot flies it on with them (see adopt) */
  to?: number;
  /** remaining spawn protection (s) */
  pr: number;
};

const force = new THREE.Vector3();
const torque = new THREE.Vector3();
const inverse = new THREE.Quaternion();
const local = new THREE.Vector3();
const offset = new THREE.Vector3();
const spinStep = new THREE.Quaternion();

/** Both ship types share one hit radius, so the skin makes no difference in combat. */
function sharedRadius(assets: Assets): number {
  return Math.max(colliderRadius(assets.ships.human), colliderRadius(assets.ships.alien)) * 0.8;
}

export class Ship {
  readonly flight = new FlightModel();
  /** The ship as a body on a rope or in a bump (see world/bodies): its flight, and an interceptor's mass. */
  readonly body: Body = { position: this.flight.position, velocity: this.flight.velocity, mass: MASS.ship };
  /** Where the ship was before this frame's move, for the swept collision test. */
  readonly previous = new THREE.Vector3();
  /** Where the drive's exhaust was laid last frame, and whether the drive was burning then. */
  readonly trailFrom = new THREE.Vector3();
  trailing = false;
  /** Its maneuvering thrusters, and how hard each nozzle puffs now (0..1, eased, see fireJets). */
  readonly nozzles: Thrusters;
  readonly jets = new Float32Array(NOZZLES);
  /** The dodge's kick in ship space, and how long its nozzles still fire (s). */
  private readonly kick = new THREE.Vector3();
  private kickLeft = 0;
  /**
   * Who flies the ship, read from its id, which no Host can choose: a bot, a real Host, or
   * nobody (the flight school's target drone). The HUD marks names with it (see view/marks).
   */
  get kind(): 'bot' | 'host' | null {
    if (this.id === 'drone') return null;
    return /^(?:bot\d+|b:|sparring$)/.test(this.id) ? 'bot' : 'host';
  }

  /**
   * Another ship on the same side: bots never hunt it, the seeker never locks on it, a kill of it
   * costs points (see game/friendly). Lasers, torpedoes and novas hurt it as any other.
   */
  allyOf(other: Ship) {
    return other !== this && this.team >= 0 && other.team === this.team;
  }

  readonly root = new THREE.Group();
  readonly model: THREE.Object3D;
  readonly radius: number;
  /** The color of its laser: its tint (see setTint). */
  readonly color = new THREE.Color();
  /** What it is marked in (CSS color, see tints.ts): a Host's tint as the round assigns it, a bot's own, the Sovereign's ivory. */
  tint = '';
  /** The tint its Host chose, an index into TINTS; two Hosts who chose the same one are told apart by assignTints. */
  wish = TINTS.length - 1;
  /** Laser holes; they vent air for a few seconds and spark until the ship respawns. */
  readonly holes: Hole[] = [];
  /** Push and spin from venting air, in ship space, applied in the next update. */
  private readonly ventForce = new THREE.Vector3();
  private readonly ventSpin = new THREE.Vector3();
  /** The turn the air forces on the ship where it lacks a fin (rad/s², pitch, yaw, roll; see world/air, finSpin); zero out of air. */
  readonly finSpin = new THREE.Vector3();

  hull = MAX_HULL;
  /** Torpedoes left (see game/torpedoes); every clone comes with a full load. */
  torpedoes = TORPEDOES;
  /** Torpedoes this ship fired with this clone and before, for their ids. */
  torpedoesFired = 0;
  /** Items the clone holds (see game/items): a twin laser, and plating charges left. */
  twin = false;
  plating = 0;
  /** The clone holds a nova core: it pulses for everyone to see (see pulse). */
  nova = false;
  /** Decoys the clone holds (see game/decoys): lures a torpedo homing on it turns to. */
  decoys = 0;
  private readonly aura: THREE.Sprite;
  /** Health of the main drive and of the maneuvering thrusters, 0..1. */
  drive = 1;
  thrusters = 1;
  /** What the ship's upgrades make of it (see game/hangar and outfit); stock for bots and other browsers' ships. */
  perks: Perks = STOCK;
  /** The neon trim's light strips and their light, the ship's own (see outfit). */
  private readonly trim: { strips: THREE.Object3D; stern: THREE.Object3D; light: THREE.MeshBasicMaterial; running: THREE.Texture };
  heat = 0;
  overheated = false;
  /** When it last burned its drive or fired (game time, s), as every browser sees it: since SILENT_AFTER it runs silent (see silent). */
  loudAt = -Infinity;
  /** The radiators' skin and how hot it glows, 0..1 of the laser's limit (see radiate). */
  private readonly radiators: THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>;
  private glow = 0;
  /** The clone's g-force strain, 0..1 (see strainAfter); a coil, a dodge or the overdrive add to it at once. */
  strain = 0;
  /** Game time until which the main drive cools down after an overdrive. */
  private driveOfflineUntil = 0;
  /** Shots fired, so the muzzles alternate per ship. */
  private shots = 0;
  /** The rarely changing part of the state as last sent, and when (see toState). */
  private slowSent = '';
  private slowSentAt = -Infinity;
  /** Set by the game: an asteroid blocks the sun, or the clouds above it in a planet's air. */
  inShadow = false;
  /** Set by the game: how well the radiators shed heat in sunlight in this arena (the sun's glare: less). */
  sunCooling = 1;
  /** Whether the nanobots are mending the drive and the thrusters now (see nanobots); when they were last hurt, and what they were last step. */
  mending = false;
  private hurtAt = -Infinity;
  private driveBefore = 1;
  private thrustersBefore = 1;
  /** How far a planet's clouds have clogged the radiators, 0 clean to 1 through (see world/air, clogging); kept by the browser that runs the ship. */
  clog = 0;

  /** How much heat the radiators shed per second where the ship is now (heat units/s, MAX_HEAT the laser's limit), less as far as they are clogged. */
  get cooling() {
    return (this.inShadow ? COOLING_SHADOW : COOLING_SUN * this.sunCooling) * this.perks.cooling * (1 - CLOG_LOSS * this.clog);
  }
  alive = true;
  score = 0;
  kills = 0;
  deaths = 0;
  /** Gates passed in a race, and the second of the round it crossed the finish (-1 while it races). */
  gates = 0;
  finish = -1;
  /** The lap in which it left a gate out, its one skip of that lap (see canSkip in game/race; -1 before any); kept by the browser that runs it. */
  skipLap = -1;
  respawnAt = 0;
  protectedUntil = 0;
  /** The ship that shoved this one last (a ram, a kick into its side), and when (game time): its crash soon after is that ship's knockout. */
  shovedBy: Ship | null = null;
  shovedAt = -Infinity;
  /** Time the ship left the arena, or null while inside. */
  outsideSince: number | null = null;
  /** The ship's side, set by the game in a round of teams (see game/flags); -1 when every clone fights for itself. */
  team = -1;
  /** Peer that simulates this ship in an online tournament; null when this browser does. */
  owner: string | null = null;
  /** The drive's light on nearby rocks, lent by the game from a fixed pool (see Game.lendLight). */
  engineLight: THREE.PointLight | null = null;
  /**
   * How far the last step set this browser's prediction of a ship another peer simulates right
   * (units), beyond its flight: a cable to it takes that jump as no cut (see Cable.follow). 0 for
   * a ship this browser runs.
   */
  corrected = 0;

  /**
   * What pulls and brakes a ship another peer simulates from outside where it is (units/s²: the
   * field's gravity, an air's drag), set by the game every frame, so the push its thrusters are
   * read with leaves it out (see readThrusters).
   */
  readonly pull = new THREE.Vector3();
  /** Last state received for a ship another peer simulates, and when it arrived. */
  private readonly remote = {
    position: new THREE.Vector3(),
    velocity: new THREE.Vector3(),
    orientation: new THREE.Quaternion(),
    spin: new THREE.Vector3(),
    at: 0,
    /** whether the owner reported a living clone; `alive` also goes false while the owner is silent */
    alive: false,
  };

  /** Whether the clone died: for a ship another peer simulates only once its owner said so, not while the owner is silent. */
  get died(): boolean {
    return !this.alive && (this.owner === null || !this.remote.alive);
  }
  private lastShotAt = -Infinity;
  /**
   * Fire held from before is ignored until it is let go: a fresh clone does not shoot (and end
   * its spawn protection) because fire is still down, and a nova core goes off on the next press.
   */
  private triggerHeld = false;
  private readonly engine: EngineParts;
  private flameTime = 0;
  private readonly frames: THREE.Texture[];

  constructor(
    readonly id: string,
    public name: string,
    readonly type: ShipType,
    assets: Assets,
    readonly isLocal: boolean,
  ) {
    this.model = assets.ships[type].clone(true);
    this.nozzles = THRUSTERS[type];
    // Materials are shared between clones; the engine flame and the trim's light animate their own copies.
    const light = new THREE.MeshBasicMaterial({ toneMapped: false });
    this.model.traverse((o) => {
      if (!(o instanceof THREE.Mesh)) return;
      if (o.name.toLowerCase().startsWith('drive')) o.material = (o.material as THREE.Material).clone();
      if (o.name === 'trimLight') o.material = light;
      if (o.name === 'radiator') o.material = (o.material as THREE.Material).clone();
      o.castShadow = o.receiveShadow = !(o.material as THREE.Material).transparent;
    });
    const running = runningLight().clone();
    running.repeat.x = TRIM_PULSES;
    this.trim = { strips: this.model.getObjectByName('trim')!, stern: this.model.getObjectByName('trimStern')!, light, running };
    this.radiators = this.model.getObjectByName('radiator') as THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>;
    this.radius = sharedRadius(assets);
    this.frames = assets.textures.flameFrames;
    this.setTint(this.kind === 'host' ? TINTS[this.wish].hex : botTint(name));
    this.root.add(this.model);
    this.engine = this.findEngine(assets.textures.glow);
    this.root.name = 'ship:' + id;
    this.aura = new THREE.Sprite(new THREE.SpriteMaterial({ map: assets.textures.glow, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, toneMapped: false }));
    this.aura.visible = false;
    this.root.add(this.aura);
  }

  /** The Sovereign, the President's gift: marked in its own ivory and gold, which no Host can pick. */
  get sovereign() {
    return this.type === 'sovereign';
  }

  /** Marks the ship in a tint (a Host's in the round, see Game.tintShips); the Sovereign always wears its ivory. */
  setTint(hex: string) {
    const tint = this.sovereign ? SOVEREIGN_TINT : hex;
    if (tint === this.tint) return;
    this.tint = tint;
    this.color.set(tint);
  }

  /**
   * Fits the ship with its upgrades: how it flies and fights (read where they act), its neon
   * trim (TRIM_BRIGHTNESS: light strips along both flanks, then across the stern too, then with a
   * running light towards the drives) and its drive flame's color.
   */
  outfit(perks: Perks) {
    this.perks = perks;
    // Pim's welds, on the one hull that carries them (see models, welds)
    const patches = this.model.getObjectByName('patches');
    if (patches) patches.visible = perks.patched;
    // the scout's old livery under the depot's grey, once Pim has ground it off (see models, oldLivery)
    const livery = this.model.getObjectByName('livery');
    if (livery) livery.visible = perks.stripped;
    // the armor panels welded over the bare left flank, once fitted (see models, flankPanels)
    const panels = this.model.getObjectByName('panels');
    if (panels) panels.visible = !perks.bareFlank;
    if (this.engine.flameMaterial) this.engine.flameMaterial.color.copy(FLAME_TINTS[perks.flame]);
    const { strips, stern, light } = this.trim;
    strips.visible = perks.neon > 0;
    stern.visible = perks.neon > 1;
    light.color.copy(TRIM_COLOR).multiplyScalar(TRIM_BRIGHTNESS[perks.neon]);
    const map = perks.neon > 2 ? this.trim.running : null;
    if (light.map !== map) {
      light.map = map;
      light.needsUpdate = true;
    }
  }

  /** The drive burning at a throttle without flying anywhere, for a ship on show (see view/showcase). */
  idle(dt: number, throttle: number) {
    this.flight.throttle = throttle;
    this.animateEngine(dt);
  }

  /** The glow of a nova core: it pulses and runs through every color, so everyone sees who holds it. */
  pulse(now: number) {
    this.aura.visible = this.nova && this.alive;
    if (!this.aura.visible) return;
    const beat = 0.5 + 0.5 * sin(now * NOVA_PULSE * Math.PI * 2);
    this.aura.scale.setScalar(this.radius * (5 + 3 * beat));
    this.aura.material.color.setHSL((now * 0.4) % 1, 1, 0.5).multiplyScalar(1.5 + 2 * beat);
  }

  private findEngine(glowTexture: THREE.Texture): EngineParts {
    let flame: THREE.Mesh | null = null;
    const glows: THREE.Object3D[] = [];
    this.model.traverse((o) => {
      const name = o.name.toLowerCase();
      if (name.startsWith('drive') && o instanceof THREE.Mesh) flame = o;
      if (name.includes('glow')) glows.push(o);
    });
    // The glow texture is baked onto black, so additive blending leaves no visible quad edges.
    const glowMaterial = new THREE.MeshBasicMaterial({
      map: glowTexture,
      blending: THREE.AdditiveBlending,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    for (const glow of glows) if (glow instanceof THREE.Mesh) glow.material = glowMaterial;
    const flameMesh = flame as THREE.Mesh | null;
    return {
      flame: flameMesh,
      flameMaterial: flameMesh ? (flameMesh.material as THREE.MeshBasicMaterial) : null,
      flameZ: flameMesh ? flameMesh.position.z : 0,
      glows,
      glowMaterial,
    };
  }

  spawn(position: THREE.Vector3, orientation: THREE.Quaternion, now: number) {
    this.trailing = false;
    this.jets.fill(0);
    this.kickLeft = 0;
    this.protectedUntil = now + SPAWN_PROTECTION;
    // a fresh clone's ship is warm from the printer's bay
    this.loudAt = now;
    this.flight.reset(position, orientation);
    // the move to the spawn point is no flight: collisions and gates do not sweep along it
    this.previous.copy(position);
    this.holdTrigger();
    this.repair();
    this.torpedoes = TORPEDOES + this.perks.torpedoes;
    this.twin = false;
    this.plating = 0;
    this.nova = false;
    this.decoys = 0;
    this.heat = 0;
    this.clog = 0;
    this.mending = false;
    this.hurtAt = -Infinity;
    this.driveBefore = this.thrustersBefore = 1;
    this.glow = 0;
    this.overheated = false;
    this.strain = 0;
    this.driveOfflineUntil = 0;
    this.shovedBy = null;
    this.alive = true;
    this.outsideSince = null;
    this.root.visible = true;
    this.syncTransform();
  }

  /** Ignores fire until it is let go (see triggerHeld). */
  holdTrigger() {
    this.triggerHeld = true;
  }

  /** Whether fire is ignored until the trigger is let go (a fresh clone's, a nova core just taken: see holdTrigger). */
  get mustRelease(): boolean {
    return this.triggerHeld;
  }

  /**
   * Takes over a ship another peer ran, as its last state left it (moved on by its velocity):
   * score, kills, deaths, damage, the torpedoes its clone has left (up to a fresh load) and whether its clone lives.
   * A new lead browser adopts the bots of the one before it this way.
   */
  adopt(from: Ship, now: number) {
    const r = from.remote;
    this.flight.reset(local.copy(r.position).addScaledVector(r.velocity, Math.max(0, now - r.at)), r.orientation);
    this.flight.velocity.copy(r.velocity);
    this.flight.angularVelocity.copy(r.spin);
    this.hull = from.hull;
    this.drive = from.drive;
    this.thrusters = from.thrusters;
    this.protectedUntil = from.protectedUntil;
    this.score = from.score;
    this.kills = from.kills;
    this.deaths = from.deaths;
    this.twin = from.twin;
    this.plating = from.plating;
    this.nova = from.nova;
    // no more than a fresh clone's load: to the other browsers it is a ship never seen, and
    // they count its launches against that load (see Plausibility.torpedo)
    this.torpedoes = Math.min(from.torpedoes, ONLINE_LOAD);
    this.gates = from.gates;
    this.finish = from.finish;
    this.alive = r.alive;
    this.root.visible = r.alive;
    this.syncTransform();
  }

  /**
   * The ship's state as it travels over the network; `full` adds name, type, score, kills
   * and deaths, which otherwise come along only when they changed or a second has passed.
   */
  toState(now: number, full = false): ShipState {
    const f = this.flight;
    const round = (v: { toArray(): number[] }, digits = 0) => v.toArray().map((x) => +x.toFixed(digits));
    const items = packItems(this.twin, this.plating, this.nova, this.decoys);
    const slow = `${this.name}|${this.type}|${this.score}|${this.kills}|${this.deaths}|${this.gates}|${this.finish}|${items}|${this.wish}|${this.torpedoes}`;
    const withSlow = full || slow !== this.slowSent || now - this.slowSentAt >= SLOW_STATE_SECONDS;
    if (withSlow) {
      this.slowSent = slow;
      this.slowSentAt = now;
    }
    return {
      id: this.id,
      ...(withSlow ? { n: this.name, k: this.type, s: this.score, ki: this.kills, de: this.deaths, g: this.gates, fi: this.finish, it: items, lo: packLooks(this.perks), co: this.wish, to: this.torpedoes } : {}),
      p: round(f.position),
      v: round(f.velocity, 1),
      q: round(f.orientation, 4),
      w: round(f.angularVelocity, 3),
      th: +f.throttle.toFixed(2),
      a: this.alive,
      h: Math.round(this.hull),
      dr: +this.drive.toFixed(2),
      tr: +this.thrusters.toFixed(2),
      pr:+Math.max(0, this.protectedUntil - now).toFixed(1),
    };
  }

  /** Takes over the state another peer sent for its ship. */
  applyState(state: ShipState, now: number) {
    const r = this.remote;
    this.readThrusters(state, now - r.at);
    r.position.fromArray(state.p);
    r.velocity.fromArray(state.v);
    r.orientation.fromArray(state.q).normalize();
    r.spin.fromArray(state.w);
    r.at = now;
    r.alive = state.a;
    this.flight.velocity.copy(r.velocity);
    this.flight.throttle = state.th;
    // its flame seen: loud (see silent)
    if (state.th > SILENT_THROTTLE) this.loudAt = now;
    this.hull = state.h;
    this.drive = state.dr;
    this.thrusters = state.tr;
    this.protectedUntil = now + state.pr;
    if (state.n !== undefined) {
      this.name = state.n;
      this.score = state.s!;
      this.kills = state.ki!;
      this.deaths = state.de!;
      this.gates = state.g!;
      this.finish = state.fi!;
      ({ twin: this.twin, plating: this.plating, nova: this.nova, decoys: this.decoys } = unpackItems(state.it!));
      // another browser's ship shows the looks of its upgrades and heats in the air with its
      // radiators; how it flies is that browser's
      if (state.lo !== packLooks(this.perks)) this.outfit(unpackLooks(state.lo!));
      // the tint it chose; which one it flies in, the round decides (see Game.tintShips)
      this.wish = state.co!;
      this.torpedoes = state.to!;
    }
    if (state.a && !this.alive) {
      // the owner booted a new clone
      this.alive = true;
      this.heat = 0;
      this.glow = 0;
      this.holes.length = 0;
      this.root.visible = true;
      this.flight.position.copy(r.position);
      this.flight.orientation.copy(r.orientation);
    } else if (!state.a && this.alive) {
      this.alive = false;
      this.root.visible = false;
    }
  }

  /**
   * Another browser's ship, as far as its states show it: its thrusters' push (what changed its
   * velocity besides the drive along the nose and the pull from outside) and turn (what changed its spin) over the `dt`
   * since the last state, as shares of their full push and turn, into its flight's rcs and
   * turnThrust for the puffs (see fireJets). A fresh clone or a long gap shows nothing.
   */
  private readThrusters(state: ShipState, dt: number) {
    const f = this.flight;
    f.rcs.set(0, 0, 0);
    f.turnThrust.set(0, 0, 0);
    if (!this.alive || !state.a || dt < 0.01 || dt > REMOTE_JETS_HOLD) return;
    const r = this.remote;
    f.toLocalDirection(jetPush.fromArray(state.v).sub(r.velocity).divideScalar(dt).sub(this.pull), f.rcs);
    f.rcs.z += MAIN_THRUST * state.th;
    f.rcs.divideScalar(RCS_THRUST);
    if (f.rcs.length() < REMOTE_PUSH_FLOOR) f.rcs.set(0, 0, 0);
    f.rcs.clampLength(0, 1);
    jetPush.fromArray(state.w).sub(r.spin).divideScalar(dt * TURN_ACCELERATION);
    for (let k = 0; k < 3; k++) {
      const share = jetPush.getComponent(k);
      f.turnThrust.setComponent(k, Math.abs(share) < REMOTE_TURN_FLOOR ? 0 : THREE.MathUtils.clamp(share, -1, 1));
    }
  }

  /** The dodge's kick (see Game.thrusterKick) in ship space: its nozzles fire at full push for a moment. */
  kickJets(direction: THREE.Vector3) {
    this.kick.copy(direction).normalize();
    this.kickLeft = JET_KICK;
  }

  /**
   * Eases each nozzle's puff towards how hard it fires for the flight's thruster push and turn
   * (see ship/thrusters), the dodge's kick on top. Another browser's ship holds what its last
   * state showed only for a moment. Only looks: the flight model reckons with push and turn.
   */
  fireJets(dt: number, now: number) {
    const f = this.flight;
    if (this.owner !== null && now - this.remote.at > REMOTE_JETS_HOLD) {
      f.rcs.set(0, 0, 0);
      f.turnThrust.set(0, 0, 0);
    }
    jetPush.copy(f.rcs);
    if (this.kickLeft > 0) {
      this.kickLeft -= dt;
      jetPush.add(this.kick).clampLength(0, 1);
    }
    firing(this.nozzles, jetPush, f.turnThrust, firingNow);
    for (let i = 0; i < NOZZLES; i++) {
      const target = this.alive ? firingNow[i] : 0;
      this.jets[i] += (target - this.jets[i]) * (1 - exp(-(target > this.jets[i] ? JET_RISE : JET_FALL) * dt));
    }
  }

  /**
   * Moves a ship another peer simulates: Newtonian prediction from the last state (a ship
   * without thrust flies straight on), blended in smoothly so corrections do not jump.
   */
  updateRemote(dt: number, now: number) {
    if (!this.alive) {
      if (this.engineLight) this.engineLight.intensity = 0;
      return;
    }
    this.heat = Math.max(0, this.heat - this.cooling * dt);
    const r = this.remote;
    const age = Math.min(now - r.at, 1);
    local.copy(r.position).addScaledVector(r.velocity, age);
    const blend = 1 - exp(-12 * dt);
    const spin = r.spin.length();
    // the shown ship moves and turns on as predicted first, and the blend only takes out the
    // correction; so it is drawn where the prediction says, not a stretch of travel behind
    this.flight.position.addScaledVector(r.velocity, dt);
    if (spin > 1e-6) this.flight.orientation.multiply(setFromAxisAngle(spinStep, offset.copy(r.spin).divideScalar(spin), spin * dt));
    const gap = this.flight.position.distanceTo(local);
    if (gap > 4000) this.flight.position.copy(local);
    else this.flight.position.lerp(local, blend);
    this.corrected = gap > 4000 ? gap : gap * blend;
    inverse.copy(r.orientation);
    if (spin > 1e-6) inverse.multiply(setFromAxisAngle(spinStep, offset.copy(r.spin).divideScalar(spin), spin * age));
    slerp(this.flight.orientation, inverse, blend);
    this.show(dt, now);
  }

  /** Shows the ship where it flies now, blinking while spawn protection is active, its drive burning. */
  private show(dt: number, now: number) {
    this.model.visible = now >= this.protectedUntil || Math.floor(now * 8) % 2 === 0;
    this.syncTransform();
    this.animateEngine(dt);
    this.radiate(dt);
  }

  /** The radiators glow as hot as the ship is (see RADIATOR_GLOW): dull red, then orange-red; unseen while cool. */
  private radiate(dt: number) {
    this.glow += (this.heat / MAX_HEAT - this.glow) * (1 - exp(-dt / RADIATOR_LAG));
    const t = THREE.MathUtils.smoothstep(this.glow, RADIATOR_GLOW, 1);
    this.radiators.visible = t > 0.01;
    if (this.radiators.visible) this.radiators.material.color.setRGB(0.95 * pow(t, 1.5), 0.22 * t * t * t, 0.03 * pow(t, 5));
  }

  /**
   * A ship another browser runs fired a shot: its laser's heat, as far as this browser can tell,
   * for its radiators' glow; that browser keeps the real heat.
   */
  warm() {
    this.heat = Math.min(MAX_HEAT, this.heat + HEAT_PER_SHOT / (this.twin ? 2 : 1));
  }

  /** Advances flight and laser; returns true when the ship fires this frame. */
  update(dt: number, now: number, controls: Controls, gravity: THREE.Vector3): boolean {
    if (!this.alive) {
      if (this.engineLight) this.engineLight.intensity = 0;
      return false;
    }
    this.previous.copy(this.flight.position);
    this.flight.driveFactor = this.driveOffline(now) ? 0 : this.drive * this.perks.drive;
    this.flight.thrusterFactor = (0.25 + 0.75 * this.thrusters) * this.perks.thrusters;
    this.vent(now);
    this.flight.update(dt, controls, gravity, this.ventForce, this.ventSpin);
    // a burning drive is loud (see silent)
    if (this.flight.throttle > SILENT_THROTTLE) this.loudAt = now;
    this.strain = strainAfter(this.strain, this.flight.properAcceleration, dt);
    this.show(dt, now);
    this.nanobots(dt, now);

    this.heat = Math.max(0, this.heat - this.cooling * dt);
    if (this.overheated && this.heat <= OVERHEAT_RESUME) this.overheated = false;
    // a twin laser (an item) fires twice as fast at half the heat per shot
    const twin = this.twin ? 2 : 1;
    if (!controls.fire) this.triggerHeld = false;
    // a hull without a laser (the campaign's scrap) fires nothing
    if (controls.fire && this.perks.laser && !this.triggerHeld && !this.overheated && now - this.lastShotAt >= LASER_COOLDOWN / twin) {
      this.heat += (HEAT_PER_SHOT * this.perks.laserHeat) / twin;
      if (this.heat >= MAX_HEAT) this.overheated = true;
      // a held trigger keeps the cadence exactly, however the steps fall: a shot that was due
      // within this step counts from when it was due; a fresh press counts from now, so tapping
      // never beats the cooldown
      const due = this.lastShotAt + LASER_COOLDOWN / twin;
      this.lastShotAt = now - due < dt ? due : now;
      return true;
    }
    return false;
  }

  /**
   * The nanobots (see NANO_WAIT), gear bought in the hangar (Perks.nanobots; stock ships, the
   * bots' too, carry none): once nothing has hurt the drive or the thrusters for NANO_WAIT
   * seconds, they mend both back to whole in NANO_SECONDS; a new blow stops them and the wait
   * begins again. The hull they leave alone: it is the clone's life. Run by the browser that
   * flies the ship, so the others see the mended parts in its state.
   */
  private nanobots(dt: number, now: number) {
    if (!this.perks.nanobots) return;
    if (this.drive < this.driveBefore || this.thrusters < this.thrustersBefore) this.hurtAt = now;
    this.mending = now - this.hurtAt >= NANO_WAIT && (this.drive < 1 || this.thrusters < 1);
    if (this.mending) {
      this.drive = Math.min(1, this.drive + dt / NANO_SECONDS);
      this.thrusters = Math.min(1, this.thrusters + dt / NANO_SECONDS);
    }
    this.driveBefore = this.drive;
    this.thrustersBefore = this.thrusters;
  }

  /** Strength of a hole's venting, 1 right after the hit, fading to 0. */
  ventStrength(hole: Hole, now: number) {
    return hole.size * exp(-(now - hole.at) / VENT_TIME);
  }

  private vent(now: number) {
    this.ventForce.set(0, 0, 0);
    // the air's pull on a hull short of a fin (set by the game where there is air, see world/air, finSpin)
    this.ventSpin.copy(this.finSpin);
    for (const hole of this.holes) {
      const strength = this.ventStrength(hole, now);
      if (strength < 0.01) continue;
      // the air rushes out one way, the ship is pushed the other way
      force.copy(hole.vent).multiplyScalar(-strength);
      this.ventForce.addScaledVector(force, VENT_THRUST);
      torque.copy(hole.point).divideScalar(this.radius).cross(force);
      this.ventSpin.addScaledVector(torque, VENT_SPIN);
    }
  }

  /**
   * A laser beam passes through the ship. The point where it comes closest to the center
   * decides which part it destroys; entry and exit leave holes. `weight` scales what it costs
   * armor, thrusters and drive (a comet's shower strikes harder than a beam).
   */
  laserHit(origin: THREE.Vector3, direction: THREE.Vector3, now: number, weight = 1): { status: DamageStatus; zone: Zone } {
    if (!this.alive || now < this.protectedUntil) return { status: 'protected', zone: 'armor' };
    if (!this.tailToward(direction)) {
      // the armor takes it: a scorch mark and a few points, no hole; a beam into the flanks,
      // more than 45° off the ship's axis, also shakes the maneuvering thrusters
      this.flight.toLocalDirection(direction, local);
      const flank = hypot(local.x, local.y) > Math.abs(local.z);
      if (flank) this.thrusters = Math.max(0, this.thrusters - THRUSTER_HIT * weight);
      // a hull whose left flank lacks its armor panels (see Perks.bareFlank) takes a beam from that side twice as hard
      const bare = flank && this.perks.bareFlank && local.x > 0;
      return { status: this.structural(ARMOR_DAMAGE * weight * (bare ? 2 : 1), now), zone: flank ? 'thrusters' : 'armor' };
    }
    offset.subVectors(this.flight.position, origin);
    const along = offset.dot(direction);
    this.flight.toLocal(local.copy(origin).addScaledVector(direction, along), local).divideScalar(this.radius);
    // a beam that only grazed the hit sphere on a lagging screen still hits the hull, not empty space
    if (local.lengthSq() > 1) local.normalize();

    const half = Math.sqrt(Math.max(0, 1 - local.lengthSq())) * this.radius;
    const localDirection = this.flight.toLocalDirection(direction);
    const center = local.clone().multiplyScalar(this.radius);
    const entry = this.addHole(center.clone().addScaledVector(localDirection, -half * 0.8), localDirection.clone().negate(), ENTRY_HOLE, now);
    const exit = this.addHole(center.clone().addScaledVector(localDirection, half * 0.8), localDirection.clone(), EXIT_HOLE, now);
    for (const hole of [entry, exit]) {
      torque.copy(hole.point).divideScalar(this.radius).cross(force.copy(hole.vent).multiplyScalar(-hole.size));
      this.flight.angularVelocity.addScaledVector(torque, DECOMPRESSION_KICK);
    }

    // into the drive: it loses thrust, and once nothing is left its reactor goes critical
    this.drive = Math.max(0, this.drive - DRIVE_HIT * weight);
    if (this.drive > 1e-6) return { status: this.structural(ARMOR_DAMAGE * weight, now), zone: 'drive' };
    return { status: this.structural(Infinity, now), zone: 'reactor' };
  }

  /**
   * Another ship rams this one, coming in along `direction` (from the rammer towards this ship)
   * and closing at `closing` (units/s): where it strikes decides what breaks (see ramDamage),
   * the drive from behind, a flank, or the armored nose.
   */
  rammed(direction: THREE.Vector3, closing: number, now: number): { status: DamageStatus; zone: RamZone } {
    let zone: RamZone = 'drive';
    if (!this.tailToward(direction)) {
      this.flight.toLocalDirection(direction, local);
      zone = hypot(local.x, local.y) > Math.abs(local.z) ? 'flank' : 'nose';
    }
    if (!this.alive || now < this.protectedUntil) return { status: 'protected', zone };
    const damage = ramDamage(closing, zone);
    if (damage.hull <= 0) return { status: 'hit', zone };
    this.thrusters = Math.max(0, this.thrusters - damage.thrusters);
    if (damage.drive > 0) {
      this.drive = Math.max(0, this.drive - damage.drive);
      // the drive crushed: its reactor goes, as under the laser
      if (this.drive <= 1e-6) return { status: this.structural(Infinity, now), zone };
    }
    return { status: this.structural(damage.hull, now), zone };
  }

  /**
   * Whether a beam travelling in `direction` comes from behind this ship, within REAR_CONE of
   * its axis: then it goes into the drive instead of the armor.
   */
  tailToward(direction: THREE.Vector3): boolean {
    return direction.dot(this.flight.forward(offset)) / direction.length() > REAR_CONE_COS;
  }

  /** The repair item: hull, drive and thrusters as new, the holes patched. */
  repair() {
    this.hull = MAX_HULL;
    this.drive = this.thrusters = 1;
    this.holes.length = 0;
  }

  /**
   * The overdrive leaves the main drive glowing: it gives no thrust until `until` (game time).
   * The maneuvering thrusters and the laser run on their own, so the ship still turns,
   * sidesteps and fires.
   */
  overheatDrive(until: number) {
    this.driveOfflineUntil = until;
  }

  /** The main drive is cooling down after an overdrive (see overheatDrive). */
  driveOffline(now: number) {
    return now < this.driveOfflineUntil;
  }

  /** Running silent: neither its drive burned nor a shot fired for SILENT_AFTER seconds, so the sensors find it only within SILENT_RANGE (see detectable). */
  silent(now: number): boolean {
    return now - this.loudAt >= SILENT_AFTER;
  }

  /** The seconds the main drive still gives no thrust (0: it does). */
  driveColdFor(now: number) {
    return Math.max(0, this.driveOfflineUntil - now);
  }

  /** Hull damage, e.g. from a collision; the plating of an upgraded ship takes some of it (see Perks). */
  structural(amount: number, now: number): DamageStatus {
    if (!this.alive || now < this.protectedUntil) return 'protected';
    this.hull -= amount * this.perks.damage;
    if (this.hull > 0) return 'hit';
    this.hull = 0;
    this.alive = false;
    this.deaths++;
    this.root.visible = false;
    return 'destroyed';
  }

  private addHole(point: THREE.Vector3, vent: THREE.Vector3, size: number, now: number): Hole {
    const hole = { point, vent, size, at: now };
    this.holes.push(hole);
    if (this.holes.length > MAX_HOLES) this.holes.shift();
    return hole;
  }

  /** Converts a point in ship space to world space. */
  toWorld(point: THREE.Vector3, target = new THREE.Vector3()) {
    return this.flight.toWorld(point, target);
  }

  /** Muzzle position of the next shot in world space: alternating between the left and right side of the nose. */
  muzzle(target = new THREE.Vector3()) {
    const side = this.shots++ % 2 === 0 ? -1 : 1;
    return this.toWorld(local.set(side * this.radius * 0.35, -this.radius * 0.1, -this.radius * 0.6), target);
  }

  /** Point on the nose where the beam's line of fire starts; the crosshair sits on this line. */
  nose(target = new THREE.Vector3()) {
    return this.toWorld(local.set(0, 0, -this.radius * 0.6), target);
  }

  syncTransform() {
    this.root.position.copy(this.flight.position);
    this.root.quaternion.copy(this.flight.orientation);
    // the drive light hangs behind the nozzle, though it is not a child of the ship (see Game.lendLight)
    if (this.engineLight) this.toWorld(local.set(0, 0, ENGINE_LIGHT_OFFSET), this.engineLight.position);
  }

  private animateEngine(dt: number) {
    const { flame, flameMaterial, flameZ, glows, glowMaterial } = this.engine;
    // A damaged drive sputters.
    const sputter = this.drive < 1 ? 0.6 + 0.4 * Math.random() : 1;
    const throttle = this.flight.throttle * sputter;
    this.flameTime += dt;
    if (flame && flameMaterial) {
      flame.visible = throttle > 0.02;
      flame.position.z = flameZ - FLAME_RETRACT * (1 - throttle);
      flameMaterial.map = this.frames[Math.floor(this.flameTime * 10) % this.frames.length];
      flameMaterial.opacity = throttle;
    }
    // the glow grows and brightens with the drive; idle it is a faint pilot light
    const glowScale = GLOW_MAX_SCALE * (0.3 + 0.7 * throttle);
    glowMaterial.color.setScalar(GLOW_IDLE + (1 - GLOW_IDLE) * throttle);
    for (const glow of glows) {
      glow.visible = this.drive > 0;
      glow.scale.set(glowScale, glowScale, 1);
    }
    if (this.engineLight) this.engineLight.intensity = 1.5e5 * throttle;
    if (this.trim.light.map) this.trim.light.map.offset.x = -((this.flameTime * TRIM_RUN * TRIM_PULSES) % 1);
  }
}
