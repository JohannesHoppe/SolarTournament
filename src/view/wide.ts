import * as THREE from 'three';

/**
 * Lines of the flight computer's projection a few pixels wide (GL draws its own lines one pixel
 * wide at most): each segment is a quad turned to face the screen, LINE_PIXELS CSS pixels
 * across whatever the picture's resolution. A segment reaching behind the camera is cut at the
 * near plane first, so a grid around the ship never smears across the view.
 */
export const LINE_PIXELS = 3;

/** The picture's size in device pixels and the lines' width in them, set once a frame (see setWideLines); every wide line reads them. */
export const WIDE = {
  resolution: { value: new THREE.Vector2(1, 1) },
  lineWidth: { value: LINE_PIXELS },
};

/** The picture is `width` × `height` CSS pixels at `ratio` device pixels each. */
export function setWideLines(width: number, height: number, ratio: number) {
  WIDE.resolution.value.set(width * ratio, height * ratio);
  WIDE.lineWidth.value = LINE_PIXELS * ratio;
}

/**
 * The vertex shader of a wide line: hands the fragment shader `vWorld`, the world point along
 * the segment, as a thin line's vertex shader does.
 */
export const WIDE_VERTEX = /* glsl */ `
  uniform vec2 resolution;
  uniform float lineWidth;
  attribute vec3 instanceStart;
  attribute vec3 instanceEnd;
  varying vec3 vWorld;
  void main() {
    vec4 worldA = modelMatrix * vec4(instanceStart, 1.0);
    vec4 worldB = modelMatrix * vec4(instanceEnd, 1.0);
    vec4 a = viewMatrix * worldA;
    vec4 b = viewMatrix * worldB;
    // the near plane, from the projection (a perspective camera's)
    float near = -0.5 * projectionMatrix[3][2] / projectionMatrix[2][2];
    if (a.z > near && b.z > near) {
      gl_Position = vec4(0.0, 0.0, 2.0, 1.0);
      return;
    }
    // the end behind the camera moved onto the near plane along the segment
    if (a.z > near) {
      float t = (near - b.z) / (a.z - b.z);
      a = mix(b, a, t);
      worldA = mix(worldB, worldA, t);
    } else if (b.z > near) {
      float t = (near - a.z) / (b.z - a.z);
      b = mix(a, b, t);
      worldB = mix(worldA, worldB, t);
    }
    vec4 clipA = projectionMatrix * a;
    vec4 clipB = projectionMatrix * b;
    vec2 screenA = clipA.xy / clipA.w * resolution;
    vec2 screenB = clipB.xy / clipB.w * resolution;
    vec2 along = screenB - screenA;
    vec2 dir = dot(along, along) > 1e-6 ? normalize(along) : vec2(1.0, 0.0);
    // across the segment on screen, scaled back to the frame's units (x and y in NDC differ by the aspect)
    vec2 normal = vec2(-dir.y, dir.x);
    bool end = position.y > 0.5;
    vec4 clip = end ? clipB : clipA;
    // half the width each side; the ends stay where they are, so joined segments never overlap
    // and brighten where they meet (the lines blend additively)
    vec2 offset = normal * position.x * lineWidth / resolution;
    clip.xy += offset * clip.w;
    gl_Position = clip;
    vWorld = (end ? worldB : worldA).xyz;
  }
`;

/** The corners of a segment's quad: across (-1, 1) and along (0 at its start, 1 at its end). */
const QUAD = [-1, 0, 0, 1, 0, 0, -1, 1, 0, 1, 1, 0];
const QUAD_INDEX = [0, 1, 2, 2, 1, 3];

/**
 * Room for `segments` wide segments: their starts and ends as instance attributes, written by
 * the owner; `dynamic` for ones rewritten every frame. Draws `instanceCount` of them.
 */
export function wideSegments(segments: number, dynamic = false): { geometry: THREE.InstancedBufferGeometry; starts: THREE.InstancedBufferAttribute; ends: THREE.InstancedBufferAttribute } {
  const geometry = new THREE.InstancedBufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(QUAD, 3));
  geometry.setIndex(QUAD_INDEX);
  const starts = new THREE.InstancedBufferAttribute(new Float32Array(segments * 3), 3);
  const ends = new THREE.InstancedBufferAttribute(new Float32Array(segments * 3), 3);
  if (dynamic) for (const attribute of [starts, ends]) attribute.setUsage(THREE.DynamicDrawUsage);
  geometry.setAttribute('instanceStart', starts);
  geometry.setAttribute('instanceEnd', ends);
  geometry.instanceCount = segments;
  return { geometry, starts, ends };
}
