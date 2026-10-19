import * as THREE from 'three';

function canvas(size: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const element = document.createElement('canvas');
  element.width = element.height = size;
  return [element, element.getContext('2d')!];
}

function toTexture(element: HTMLCanvasElement): THREE.CanvasTexture {
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
