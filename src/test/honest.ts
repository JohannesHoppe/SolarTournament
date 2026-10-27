import * as THREE from 'three';
import { IDLE, type Controls } from '../input/input';
import { FlightModel, flyByNose, MAX_SPEED, OVERDRIVE_PUSH } from '../ship/flight';
import { Brake } from '../ship/computer';
import { Randomizer } from '../random';
import type { Seen } from '../net/plausible';

/** A ship's hit radius (units, 17 m), as the game's hulls have it; the muzzles sit as Ship.muzzle has them. */
const RADIUS = 340;
/** The fastest an honest ship flies (units/s, 700 m/s): the limit with the overdrive's shove and a dodge on top, or a winch reeling it towards a ship flying the other way. */
const TOP_SPEED = 14000;
/** States go out this often (Hz), as the session sends them. */
const STATE_RATE = 15;

/** What a browser sends of its own ship, as another browser receives it: a state (with the sender's clock) or a beam, and when it arrives. */
export type Message = { kind: 'state'; at: number; clock: number; seen: Seen } | { kind: 'beam'; at: number; from: THREE.Vector3; to: THREE.Vector3 };

/** How rough a flight and its link are. */
export interface Roughness {
  /** Seconds between blows on average: shoves and rams (a spin of up to 6 rad/s, a push of up to 250 m/s), hits with their decompression and venting, a dodge, the overdrive. */
  blows: number;
  /** Seconds between frames of 0.1 to 0.5 s on average (a browser that stutters). */
  stutter: number;
  /** Seconds between link stalls of 1 to 3 s on average: what is sent meanwhile arrives at once afterwards. */
  stalls: number;
  /** Thrusters shot to pieces: they turn the ship with a quarter of their power, and escaping air spins it. */
  wrecked: boolean;
}

const random = (r: Randomizer, length = 1) => new THREE.Vector3(r.range(-1, 1), r.range(-1, 1), r.range(-1, 1)).normalize().multiplyScalar(length);

/**
 * An honest ship flown for `seconds` with the game's flight model by a wild pilot: the stick
 * slammed every few tenths of a second, flips, the autopilot (braking now and then), the trigger held now and
 * then (beams from the muzzles along the nose, short and long), blown about as `rough` says.
 * Returns what another browser receives, in the order it arrives.
 */
export function honestFlight(seed: number, seconds: number, rough: Roughness): Message[] {
  const r = new Randomizer(seed);
  const flight = new FlightModel();
  flight.reset(new THREE.Vector3(), new THREE.Quaternion());
  const brake = new Brake();
  const controls: Controls = { ...IDLE };
  const steered: Controls = { ...IDLE };
  const gravity = random(r, r.range(0, 400));
  const push = new THREE.Vector3();
  const spin = new THREE.Vector3();
  const goal = new THREE.Vector3();
  const nose = new THREE.Vector3();
  const messages: Message[] = [];
  let mode: 'stick' | 'flip' | 'autopilot' = 'stick';
  let nextChoice = 0;
  let nextState = 0;
  let firing = false;
  let nextShot = 0;
  let stallUntil = -Infinity;
  let lastArrival = 0;
  // a blow's venting air spins the hull on for a while
  let ventUntil = -Infinity;
  for (let t = 0; t < seconds; ) {
    const dt = r.nextFloat() < 1 / (60 * rough.stutter) ? r.range(0.1, 0.5) : 1 / 60;
    t += dt;
    if (t >= nextChoice) {
      nextChoice = t + r.range(0.15, 0.6);
      const pick = r.nextFloat();
      mode = pick < 0.15 ? 'flip' : pick < 0.4 ? 'autopilot' : 'stick';
      goal.copy(random(r));
      Object.assign(controls, {
        yaw: r.nextFloat() < 0.5 ? Math.sign(r.range(-1, 1)) : r.range(-1, 1),
        pitch: r.nextFloat() < 0.5 ? Math.sign(r.range(-1, 1)) : r.range(-1, 1),
        roll: r.nextFloat() < 0.3 ? Math.sign(r.range(-1, 1)) : 0,
        thrust: r.nextFloat() < 0.6 ? 1 : 0,
        strafeX: r.range(-1, 1),
        strafeY: r.range(-1, 1),
        strafeZ: 0,
      });
      firing = r.nextFloat() < 0.5;
    }
    if (r.nextFloat() < dt / rough.blows) {
      const kind = r.nextFloat();
      if (kind < 0.4) {
        // a shove or a ram: the hull spins away from the blow, and the ship takes the other's speed
        flight.angularVelocity.add(random(r, r.range(0, 6)));
        flight.velocity.add(random(r, r.range(0, MAX_SPEED)));
      } else if (kind < 0.7) {
        // a beam through the drive: the decompression kicks, the air vents for a while
        flight.angularVelocity.add(random(r, r.range(0, 2.4)));
        spin.copy(random(r, r.range(0, 17)));
        ventUntil = t + 2.5;
      } else if (kind < 0.85) {
        flight.velocity.add(random(r, 800));
      } else {
        flight.velocity.add(flight.forward(nose).multiplyScalar(OVERDRIVE_PUSH));
      }
      // blow upon blow, no ship comes past about 700 m/s
      flight.velocity.clampLength(0, TOP_SPEED);
    }
    flight.thrusterFactor = rough.wrecked ? 0.25 : 1.08;
    let command: Controls = controls;
    if (mode === 'flip') command = Object.assign(steered, IDLE, flight.flip(goal, 2.5, { yaw: 0, pitch: 0, roll: 0 }), { thrust: 0 });
    else if (mode === 'autopilot') {
      // the autopilot: the ship flies where its nose points, braking now and then
      if (controls.thrust === 0 && controls.roll !== 0) command = brake.fly(flight, controls, flight.driveFactor, steered);
      else {
        brake.release();
        command = flyByNose(flight, controls, gravity, steered);
      }
    }
    flight.update(dt, command, gravity, push, t < ventUntil ? spin : undefined);
    const arrive = (sentAt: number) => {
      if (r.nextFloat() < dt / rough.stalls) stallUntil = sentAt + r.range(1, 3);
      // a link delivers in order: nothing overtakes what was sent before it
      lastArrival = Math.max(lastArrival, Math.max(sentAt, stallUntil) + 0.05 + r.range(0, 0.03));
      return lastArrival;
    };
    if (firing && t >= nextShot) {
      nextShot = t + r.range(0.09, 0.4);
      const side = r.nextFloat() < 0.5 ? -1 : 1;
      const from = new THREE.Vector3(side * RADIUS * 0.35, -RADIUS * 0.1, -RADIUS * 0.6).applyQuaternion(flight.orientation).add(flight.position);
      const length = [200, 2000, 20000, 60000][Math.floor(r.range(0, 4))];
      const to = new THREE.Vector3(0, 0, -RADIUS * 0.6).applyQuaternion(flight.orientation).add(flight.position).addScaledVector(flight.forward(nose), length);
      messages.push({ kind: 'beam', at: arrive(t), from: from.round(), to: to.round() });
    }
    if (t >= nextState) {
      nextState = t + 1 / STATE_RATE;
      const seen: Seen = {
        p: flight.position.toArray().map(Math.round),
        alive: true,
        q: flight.orientation.toArray().map((x) => +x.toFixed(4)),
        w: flight.angularVelocity.toArray().map((x) => +x.toFixed(3)),
      };
      messages.push({ kind: 'state', at: arrive(t), clock: +t.toFixed(3), seen });
    }
  }
  return messages;
}
