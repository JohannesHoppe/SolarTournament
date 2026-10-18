import * as THREE from 'three';

const STAR_COUNT = 6000;
const SKY_RADIUS = 300000;
const DUST_COUNT = 1500;
/** Edge length of the dust volume that wraps around the camera. */
const DUST_SIZE = 12000;

const dustVertex = /* glsl */ `
  uniform float size;
  varying float vFade;
  void main() {
    // the dust is fixed in the world; the volume wraps around the camera
    vec3 offset = mod(position - cameraPosition + size * 0.5, size) - size * 0.5;
    vFade = 1.0 - smoothstep(size * 0.25, size * 0.5, length(offset));
    vec4 mvPosition = viewMatrix * vec4(cameraPosition + offset, 1.0);
    gl_PointSize = clamp(1500.0 / -mvPosition.z, 1.0, 3.0);
    gl_Position = projectionMatrix * mvPosition;
  }
`;

const dustFragment = /* glsl */ `
  varying float vFade;
  void main() {
    gl_FragColor = vec4(vec3(0.55, 0.6, 0.7) * vFade, 1.0);
  }
`;
/** Size of the area the sun's shadow map covers, centered on the field. */
const SHADOW_REACH = 140000;
/** Direction towards the sun; it sits in front of the ships at spawn. */
export const SUN_DIRECTION = new THREE.Vector3(0.25, 0.15, -1).normalize();

function radialTexture(stops: [number, string][]): THREE.CanvasTexture {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const gradient = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  for (const [offset, color] of stops) gradient.addColorStop(offset, color);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

/** Star field, sun, nebula glow and lighting. Follows the camera so it is always at infinity. */
export class Space {
  readonly sky = new THREE.Group();
  readonly lights = new THREE.Group();
  /** Fine dust that stays in place, so drift and speed are visible even far from any rock. */
  readonly dust: THREE.Points;

  constructor() {
    const positions = new Float32Array(STAR_COUNT * 3);
    const colors = new Float32Array(STAR_COUNT * 3);
    const color = new THREE.Color();
    const v = new THREE.Vector3();
    for (let i = 0; i < STAR_COUNT; i++) {
      v.set(Math.random() * 2 - 1, Math.random() * 2 - 1, Math.random() * 2 - 1).normalize().multiplyScalar(SKY_RADIUS);
      positions.set([v.x, v.y, v.z], i * 3);
      const brightness = Math.pow(Math.random(), 3) * 0.9 + 0.1;
      color.setHSL(0.55 + Math.random() * 0.15 - (Math.random() < 0.2 ? 0.5 : 0), 0.4, brightness);
      colors.set([color.r, color.g, color.b], i * 3);
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    const stars = new THREE.Points(geometry, new THREE.PointsMaterial({ size: 2, sizeAttenuation: false, vertexColors: true, depthWrite: false }));
    stars.frustumCulled = false;
    this.sky.add(stars);

    const nebulae: [THREE.Vector3, string, number][] = [
      [new THREE.Vector3(-1, 0.3, 0.2), 'rgba(90, 60, 200, 0.35)', 260000],
      [new THREE.Vector3(0.6, -0.5, 0.8), 'rgba(30, 140, 190, 0.28)', 220000],
      [new THREE.Vector3(0.2, 0.9, 0.4), 'rgba(200, 70, 120, 0.18)', 200000],
    ];
    for (const [direction, tint, size] of nebulae) {
      const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
        map: radialTexture([[0, tint], [1, 'rgba(0, 0, 0, 0)']]),
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        fog: false,
      }));
      sprite.position.copy(direction.normalize()).multiplyScalar(SKY_RADIUS * 0.9);
      sprite.scale.setScalar(size);
      this.sky.add(sprite);
    }

    const sun = new THREE.Sprite(new THREE.SpriteMaterial({
      map: radialTexture([[0, '#ffffff'], [0.08, '#fff6d8'], [0.25, 'rgba(255, 200, 120, 0.45)'], [1, 'rgba(255, 140, 60, 0)']]),
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    }));
    sun.position.copy(SUN_DIRECTION).multiplyScalar(SKY_RADIUS * 0.8);
    sun.scale.setScalar(30000);
    this.sky.add(sun);
    this.sky.renderOrder = -1;

    const dustPositions = new Float32Array(DUST_COUNT * 3);
    for (let i = 0; i < dustPositions.length; i++) dustPositions[i] = Math.random() * DUST_SIZE;
    const dustGeometry = new THREE.BufferGeometry();
    dustGeometry.setAttribute('position', new THREE.BufferAttribute(dustPositions, 3));
    this.dust = new THREE.Points(dustGeometry, new THREE.ShaderMaterial({
      uniforms: { size: { value: DUST_SIZE } },
      vertexShader: dustVertex,
      fragmentShader: dustFragment,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      transparent: true,
    }));
    this.dust.frustumCulled = false;

    // The asteroids cast shadows over the whole field; a ship in their shadow goes dark.
    const sunLight = new THREE.DirectionalLight(0xfff0dd, 3.2);
    sunLight.position.copy(SUN_DIRECTION).multiplyScalar(SHADOW_REACH);
    sunLight.castShadow = true;
    sunLight.shadow.mapSize.set(4096, 4096);
    sunLight.shadow.bias = -0.0004;
    sunLight.shadow.normalBias = 40;
    Object.assign(sunLight.shadow.camera, {
      left: -SHADOW_REACH * 0.5,
      right: SHADOW_REACH * 0.5,
      top: SHADOW_REACH * 0.5,
      bottom: -SHADOW_REACH * 0.5,
      near: 1000,
      far: SHADOW_REACH * 2,
    });
    sunLight.shadow.camera.updateProjectionMatrix();
    this.lights.add(sunLight, sunLight.target);
    this.lights.add(new THREE.HemisphereLight(0x7788bb, 0x2a201c, 1.6));
  }

  follow(camera: THREE.Camera) {
    this.sky.position.copy(camera.position);
  }
}
