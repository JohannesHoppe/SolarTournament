import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import * as THREE from 'three';

/**
 * The bloom, at a share of the picture's resolution (see Look.bloom in view/quality). Its
 * glow is soft anyway: at half the resolution its passes fill a quarter of the pixels and the
 * glow looks nearly the same. It blends onto the picture at full resolution.
 */
/** What glows: the luminance (linear, before the tone mapping) above which a pixel spills its light into the bloom. */
export const BLOOM_THRESHOLD = 0.88;

export class Bloom extends UnrealBloomPass {
  private scale = 1;
  private readonly full = new THREE.Vector2(1, 1);

  setScale(scale: number) {
    this.scale = scale;
    this.enabled = scale > 0;
    if (scale > 0) this.setSize(this.full.x, this.full.y);
  }

  setSize(width: number, height: number) {
    this.full.set(width, height);
    super.setSize(Math.max(1, Math.round(width * this.scale)), Math.max(1, Math.round(height * this.scale)));
  }
}
