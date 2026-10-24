import { expect, test } from '@playwright/test';

/**
 * A rock shades alike however it is drawn: the belt draws its rocks instanced, the field as
 * meshes of their own, and the baked normal map (world/rocks, applyRockRelief) must turn with
 * the instance as it turns with the mesh. The same rock, turned the same way, rendered both ways
 * in the test browser, gives the same picture.
 */
test('a rock drawn as an instance shades as the same rock drawn as a mesh', async ({ page }) => {
  await page.goto('/radio.html');
  const result = await page.evaluate(async () => {
    // three.js from the very URL the rock module imports it from, so both share one copy
    const source = await (await fetch('/src/world/rocks.ts')).text();
    const threeUrl = source.match(/from\s+["']([^"']*\/three\.js[^"']*)["']/)![1];
    const THREE = (await import(threeUrl)) as typeof import('three');
    const rocksModule: string = '/src/world/rocks.ts';
    const { createRocks, NEAR_DETAIL } = (await import(rocksModule)) as typeof import('../src/world/rocks');
    const rock = createRocks(NEAR_DETAIL)[3];
    const size = 128;
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = size;
    const renderer = new THREE.WebGLRenderer({ canvas, preserveDrawingBuffer: true });
    const turn = new THREE.Quaternion().setFromEuler(new THREE.Euler(1.1, 2.3, 0.4));
    rock.geometry.computeBoundingSphere();
    const camera = new THREE.PerspectiveCamera(40, 1, 1, 1e6);
    camera.position.set(0, 0, rock.geometry.boundingSphere!.radius * 3.2);
    camera.lookAt(0, 0, 0);
    const shot = (object: InstanceType<typeof THREE.Object3D>) => {
      const scene = new THREE.Scene();
      const sun = new THREE.DirectionalLight(0xffffff, 3);
      sun.position.set(1, 0.5, 0.3);
      scene.add(sun, object);
      renderer.render(scene, camera);
      const gl = renderer.getContext();
      const pixels = new Uint8Array(size * size * 4);
      gl.readPixels(0, 0, size, size, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
      return pixels;
    };
    const mesh = rock.clone();
    mesh.quaternion.copy(turn);
    const instanced = new THREE.InstancedMesh(rock.geometry, rock.material, 1);
    instanced.setMatrixAt(0, new THREE.Matrix4().compose(new THREE.Vector3(), turn, new THREE.Vector3(1, 1, 1)));
    const a = shot(mesh), b = shot(instanced);
    renderer.dispose();
    let difference = 0, lit = 0;
    for (let i = 0; i < a.length; i += 4) {
      difference += Math.abs(a[i] - b[i]) + Math.abs(a[i + 1] - b[i + 1]) + Math.abs(a[i + 2] - b[i + 2]);
      if (a[i] + a[i + 1] + a[i + 2] > 30) lit++;
    }
    return { lit, difference: difference / Math.max(1, lit) };
  });
  // the rock fills a good part of the picture, and the two pictures agree to a few levels per lit pixel
  expect(result.lit).toBeGreaterThan(500);
  expect(result.difference).toBeLessThan(3);
});
