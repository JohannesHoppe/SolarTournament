import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { screenVertex } from './corona';

describe('the corona\'s full-screen quads', () => {
  it('rebuild a pixel\'s ray from an off-center frustum, as the solo plate\'s preview has it', () => {
    const camera = new THREE.PerspectiveCamera(60, 16 / 9, 1, 1e6);
    const width = 1600;
    const height = 900;
    const shift = 0.3 * width;
    camera.setViewOffset(width + 2 * shift, height, 2 * shift, 0, width, height);
    camera.updateProjectionMatrix();
    const te = camera.projectionMatrix.elements;
    expect(te[8]).not.toBe(0);
    // the shader's ray for a pixel at NDC (x, y), then projected again, lands on the same pixel
    for (const [x, y] of [[-0.6, 0.2], [0, 0], [0.9, -0.7]]) {
      const ray = new THREE.Vector3((x + te[8]) / te[0], (y + te[9]) / te[5], -1);
      const ndc = ray.clone().applyMatrix4(camera.projectionMatrix);
      expect(ndc.x).toBeCloseTo(x, 6);
      expect(ndc.y).toBeCloseTo(y, 6);
    }
    // and the shader says so
    const source = screenVertex(1);
    expect(source).toContain('(position.x + projectionMatrix[2][0]) / projectionMatrix[0][0]');
    expect(source).toContain('(position.y + projectionMatrix[2][1]) / projectionMatrix[1][1]');
  });
});
