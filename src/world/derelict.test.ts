import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { ARENAS, sternAt } from './arenas';
import { Derelict, JET_WELDS, mistDensity } from './derelict';
import { testField } from '../test/field';
import { HULL_PAINT } from './shapes';
import { FALL_STEP, FreeFall, hullClearance, METERS } from './wreckgravity';
import { WRECK_ORBITS, WRECK_ORBITS_DAYS } from './wreckorbits';
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

  it('hangs its caught dead still where they snagged, and lets the rest fall slowly about the wreck, tumbling', () => {
    const wreck = new Derelict(new THREE.Color(1, 1, 1));
    const at = (i: number) => wreck.deadAt(i, new THREE.Vector3());
    const turn = (i: number) => wreck.deadTurn(i, new THREE.Quaternion());
    const all = Array.from({ length: wreck.count }, (_, i) => i);
    const free = all.filter((i) => wreck.falls(i));
    // most of them caught at the breaches, a few dozen falling free
    expect(wreck.count - free.length).toBeGreaterThan((wreck.count * 2) / 3);
    expect(free.length).toBe(WRECK_ORBITS.length);
    for (const time of [0, 100, 1000, 3000]) {
      wreck.update(time);
      const before = all.map((i) => ({ at: at(i), turn: turn(i) }));
      wreck.update(time + 10);
      for (const i of all) {
        const moved = at(i).distanceTo(before[i].at);
        const turned = quaternionAngleTo(turn(i), before[i].turn);
        if (wreck.falls(i)) {
          // slower than 0.15 m/s, yet moving, and tumbling at up to 0.12 rad/s
          expect(moved).toBeLessThan(30);
          expect(moved).toBeGreaterThan(0.05);
          expect(turned).toBeGreaterThan(0.02);
          expect(turned).toBeLessThan(1.21);
        } else {
          expect(at(i).toArray()).toEqual(before[i].at.toArray());
          expect(turn(i).toArray()).toEqual(before[i].turn.toArray());
        }
      }
    }
  });

  it('falls every free one from a stored start state, bound and clear of the hull for three days of field time; hangs the caught on the hull', () => {
    const wreck = new Derelict(new THREE.Color(1, 1, 1));
    let free = 0;
    for (let i = 0; i < wreck.count; i++) {
      const fall = wreck.fallOf(i);
      if (!fall) {
        // on the hull: within its box, or just out of the mouth
        expect(hullClearance(wreck.deadAt(i, new THREE.Vector3()).multiplyScalar(METERS))).toBeLessThan(10);
        continue;
      }
      free++;
      // the search kept each a year (see tools/derelict); three days of it here, every step looked at
      const body = new FreeFall(fall.start, fall.speed);
      const energy = body.energy();
      expect(energy).toBeLessThan(0);
      for (let t = 0; t < 3 * 86400; t += FALL_STEP) {
        body.advance();
        const off = hullClearance(body.position);
        expect(off).toBeGreaterThanOrEqual(20);
        expect(off).toBeLessThanOrEqual(2000);
      }
      expect(Math.abs(body.energy() - energy) / Math.abs(energy)).toBeLessThan(1e-5);
    }
    expect(free).toBe(WRECK_ORBITS.length);
    expect(WRECK_ORBITS_DAYS).toBeGreaterThanOrEqual(30);
  });


  it('finds its dead alike however the frames fall, after a snapshot taken halfway and in a new round', () => {
    const framed = new Derelict(new THREE.Color(1, 1, 1));
    for (let t = 0; t <= 300; t += 0.0161 + (t % 0.03)) framed.update(t);
    framed.update(300);
    const joined = new Derelict(new THREE.Color(1, 1, 1));
    joined.update(150);
    joined.update(300);
    const again = new Derelict(new THREE.Color(1, 1, 1));
    again.update(300);
    again.update(0);
    again.update(300);
    for (let i = 0; i < framed.count; i++) {
      const there = framed.deadAt(i, new THREE.Vector3()).toArray();
      expect(joined.deadAt(i, new THREE.Vector3()).toArray()).toEqual(there);
      expect(again.deadAt(i, new THREE.Vector3()).toArray()).toEqual(there);
    }
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
