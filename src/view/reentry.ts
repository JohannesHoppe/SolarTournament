import * as THREE from 'three';
import { airHeat, altitudeIn, type Air } from '../world/air';
import { COOLING_SHADOW, MAX_HEAT, type Ship } from '../ship/ship';
import type { Effects } from './effects';

/**
 * A ship flying hot through a planet's air (Jupiter's, see world/air), as everyone sees it: a
 * glowing shock layer pressed against the side it flies towards, deep orange to yellow-hot by
 * how hard the air heats it, streaming out into a plasma trail along its flight; once the hull
 * burns, its leading plates glow dull red to orange and flakes and sparks of it ablate and
 * trail away; a ship that dies burning streaks on as a fireball and breaks up into burning
 * pieces that sink into the clouds. All of it follows each ship's own heating, computed from
 * its altitude and speed by the same air model (see plasmaOf), so the own ship, bots and other
 * Hosts' ships look alike; it changes nothing in the game.
 *
 * Per hot ship it costs two draw calls (the shock layer and the hull's glow), shown only while
 * it heats, and the camera riding with a hot ship one more (the licks); the trail, the flakes
 * and the fireball are particles of view/effects, which a cheaper picture thins out (see
 * setParticleShare).
 */

/**
 * The plasma's strength (0..1) by how fast the air heats a hull against what its radiators shed
 * (`load`, 1 where they just keep up, see world/air safeSpeed): it starts at half their capacity,
 * is a quarter at the edge of the safe speed, half at twice, full at eight times.
 */
export function plasmaOf(load: number): number {
  return load <= 0 ? 0 : THREE.MathUtils.clamp((Math.log2(load) + 1) / 4, 0, 1);
}

/** How hard the air heats a ship at `position` flying at `velocity` against its radiators in the clouds (see plasmaOf). */
export function loadOf(air: Air, position: THREE.Vector3, velocity: THREE.Vector3, cooling: number): number {
  return airHeat(altitudeIn(air, position), velocity.length()) / cooling;
}

/** The plasma follows the heating with this time constant (s), so a jolt in a remote ship's speed does not flicker it. */
const PLASMA_EASE = 0.25;
/** The hull's glow rises over SCORCH_RISE seconds while it burns and fades over SCORCH_FADE as it cools; while it only heats it glows SCORCH_HEATING of the plasma. */
const SCORCH_RISE = 1.5;
const SCORCH_FADE = 4;
const SCORCH_HEATING = 0.2;
/** The shock layer stands off the hull by up to this share of the ship's radius at the stagnation point, and its tail streams out this many radii behind at full strength. */
const STANDOFF = 0.25;
const TAIL = 2.4;
/** The shock layer wraps the hull's box (wings and fittings) with this much to spare, as an ellipsoid. */
const SHEATH_MARGIN = 1.1;
/** The shock layer fades out within these many ship radii of the camera, so the chase camera never sits inside it. */
const NEAR_FADE = 0.8;
const FAR_FADE = 2.2;
/** The plasma trail: puffs at most this far apart (share of their size), at most TRAIL_PUFFS a frame, each glowing TRAIL_LIFE seconds. */
const TRAIL_SPACING = 0.45;
const TRAIL_PUFFS = 4;
const TRAIL_LIFE = 0.9;
/** From this plasma strength on, plasma licks past the camera that rides with the ship (see lickVertex). */
const LICK_FROM = 0.45;
/** A burning hull sheds this many sparks and glowing flakes a second, flung outwards at PEEL ship radii a second (and up to as much again). */
const SPARKS = 50;
const FLAKES = 14;
const PEEL = 5;
/** A ship that dies burning: its fireball streaks on for FIREBALL_SECONDS, then breaks into PIECES that burn for PIECE_SECONDS (plus up to as much again) while they sink. */
const FIREBALL_SECONDS = 1.4;
const PIECES = 7;
const PIECE_SECONDS = 2.5;
/** Fireballs burning at once; one more takes the oldest's place. */
const FIREBALLS = 4;
/** The air brakes the fireball and its pieces by this share of their speed per second, and the planet pulls them down at SINK (units/s², about 0.8 g). */
const FIREBALL_DRAG = 0.6;
const SINK = 160;

