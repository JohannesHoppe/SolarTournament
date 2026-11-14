import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { ARENAS, sternAt } from './arenas';
import { Derelict, JET_WELDS, mistDensity } from './derelict';
import { testField } from '../test/field';
import { HULL_BOXES, HULL_PAINT } from './shapes';
import { stencilable } from '../view/lettering';
import { quaternionAngleTo } from '../detthree';

describe('the derelict', () => {
  it('lets its mist escape from both torn ends into the gap, thick on the jets and nowhere else', () => {
    // just off each torn end, on its jet's axis
    expect(mistDensity(new THREE.Vector3(-13000, 0, 0))).toBeGreaterThan(0.5);
    const stern = new THREE.Vector3(...sternAt(8000), 3000);
    expect(mistDensity(stern)).toBeGreaterThan(0.5);
    // inside the hull behind a torn end, far off to the side, and far beyond the jets' reach
    expect(mistDensity(new THREE.Vector3(-20000, 0, 0))).toBe(0);
    expect(mistDensity(new THREE.Vector3(-10000, 0, 8000))).toBe(0);
    expect(mistDensity(new THREE.Vector3(-30000, 0, 0))).toBe(0);
    expect(mistDensity(new THREE.Vector3(0, 20000, 0))).toBe(0);
  });

  it('lets the mist follow its half of the hull when a comet shoves it', () => {
    const field = testField();
    field.generate(ARENAS.find((arena) => arena.id === 'derelict')!.layout);
    const wreck = new Derelict(new THREE.Color(1, 1, 1));
    const motions = JET_WELDS.map(() => new THREE.Matrix4());
    const settle = () => {
      JET_WELDS.forEach((weld, i) => expect(field.weldMotion(weld, motions[i])).toBe(true));
      wreck.moveJets(motions);
    };
    settle();
    const start = wreck.jets.map((jet) => jet.from.clone());
    expect(start[0].distanceTo(new THREE.Vector3(-14200, 0, 0))).toBeLessThan(1e-6);
    // a comet strikes the bow: the whole half drifts on at 171 units/s for two minutes
    const hull = [...field.asteroids.values()].find((rock) => rock.weld === 0)!;
    field.shove(hull.id, 0, new THREE.Vector3(0, 0, 171), new THREE.Vector3(0, 1, 0), 0, 3);
    field.setClock(120);
    settle();
    expect(wreck.jets[0].from.distanceTo(start[0].clone().add(new THREE.Vector3(0, 0, 171 * 120)))).toBeLessThan(1);
    expect(wreck.jets[1].from.distanceTo(start[1])).toBeLessThan(1e-6);
    // the mist thickens at the end where it is now and is gone from where it was
    expect(wreck.mistAt(wreck.jets[0].from.clone().add(new THREE.Vector3(1200, 0, 0)))).toBeGreaterThan(0.5);
    expect(wreck.mistAt(new THREE.Vector3(-13000, 0, 0))).toBe(0);
  });

  it('mixes the instance color into the dead\'s vertex color by their clothes: the skin stays bare', () => {
    const wreck = new Derelict(new THREE.Color(1, 1, 1));
    const mesh = wreck.group.children.find((child): child is THREE.InstancedMesh => child instanceof THREE.InstancedMesh)!;
    const material = mesh.material as THREE.MeshStandardMaterial;
    // the shader as three hands it over: the includes are not resolved yet
    const shader = { vertexShader: '#include <common>\n#include <color_vertex>\nvoid main() {}', fragmentShader: '' } as unknown as Parameters<typeof material.onBeforeCompile>[0];
    material.onBeforeCompile(shader, {} as THREE.WebGLRenderer);
    expect(shader.vertexShader).toContain('attribute float cloth;');
    expect(shader.vertexShader).toContain('mix(vec3(1.0), instanceColor.rgb, cloth)');
  });

  it('keeps its dead drifting and turning slowly about the breaches, never wandering off', () => {
    const wreck = new Derelict(new THREE.Color(1, 1, 1));
    const mouths = [0, 1].map((b) => wreck.mouth(b, new THREE.Vector3()));
    const at = (i: number) => wreck.deadAt(i, new THREE.Vector3());
    const turn = (i: number) => wreck.deadTurn(i, new THREE.Quaternion());
    let moving = 0;
    for (const time of [0, 100, 1000, 10000]) {
      wreck.update(time);
      const before = Array.from({ length: wreck.count }, (_, i) => ({ at: at(i), turn: turn(i) }));
      wreck.update(time + 10);
      for (let i = 0; i < wreck.count; i++) {
        const now = at(i);
        // within 1.1 km of a breach's mouth
        expect(Math.min(...mouths.map((mouth) => now.distanceTo(mouth)))).toBeLessThan(22000);
        // drifting at no more than 0.25 m/s, turning at no more than 0.12 rad/s
        const moved = now.distanceTo(before[i].at);
        expect(moved).toBeLessThan(50);
        expect(quaternionAngleTo(turn(i), before[i].turn)).toBeLessThan(1.21);
        // but moving: a gentle drift or tumble to be seen
        if (moved > 0.1 || quaternionAngleTo(turn(i), before[i].turn) > 0.01) moving++;
      }
    }
    expect(moving).toBe(wreck.count * 4);
  });

  it('keeps its dead thickest at the breaches, thinning out with the distance, a few far out, none in the hull but the caught', () => {
    const wreck = new Derelict(new THREE.Color(1, 1, 1));
    expect(wreck.count).toBeGreaterThanOrEqual(180);
    const pieces = ARENAS.find((arena) => arena.id === 'derelict')!.layout.placements!;
    const boxes = pieces.map((piece) => ({ piece, inverse: piece.orientation.clone().invert(), half: HULL_BOXES[piece.type].clone().multiplyScalar(piece.scale) }));
    const local = new THREE.Vector3();
    const inside = (at: THREE.Vector3) => boxes.filter(({ piece, inverse, half }) => (local.subVectors(at, piece.position).applyQuaternion(inverse), Math.abs(local.x) < half.x && Math.abs(local.y) < half.y && Math.abs(local.z) < half.z));
    // how far from a torn section's box, whose open end is the breach (0 within it)
    const fromTorn = (at: THREE.Vector3) =>
      Math.min(
        ...boxes
          .filter(({ piece }) => piece.type === 1)
          .map(({ piece, inverse, half }) => {
            local.subVectors(at, piece.position).applyQuaternion(inverse);
            return new THREE.Vector3(Math.max(0, Math.abs(local.x) - half.x), Math.max(0, Math.abs(local.y) - half.y), Math.max(0, Math.abs(local.z) - half.z)).length();
          }),
      );
    const bands = [0, 0, 0, 0];
    const at = new THREE.Vector3();
    for (let i = 0; i < wreck.count; i++) {
      wreck.deadAt(i, at);
      const distance = fromTorn(at);
      bands[distance < 1200 ? 0 : distance < 3000 ? 1 : distance < 6000 ? 2 : 3]++;
      // only the caught lie in a box of the hull, and only in a torn section's
      for (const { piece } of inside(at)) expect(piece.type).toBe(1);
    }
    // most within 60 m of a breach, thinning out, and a few far out
    expect(bands[0]).toBeGreaterThan(wreck.count / 2);
    expect(bands[0]).toBeGreaterThan(bands[1]);
    expect(bands[1]).toBeGreaterThan(bands[3] / 2);
    expect(bands[3]).toBeGreaterThanOrEqual(5);
  });

  it('hands the GPU only the dead it would see: the nearest few whole, the rest low, none under a pixel', () => {
    const wreck = new Derelict(new THREE.Color(1, 1, 1));
    wreck.setViewport(1080);
    wreck.update(10);
    const camera = new THREE.PerspectiveCamera(70, 16 / 9, 1, 1e7);
    const meshes = wreck.group.children.filter((child): child is THREE.InstancedMesh => child instanceof THREE.InstancedMesh);
    const drawn = () => meshes.reduce((sum, mesh) => sum + (mesh.visible ? mesh.count : 0), 0);
    const triangles = () => meshes.reduce((sum, mesh) => sum + (mesh.visible ? mesh.count * (mesh.geometry.getAttribute('position').count / 3) : 0), 0);
    // right at the bow's mouth: at most sixteen whole figures (the code's stand in for them in Node), every other body as the low figure
    camera.position.copy(wreck.mouth(0, new THREE.Vector3()));
    camera.updateMatrixWorld();
    wreck.draw(camera);
    const whole = wreck.meshes.reduce((sum, mesh) => sum + mesh.count, 0);
    expect(whole).toBeGreaterThan(0);
    expect(whole).toBeLessThanOrEqual(16);
    expect(drawn()).toBeGreaterThan(wreck.count / 2);
    expect(triangles()).toBeLessThan(80000);
    // 50 km off, every body is less than a pixel high: none drawn
    camera.position.set(0, 0, 1e6);
    wreck.draw(camera);
    expect(drawn()).toBe(0);
  });

  it('lets a ship knock one of its dead away as the far heavier body: the body flies off at twice the closing speed, the ship keeps its speed', () => {
    const wreck = new Derelict(new THREE.Color(1, 1, 1));
    wreck.update(10);
    // one with none of the others within the ship's reach, so the ship meets it alone
    const others = Array.from({ length: wreck.count }, (_, i) => wreck.deadAt(i, new THREE.Vector3()));
    const alone = others.findIndex((at, i) => others.every((other, j) => j === i || other.distanceTo(at) > 1500));
    const body = wreck.deadAt(alone, new THREE.Vector3());
    // a ship of hit radius 300 units closing at 150 m/s (3000 units/s) along x, just touching it
    const position = body.clone().add(new THREE.Vector3(-310, 0, 0));
    const velocity = new THREE.Vector3(3000, 0, 0);
    expect(wreck.meet(position, velocity, 300, 10)).toBeCloseTo(3000, 6);
    // the ship loses the body's share: about 0.3 % (90 kg against 60 t)
    expect(velocity.x).toBeGreaterThan(2990);
    expect(velocity.x).toBeLessThan(3000);
    // the body leaves at about twice the closing speed along the line between them
    wreck.update(11);
    const flown = wreck.deadAt(alone, new THREE.Vector3()).sub(body);
    expect(flown.x).toBeGreaterThan(5900);
    expect(flown.x).toBeLessThan(6001);
    // once away it is not met again by a ship flying on behind it
    expect(wreck.meet(position.addScaledVector(velocity, 1), velocity, 300, 11)).toBe(0);
    // a new round (the field's clock run back) finds it where it drifted before
    wreck.update(5);
    wreck.update(10);
    expect(wreck.deadAt(alone, new THREE.Vector3()).distanceTo(body)).toBeLessThan(1e-6);
  });

  it('paints its name, motto and registry only in letters its stencil has', () => {
    for (const lettering of Object.values(HULL_PAINT)) {
      expect(stencilable(`${lettering.name ?? ''}${lettering.registry ?? ''}`)).toBe(true);
    }
    expect(HULL_PAINT[5].name).toBe('PER ASPERA');
    expect(HULL_PAINT[7].name).toBe('AD ASTRA');
  });
});
