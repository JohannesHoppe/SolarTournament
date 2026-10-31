import * as THREE from 'three';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Ship } from '../ship/ship';
import type { Effects } from './effects';
import { KillCam, runStartsAt } from './killcam';

/** A ship as the kill cam sees it: its flight, its picture, alive, its size. */
function ship(): Ship {
  return { flight: { position: new THREE.Vector3(), orientation: new THREE.Quaternion() }, root: new THREE.Object3D(), alive: true, radius: 100 } as unknown as Ship;
}

describe('the kill cam', () => {
  afterEach(() => vi.restoreAllMocks());

  it('glides the ships between the kept frames in slow motion instead of jumping from one to the next', () => {
    const killcam = new KillCam({ beam: () => {} } as unknown as Effects);
    const killer = ship();
    const victim = ship();
    // 20 frames a second for three seconds: the killer flies along x at 1000 units/s and turns about y
    const axis = new THREE.Vector3(0, 1, 0);
    for (let frame = 0; frame <= 60; frame++) {
      const time = frame / 20;
      killer.flight.position.set(time * 1000, 0, 0);
      killer.flight.orientation.setFromAxisAngle(axis, time * 0.5);
      victim.flight.position.set(time * 1000, 0, 5000);
      killcam.record(time, [killer, victim]);
    }
    const clock = vi.spyOn(performance, 'now');
    clock.mockReturnValue(0);
    killcam.start(killer, victim, 3);
    // the replay starts two seconds before the kill, at 2/3 speed: 0.3 s in it shows the frame
    // at 1.2 s, and the moments after it fall between that frame and the next (1.25 s)
    const camera = new THREE.PerspectiveCamera();
    for (const real of [0.3, 0.31, 0.32, 0.335]) {
      clock.mockReturnValue(real * 1000);
      expect(killcam.pose(camera)).toBe(true);
      const shown = 1 + real * (2 / 3);
      expect(killer.root.position.x).toBeCloseTo(shown * 1000, 3);
      expect(killer.root.quaternion.angleTo(new THREE.Quaternion().setFromAxisAngle(axis, shown * 0.5))).toBeLessThan(1e-5);
      killcam.restore();
    }
    // the pictures go back to where the ships are
    expect(killer.root.position.x).toBe(0);
  });

  it('starts the replay after the recording gap of a respawn, never sweeping the ships across it', () => {
    expect(runStartsAt([0, 0.5, 1, 8, 8.5, 9, -Infinity], 1)).toBe(8);
    expect(runStartsAt([3, 2, 1], 1)).toBe(1);
    expect(runStartsAt([-Infinity], 1)).toBe(Infinity);
    const killcam = new KillCam({ beam: () => {} } as unknown as Effects);
    const killer = ship();
    const victim = ship();
    // life one up to 2 s, a gap while the first replay and the sponsor break run, life two from 9 s; killed again at 9.5 s
    const times = [...Array.from({ length: 41 }, (_, i) => i / 20), ...Array.from({ length: 11 }, (_, i) => 9 + i / 20)];
    for (const time of times) {
      killer.flight.position.set(time < 5 ? time * 1000 : 50000, 0, 0);
      killcam.record(time, [killer, victim]);
    }
    const clock = vi.spyOn(performance, 'now');
    clock.mockReturnValue(0);
    killcam.start(killer, victim, 9.5);
    const camera = new THREE.PerspectiveCamera();
    // the first moments of the replay show life two (the first frame since the gap), not a position between the lives
    expect(killcam.pose(camera)).toBe(true);
    expect(killer.root.position.x).toBe(50000);
    killcam.restore();
  });
});