/** The plasma's colors: deep orange where it is thin, yellow-hot where it is strongest (the bloom whitens its peak); the hull's glow from dull red to orange. */
const PLASMA_COOL = new THREE.Color(1, 0.24, 0.02);
const PLASMA_HOT = new THREE.Color(1, 0.6, 0.2);
const SCORCH_DULL = new THREE.Color(0.55, 0.06, 0.01);
const SCORCH_BRIGHT = new THREE.Color(1, 0.42, 0.08);
const SPARK = new THREE.Color(1, 0.7, 0.35);
const FLAKE = new THREE.Color(0.8, 0.25, 0.05);
const SOOT = new THREE.Color(0.1, 0.08, 0.07);

const reducedMotion = typeof window === 'undefined' ? null : window.matchMedia('(prefers-reduced-motion: reduce)');

const sheathVertex = /* glsl */ `
  uniform vec3 halfSize;
  uniform vec3 middle;
  uniform vec3 flow;
  uniform float heat;
  uniform float standoff;
  uniform float reach;
  varying float vLead;
  varying float vTail;
  varying vec3 vNormal;
  varying vec3 vWorld;
  varying vec3 vSphere;
  #include <fog_pars_vertex>
  void main() {
    vec3 world = (modelMatrix * vec4(middle + position * halfSize, 1.0)).xyz;
    vec3 centre = (modelMatrix * vec4(middle, 1.0)).xyz;
    vec3 n = normalize(mat3(modelMatrix) * (position / halfSize));
    float lead = dot(n, flow);
    float tail = lead < 0.0 ? pow(-lead, 1.5) : 0.0;
    if (lead > 0.0) world += n * standoff * heat * lead;
    else {
      // the trailing side narrows to the axis and streams out behind
      vec3 off = world - centre;
      vec3 axial = flow * dot(off, flow);
      world = centre + axial + (off - axial) * (1.0 - 0.7 * tail) - flow * reach * heat * tail;
    }
    vLead = lead;
    vTail = tail;
    vNormal = n;
    vWorld = world;
    vSphere = position;
    vec4 mvPosition = viewMatrix * vec4(world, 1.0);
    gl_Position = projectionMatrix * mvPosition;
    #include <fog_vertex>
  }
`;

const sheathFragment = /* glsl */ `
  uniform float heat;
  uniform float time;
  uniform float nearFade;
  uniform float farFade;
  uniform vec3 cool;
  uniform vec3 hot;
  varying float vLead;
  varying float vTail;
  varying vec3 vNormal;
  varying vec3 vWorld;
  varying vec3 vSphere;
  #include <fog_pars_fragment>
  void main() {
    vec3 toEye = cameraPosition - vWorld;
    float distance = length(toEye);
    float rim = 1.0 - abs(dot(normalize(vNormal), toEye / distance));
    float stagnation = smoothstep(0.45, 1.0, vLead);
    // tongues of plasma: a pattern across the flow, swaying slowly, drawn out into streamers
    // where the tail stretches the shell, with brighter bands drifting back along them
    float a = sin(vSphere.x * 9.0 + 1.6 * sin(vSphere.y * 7.0 + time * 0.8));
    float b = sin(vSphere.y * 8.0 + 1.4 * sin(vSphere.x * 6.0 - time * 0.6));
    float tongues = clamp(0.5 + 0.35 * a * b + 0.25 * (a + b), 0.0, 1.0);
    tongues *= tongues * tongues;
    float bands = 0.75 + 0.25 * sin(vTail * 14.0 - time * 6.0);
    // the streamers trail from the flanks and behind; ahead the shock layer glows where it is pressed
    float flanks = 0.3 + 0.7 * smoothstep(0.4, -0.3, vLead);
    float envelope = rim * rim * (0.02 + 1.3 * tongues) * bands * flanks;
    float fade = (1.0 - vTail) * (1.0 - vTail);
    float strength = heat * (stagnation * 1.1 + envelope) * fade;
    strength *= smoothstep(nearFade, farFade, distance);
    vec3 color = mix(cool, hot, clamp(heat * 0.15 + stagnation * 0.9 - vTail * 0.6, 0.0, 1.0));
    gl_FragColor = vec4(color * strength * 0.8, 1.0);
    #include <fog_fragment>
  }
`;

