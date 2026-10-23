import * as THREE from 'three';

/** A canvas to draw a texture on (square without a height), with its 2D context. */
export function canvas(width: number, height = width): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const element = document.createElement('canvas');
  element.width = width;
  element.height = height;
  return [element, element.getContext('2d')!];
}

/** A drawn canvas as a color texture. */
export function toTexture(element: HTMLCanvasElement): THREE.CanvasTexture {
  const texture = new THREE.CanvasTexture(element);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

/** A round glow fading to transparent black, colored by the gradient stops. */
export function radialTexture(stops: [number, string][], size = 256): THREE.CanvasTexture {
  const [element, ctx] = canvas(size);
  const gradient = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  for (const [offset, color] of stops) gradient.addColorStop(offset, color);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);
  return toTexture(element);
}

/** Particle of fire and sparks: white-hot core, soft falloff. Rendered additively. */
export function sparkTexture(): THREE.CanvasTexture {
  return radialTexture([
    [0, '#ffffff'],
    [0.15, '#fff1d0'],
    [0.4, 'rgba(255, 190, 120, 0.45)'],
    [1, 'rgba(0, 0, 0, 0)'],
  ], 128);
}

/** Particle of smoke and vapor: a lumpy puff made of overlapping soft blobs. */
export function smokeTexture(): THREE.CanvasTexture {
  const size = 128;
  const [element, ctx] = canvas(size);
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, size, size);
  ctx.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 14; i++) {
    const angle = Math.random() * Math.PI * 2;
    const distance = Math.random() * size * 0.12;
    const x = size / 2 + Math.cos(angle) * distance;
    const y = size / 2 + Math.sin(angle) * distance;
    // blobs stay inside the canvas, so the puff never shows a square edge; together they stay
    // below full white, so the center never clips into a flat disc with a hard rim
    const radius = size * (0.16 + Math.random() * 0.14);
    const gradient = ctx.createRadialGradient(x, y, 0, x, y, radius);
    gradient.addColorStop(0, 'rgba(255, 255, 255, 0.07)');
    gradient.addColorStop(0.5, 'rgba(255, 255, 255, 0.03)');
    gradient.addColorStop(1, 'rgba(255, 255, 255, 0)');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, size, size);
  }
  return toTexture(element);
}

let runningLightTexture: THREE.DataTexture | null = null;

/**
 * A running light along a strip (u runs along it, the texture repeats): the tube glows at 60 %,
 * one pulse rises to full with a short front and a long tail behind it, a light chasing on.
 * Made once and shared; a ship moves its own clone (see Ship.outfit).
 */
export function runningLight(): THREE.DataTexture {
  if (runningLightTexture) return runningLightTexture;
  const width = 64;
  const data = new Uint8Array(width * 4);
  for (let i = 0; i < width; i++) {
    // the pulse's head at 3/4 of the period: ahead of it the short front, behind it the tail
    const d = i / width - 0.75;
    const pulse = d > 0 ? Math.exp(-((d / 0.04) ** 2)) : Math.exp(d / 0.12);
    const value = Math.round(255 * (0.6 + 0.4 * pulse));
    data.set([value, value, value, 255], i * 4);
  }
  runningLightTexture = new THREE.DataTexture(data, width, 1);
  runningLightTexture.wrapS = THREE.RepeatWrapping;
  runningLightTexture.magFilter = runningLightTexture.minFilter = THREE.LinearFilter;
  runningLightTexture.needsUpdate = true;
  return runningLightTexture;
}
