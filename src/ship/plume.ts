import * as THREE from 'three';

/**
 * A drive plume: a burning main drive (throttle above PLUME_THROTTLE) throws its exhaust out
 * behind it in a cone spreading by PLUME_SPREAD per unit of its length (about 7°). Its power is
 * tens of gigawatts (a 60 t ship pushed at 13 g by exhaust of some 20 km/s), so its heat falls
 * off with the square of the distance as the cone widens: full within PLUME_CORE of the nozzle
 * (units, 100 m), a ninth at 300 m, a hundredth at a kilometer, gone past PLUME_REACH (units,
 * 1 km). Where it is full a ship takes PLUME_HEAT heat and PLUME_BURN hull a second, less with the
 * throttle: three seconds in it close behind a burning drive kill. Nothing like a slipstream in
 * vacuum: to overtake, a ship has to get out of the line of the one ahead.
 *
 * A stronger main drive (the hangar's steps) throws more plasma a second at the same exhaust
 * speed: its push and the plume's power (half the push times the exhaust speed) grow alike, by
 * `power`, the drive's push against a stock drive's. Every point of the plume takes `power` times
 * the heat, so the plume reaches √power farther before it falls to a stock plume's last heat:
 * 1,072 m and 15 % more heat on a drive of the third step (1,025 m and 5 % online).
 */
export const PLUME_THROTTLE = 0.3;
export const PLUME_CORE = 2000;
export const PLUME_REACH = 20000;
export const PLUME_SPREAD = 0.12;
export const PLUME_HEAT = 60;
export const PLUME_BURN = 35;

/** How far the plume of a drive of `power` (its push against a stock drive's) reaches (units). */
export const plumeReach = (power: number) => PLUME_REACH * Math.sqrt(power);

const back = new THREE.Vector3();
const away = new THREE.Vector3();

/**
 * How strongly the plume of a drive at `nozzle`, pointing out `backward` (unit) at `throttle`,
 * of `power` (its push against a stock drive's), grills a hull of `radius` at `position` (0 outside
 * it, 1 full on a stock drive): the throttle times the power times the square fall-off past
 * PLUME_CORE, inside the cone only.
 */
export function plumeStrength(nozzle: THREE.Vector3, backward: THREE.Vector3, throttle: number, position: THREE.Vector3, radius: number, power: number): number {
  if (throttle < PLUME_THROTTLE) return 0;
  back.copy(backward);
  away.subVectors(position, nozzle);
  const along = away.dot(back);
  if (along <= 0 || along > plumeReach(power)) return 0;
  const across = away.addScaledVector(back, -along).length();
  if (across > radius * 0.6 + along * PLUME_SPREAD) return 0;
  const share = along <= PLUME_CORE ? 1 : (PLUME_CORE / along) * (PLUME_CORE / along);
  return throttle * power * share;
}