const scorchVertex = /* glsl */ `
  uniform vec3 flow;
  varying float vLead;
  varying vec3 vNormal;
  varying vec3 vWorld;
  varying vec3 vLocal;
  #include <fog_pars_vertex>
  void main() {
    vec3 n = normalize(mat3(modelMatrix) * normal);
    // a hair off the plates (5 cm, and a thousandth of the distance farther off, where the depth
    // buffer grows coarse), so it never fights the hull for its pixels
    vec4 world = modelMatrix * vec4(position, 1.0);
    world.xyz += n * (1.0 + 0.001 * distance(world.xyz, cameraPosition));
    vLead = dot(n, flow);
    vNormal = n;
    vWorld = world.xyz;
    vLocal = position;
    vec4 mvPosition = viewMatrix * world;
    gl_Position = projectionMatrix * mvPosition;
    #include <fog_vertex>
  }
`;

const scorchFragment = /* glsl */ `
  uniform float scorch;
  uniform float time;
  uniform vec3 dull;
  uniform vec3 bright;
  varying float vLead;
  varying vec3 vNormal;
  varying vec3 vWorld;
  varying vec3 vLocal;
  #include <fog_pars_fragment>
  void main() {
    vec3 toEye = normalize(cameraPosition - vWorld);
    float rim = 1.0 - abs(dot(normalize(vNormal), toEye));
    float lead = smoothstep(-0.25, 0.85, vLead);
    // the plates glow unevenly, the hot spots wandering slowly
    float mottle = 0.75 + 0.25 * sin(vLocal.x * 0.06 + vLocal.z * 0.04 + time * 0.9) * sin(vLocal.y * 0.07 - vLocal.z * 0.05 + time * 0.6);
    float glow = scorch * (0.1 + 0.4 * rim * rim + 0.6 * lead) * mottle;
    vec3 color = mix(dull, bright, clamp(scorch * lead, 0.0, 1.0));
    gl_FragColor = vec4(color * glow * 1.4, 1.0);
    #include <fog_fragment>
  }
`;

/**
 * The plasma licking past the camera riding with a hot ship: the inside of a short tube around
 * the camera along the flow, lit only in a band near the camera (so it shows at the view's
 * edges) with tongues that sway slowly and bands that stream back.
 */
const lickVertex = /* glsl */ `
  varying vec2 vUv;
  varying float vAhead;
  void main() {
    vUv = uv;
    vAhead = position.z;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const lickFragment = /* glsl */ `
  uniform float strength;
  uniform float time;
  uniform vec3 cool;
  uniform vec3 hot;
  varying vec2 vUv;
  varying float vAhead;
  void main() {
    float angle = vUv.x * 6.2831853;
    float tongues = 0.5 + 0.5 * sin(angle * 7.0 + 1.8 * sin(angle * 3.0 + time * 0.9) + vAhead * 2.0);
    tongues *= tongues;
    tongues *= tongues * tongues;
    float bands = 0.7 + 0.3 * sin(vAhead * 9.0 + time * 7.0);
    float band = smoothstep(0.25, 0.55, vAhead) * (1.0 - smoothstep(0.7, 1.0, vAhead));
    float glow = strength * tongues * bands * band;
    gl_FragColor = vec4(mix(cool, hot, tongues * 0.5) * glow, 1.0);
  }
`;

/** The tube of the licks (see lickVertex): its radius and its length ahead of the camera, in ship radii. */
const LICK_RADIUS = 1.3;
const LICK_LENGTH = 2.2;
/** How bright the licks glow at full plasma: a hint at the view's edges. */
const LICK_GLOW = 0.35;
/** The tube starts a fifth of its length ahead of the camera: no vertex of it lies on the camera's plane. */
const lickTube = new THREE.CylinderGeometry(1, 1, 0.8, 48, 1, true).rotateX(Math.PI / 2).translate(0, 0, 0.6);
const Z_AXIS = new THREE.Vector3(0, 0, 1);

const sphere = new THREE.SphereGeometry(1, 32, 20);
const box = new THREE.Box3();
const part = new THREE.Box3();
const relative = new THREE.Matrix4();
const placed = new THREE.Matrix4();
const flowScratch = new THREE.Vector3();
const point = new THREE.Vector3();
const across = new THREE.Vector3();
const velocity = new THREE.Vector3();
const down = new THREE.Vector3();

/** What the plasma of one ship needs from frame to frame. */
class Burn {
  readonly sheath: THREE.Mesh<THREE.SphereGeometry, THREE.ShaderMaterial>;
  readonly skins: THREE.Mesh[] = [];
  private readonly skinMaterial: THREE.ShaderMaterial;
  /** The plasma's strength (0..1, see plasmaOf), eased. */
  plasma = 0;
  /** The hull's glow (0..1). */
  scorch = 0;
  /** The radiators as this browser guesses them for a ship it does not run (heat units, see world/air airBurn). */
  fill = 0;
  burning = false;
  /** Where the plasma trail was laid last frame. */
  readonly trailFrom = new THREE.Vector3();
  trailing = false;
  wasAlive = false;

  constructor(readonly ship: Ship) {
    // the hull's extent in the model's own space: the shock layer wraps it
    const model = ship.model;
    model.updateMatrixWorld(true);
    const inverse = relative.copy(model.matrixWorld).invert();
    box.makeEmpty();
    const hulls: THREE.Mesh[] = [];
    model.traverse((o) => {
      if (!(o instanceof THREE.Mesh) || !o.visible || !(o.material instanceof THREE.MeshStandardMaterial)) return;
      // the painted hull glows (one mesh, see ship/models), the rails and fittings only bound the plasma
      if (o.material instanceof THREE.MeshPhysicalMaterial) hulls.push(o);
      o.geometry.computeBoundingBox();
      box.union(part.copy(o.geometry.boundingBox!).applyMatrix4(placed.multiplyMatrices(inverse, o.matrixWorld)));
    });
    const size = box.getSize(new THREE.Vector3()).multiplyScalar(0.5 * SHEATH_MARGIN);
    const middle = box.getCenter(new THREE.Vector3());
    const radius = ship.radius;
    this.sheath = new THREE.Mesh(
      sphere,
      new THREE.ShaderMaterial({
        uniforms: {
          halfSize: { value: size },
          middle: { value: middle },
          flow: { value: new THREE.Vector3(0, 0, -1) },
          heat: { value: 0 },
          standoff: { value: STANDOFF * radius },
          reach: { value: TAIL * radius },
          time: { value: 0 },
          nearFade: { value: NEAR_FADE * radius },
          farFade: { value: FAR_FADE * radius },
          cool: { value: PLASMA_COOL },
          hot: { value: PLASMA_HOT },
        },
        vertexShader: sheathVertex,
        fragmentShader: sheathFragment,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        transparent: true,
        side: THREE.DoubleSide,
        fog: true,
      }),
    );
    this.sheath.frustumCulled = false;
    this.sheath.visible = false;
    model.add(this.sheath);
    this.skinMaterial = new THREE.ShaderMaterial({
      uniforms: { flow: this.sheath.material.uniforms.flow, scorch: { value: 0 }, time: this.sheath.material.uniforms.time, dull: { value: SCORCH_DULL }, bright: { value: SCORCH_BRIGHT } },
      vertexShader: scorchVertex,
      fragmentShader: scorchFragment,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      transparent: true,
      fog: true,
    });
    for (const hull of hulls) {
      const skin = new THREE.Mesh(hull.geometry, this.skinMaterial);
      skin.visible = false;
      skin.castShadow = skin.receiveShadow = false;
      hull.add(skin);
      this.skins.push(skin);
    }
  }

  /** Shows the plasma at its strength and the hull's glow, flowing along `flow` (world, unit length). */
  show(flow: THREE.Vector3, time: number) {
    const uniforms = this.sheath.material.uniforms;
    uniforms.flow.value.copy(flow);
    uniforms.heat.value = this.plasma;
    uniforms.time.value = time;
    this.skinMaterial.uniforms.scorch.value = this.scorch;
    this.sheath.visible = this.plasma > 0.01;
    for (const skin of this.skins) skin.visible = this.scorch > 0.01;
  }

  hide() {
    this.sheath.visible = false;
    for (const skin of this.skins) skin.visible = false;
  }

  dispose() {
    this.sheath.removeFromParent();
    for (const skin of this.skins) skin.removeFromParent();
    this.sheath.material.dispose();
    this.skinMaterial.dispose();
  }
}

/** A ship that died burning: the fireball streaking on, then its pieces sinking. */
interface Fireball {
  age: number;
  size: number;
  readonly position: THREE.Vector3;
  readonly velocity: THREE.Vector3;
  readonly pieces: { position: THREE.Vector3; velocity: THREE.Vector3; life: number }[];
}

export class Reentry {
  private readonly burns = new Map<Ship, Burn>();
  private readonly fireballs: Fireball[] = [];
  private time = 0;
  /** What goes into the scene: the licks around the camera. */
  readonly group = new THREE.Group();
  private readonly licks: THREE.Mesh<THREE.CylinderGeometry, THREE.ShaderMaterial>;

  constructor(private readonly effects: Effects) {
    this.licks = new THREE.Mesh(
      lickTube,
      new THREE.ShaderMaterial({
        uniforms: { strength: { value: 0 }, time: { value: 0 }, cool: { value: PLASMA_COOL }, hot: { value: PLASMA_HOT } },
        vertexShader: lickVertex,
        fragmentShader: lickFragment,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        transparent: true,
        side: THREE.DoubleSide,
      }),
    );
    this.licks.frustumCulled = false;
    this.licks.visible = false;
    this.group.add(this.licks);
    for (let i = 0; i < FIREBALLS; i++) {
      this.fireballs.push({
        age: Infinity,
        size: 0,
        position: new THREE.Vector3(),
        velocity: new THREE.Vector3(),
        pieces: Array.from({ length: PIECES }, () => ({ position: new THREE.Vector3(), velocity: new THREE.Vector3(), life: 0 })),
      });
    }
  }

  /** The plasma's strength around a ship this frame (0..1): what the cockpit hears of it. */
  plasmaOf(ship: Ship | null): number {
    return ship ? (this.burns.get(ship)?.plasma ?? 0) : 0;
  }

  /** Whether a ship's hull burns, as the picture shows it. */
  burning(ship: Ship | null): boolean {
    return !!ship && !!this.burns.get(ship)?.burning;
  }

  /**
   * Once a frame: every ship's plasma and glow in the arena's `air` (none: nothing shows), the
   * trails, flakes and fireballs; `rider` is the ship the `camera` rides with, past which the
   * plasma licks at high heating.
   */
  update(dt: number, ships: readonly Ship[], air: Air | null, rider: Ship | null, camera: THREE.Camera) {
    if (!reducedMotion?.matches) this.time += dt;
    for (const [ship, burn] of this.burns) {
      if (air && ships.includes(ship)) continue;
      burn.dispose();
      this.burns.delete(ship);
    }
    if (air) for (const ship of ships) this.heat(ship, air, dt, ship === rider);
    this.burnDown(dt, air);
    this.lick(rider, camera);
  }

  /** The licks around the camera riding with a hot ship (see lickVertex), along its flight. */
  private lick(rider: Ship | null, camera: THREE.Camera) {
    const plasma = this.plasmaOf(rider);
    this.licks.visible = !!rider?.alive && plasma > LICK_FROM;
    if (!this.licks.visible) return;
    const speed = rider!.flight.velocity.length();
    const uniforms = this.licks.material.uniforms;
    uniforms.strength.value = LICK_GLOW * (plasma - LICK_FROM) / (1 - LICK_FROM);
    uniforms.time.value = this.time;
    this.licks.position.copy(camera.position);
    this.licks.quaternion.setFromUnitVectors(Z_AXIS, flowScratch.copy(rider!.flight.velocity).divideScalar(Math.max(speed, 1e-6)));
    this.licks.scale.set(LICK_RADIUS * rider!.radius, LICK_RADIUS * rider!.radius, LICK_LENGTH * rider!.radius);
  }

  private heat(ship: Ship, air: Air, dt: number, rider: boolean) {
    let burn = this.burns.get(ship);
    const cooling = COOLING_SHADOW * ship.perks.cooling;
    const load = ship.alive ? loadOf(air, ship.flight.position, ship.flight.velocity, cooling) : 0;
    if (!burn) {
      if (load < 0.5) return;
      burn = new Burn(ship);
      this.burns.set(ship, burn);
    }
    // the radiators: a ship this browser runs says it; another's is guessed from its flight
    burn.fill = THREE.MathUtils.clamp(burn.fill + (load - 1) * cooling * dt, 0, MAX_HEAT);
    const full = ship.owner === null ? ship.heat >= MAX_HEAT : burn.fill >= MAX_HEAT;
    const wasBurning = burn.burning;
    burn.burning = ship.alive && load > 1 && full;
    if (burn.wasAlive && !ship.alive && wasBurning) this.ignite(ship);
    burn.wasAlive = ship.alive;
    burn.plasma += (plasmaOf(load) - burn.plasma) * (1 - Math.exp(-dt / PLASMA_EASE));
    const scorch = burn.burning ? 1 : SCORCH_HEATING * burn.plasma;
    burn.scorch = scorch > burn.scorch ? Math.min(scorch, burn.scorch + dt / SCORCH_RISE) : Math.max(scorch, burn.scorch - dt / SCORCH_FADE);
    if (!ship.alive) {
      burn.plasma = burn.scorch = burn.fill = 0;
      burn.trailing = false;
      burn.hide();
      return;
    }
    const speed = ship.flight.velocity.length();
    const flow = flowScratch.copy(ship.flight.velocity).divideScalar(Math.max(speed, 1e-6));
    burn.show(flow, this.time);
    // the camera riding behind a ship would fly through its trail: it sees the plasma lick past instead
    if (rider) burn.trailing = false;
    else this.trail(ship, burn, flow);
    if (burn.burning) this.ablate(ship, flow, dt);
  }

  /** The plasma trail behind a ship: glowing puffs laid along its path, left behind in the air. */
  private trail(ship: Ship, burn: Burn, flow: THREE.Vector3) {
    const radius = ship.radius;
    const tail = point.copy(ship.flight.position).addScaledVector(flow, -radius * 0.8);
    if (burn.plasma < 0.1) {
      burn.trailing = false;
      return;
    }
    if (!burn.trailing) burn.trailFrom.copy(tail);
    const size = radius * (0.5 + 1.1 * burn.plasma);
    const steps = Math.min(TRAIL_PUFFS, Math.max(1, Math.ceil(burn.trailFrom.distanceTo(tail) / (size * TRAIL_SPACING))));
    velocity.copy(ship.flight.velocity).multiplyScalar(0.08);
    for (let i = 1; i <= steps; i++) {
      across.lerpVectors(burn.trailFrom, tail, i / steps);
      this.effects.glow(across, velocity, TRAIL_LIFE * (0.6 + 0.4 * burn.plasma), size, size * 0.3, burn.plasma > 0.6 ? PLASMA_HOT : PLASMA_COOL);
    }
    burn.trailFrom.copy(tail);
    burn.trailing = true;
  }

  /**
   * A burning hull: sparks and glowing flakes torn off its leading side, falling behind; the
   * plasma flowing around the hull flings them outwards (PEEL), so they pass a camera riding
   * behind at the view's edges rather than through it.
   */
  private ablate(ship: Ship, flow: THREE.Vector3, dt: number) {
    const radius = ship.radius;
    for (let n = count(SPARKS * dt); n > 0; n--) {
      outwards(across, flow);
      point.copy(ship.flight.position).addScaledVector(across, radius * 0.5).addScaledVector(flow, radius * 0.3);
      velocity.copy(across).multiplyScalar(radius * PEEL * (1 + Math.random())).addScaledVector(ship.flight.velocity, 0.15);
      this.effects.glow(point, velocity, 0.3 + Math.random() * 0.3, radius * 0.1, radius * 0.03, SPARK);
    }
    for (let n = count(FLAKES * dt); n > 0; n--) {
      outwards(across, flow);
      point.copy(ship.flight.position).addScaledVector(across, radius * 0.6);
      velocity.copy(across).multiplyScalar(radius * PEEL * (0.6 + Math.random() * 0.6)).addScaledVector(ship.flight.velocity, 0.25);
      this.effects.glow(point, velocity, 0.8 + Math.random() * 0.8, radius * 0.16, radius * 0.05, FLAKE);
      this.effects.soot(point, velocity, 1.5 + Math.random(), radius * 0.25, radius * 1, SOOT);
    }
  }

  /** A ship that died burning sets off a fireball where it was, streaking on along its flight. */
  private ignite(ship: Ship) {
    let ball = this.fireballs[0];
    for (const f of this.fireballs) if (f.age > ball.age) ball = f;
    ball.age = 0;
    ball.size = ship.radius;
    ball.position.copy(ship.flight.position);
    ball.velocity.copy(ship.flight.velocity);
  }

  /** The fireballs: one streaks on, braking and sinking, then breaks into pieces burning as they fall. */
  private burnDown(dt: number, air: Air | null) {
    for (const ball of this.fireballs) {
      if (ball.age === Infinity) continue;
      if (!air) {
        ball.age = Infinity;
        continue;
      }
      const before = ball.age;
      ball.age += dt;
      if (ball.age < FIREBALL_SECONDS) {
        fall(ball, air, dt);
        const fade = 1 - ball.age / FIREBALL_SECONDS;
        for (let n = 0; n < 3; n++) {
          point.randomDirection().multiplyScalar(ball.size * 0.4).add(ball.position);
          velocity.copy(ball.velocity).multiplyScalar(0.05);
          this.effects.glow(point, velocity, 0.6 + Math.random() * 0.4, ball.size * (1.2 + 1.2 * fade), ball.size * 0.5, n === 0 ? PLASMA_HOT : PLASMA_COOL);
        }
        this.effects.soot(ball.position, velocity, 2.5, ball.size, ball.size * 3, SOOT);
        continue;
      }
      if (before < FIREBALL_SECONDS) {
        // it breaks up: the pieces fly apart from where it was
        for (const piece of ball.pieces) {
          piece.position.copy(ball.position);
          piece.velocity.randomDirection().multiplyScalar(ball.size * (1.5 + Math.random() * 2.5)).add(ball.velocity);
          piece.life = PIECE_SECONDS * (1 + Math.random());
        }
        this.effects.explosion(ball.position, ball.size * 1.5, ball.velocity);
      }
      let burning = false;
      for (const piece of ball.pieces) {
        const left = piece.life - (ball.age - FIREBALL_SECONDS);
        if (left <= 0) continue;
        burning = true;
        point.copy(piece.position);
        fall(piece, air, dt);
        const glow = Math.min(1, left / PIECE_SECONDS);
        const size = ball.size * 0.35 * glow;
        velocity.set(0, 0, 0);
        // its trail laid evenly along the step, so a slow frame leaves no beads
        const steps = Math.min(TRAIL_PUFFS, Math.max(1, Math.ceil(point.distanceTo(piece.position) / (size * TRAIL_SPACING))));
        for (let i = 1; i <= steps; i++) {
          across.lerpVectors(point, piece.position, i / steps);
          this.effects.glow(across, velocity, 0.5, size, ball.size * 0.1, glow > 0.5 ? PLASMA_COOL : FLAKE);
        }
        if (Math.random() < 0.5) this.effects.soot(piece.position, velocity, 2, ball.size * 0.3, ball.size * 1.2, SOOT);
      }
      if (!burning) ball.age = Infinity;
    }
  }
}

/** Something burning that falls through the air: braked by it, pulled down by the planet. */
function fall(body: { position: THREE.Vector3; velocity: THREE.Vector3 }, air: Air, dt: number) {
  down.subVectors(air.center, body.position).normalize();
  body.velocity.multiplyScalar(Math.exp(-FIREBALL_DRAG * dt)).addScaledVector(down, SINK * dt);
  body.position.addScaledVector(body.velocity, dt);
}

/** A random direction square to the flow (unit length), into `target`. */
function outwards(target: THREE.Vector3, flow: THREE.Vector3): THREE.Vector3 {
  target.randomDirection().addScaledVector(flow, -target.dot(flow));
  return target.lengthSq() < 1e-6 ? target.set(flow.y, -flow.x, 0).normalize() : target.normalize();
}

/** A whole number of things for an expected `share` (fractions by chance), so a rate per second holds at any frame rate. */
function count(share: number): number {
  const whole = Math.floor(share);
  return whole + (Math.random() < share - whole ? 1 : 0);
}
