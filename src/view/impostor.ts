import * as THREE from 'three';

/**
 * A billboard for a shape seen from far away: a camera-facing quad showing one of a few
 * pre-rendered views, picked by how the shape (which keeps turning: a field rock spins, a
 * belt rock stands at a fixed random turn) is actually turned now, so the right view keeps
 * showing however it turns. Used for the belt's rocks (one draw call per shape, instanced) and
 * for the farthest LOD level of the field's rocks and ice (see world/asteroids, world/rocks).
 * Lit from its own baked, object-space normal (see world/rocks), so its shading tracks the real
 * sun (and a solar flare) instead of being baked in and going stale as the shape turns.
 */

/** How many fixed directions a shape is pre-rendered from (see directions()). */
export const IMPOSTOR_VIEWS = 8;

/** The 8 corners of a cube, normalized: a simple, even spread of view directions. */
export function impostorDirections(): THREE.Vector3[] {
  const directions: THREE.Vector3[] = [];
  for (const x of [-1, 1]) for (const y of [-1, 1]) for (const z of [-1, 1]) directions.push(new THREE.Vector3(x, y, z).normalize());
  return directions;
}

/** The fixed view directions as a GLSL array literal, so the shader picks among the same ones the atlas was baked from. */
function directionsGLSL(): string {
  const entries = impostorDirections().map((d) => `vec3(${d.x.toFixed(6)}, ${d.y.toFixed(6)}, ${d.z.toFixed(6)})`);
  return `const vec3 VIEW_DIRECTIONS[${IMPOSTOR_VIEWS}] = vec3[${IMPOSTOR_VIEWS}](${entries.join(', ')});`;
}

const vertexShader = /* glsl */ `
#include <common>
uniform float radius;
varying vec2 vUv;
varying float vTile;
varying vec3 vBasisRight;
varying vec3 vBasisUp;
varying vec3 vBasisForward;

${directionsGLSL()}

void main() {
  #ifdef USE_INSTANCING
    mat4 world = modelMatrix * instanceMatrix;
  #else
    mat4 world = modelMatrix;
  #endif
  vec3 center = world[3].xyz;
  float objectScale = length( world[0].xyz );
  vec3 right = world[0].xyz / objectScale;
  vec3 up = world[1].xyz / objectScale;
  vec3 forward = world[2].xyz / objectScale;
  vBasisRight = right;
  vBasisUp = up;
  vBasisForward = forward;

  // the view direction in the shape's own (turning) frame picks which baked view to show
  vec3 toCamera = normalize( cameraPosition - center );
  vec3 localView = vec3( dot( toCamera, right ), dot( toCamera, up ), dot( toCamera, forward ) );
  float best = -2.0;
  float tile = 0.0;
  for ( int i = 0; i < ${IMPOSTOR_VIEWS}; i++ ) {
    float d = dot( localView, VIEW_DIRECTIONS[ i ] );
    if ( d > best ) {
      best = d;
      tile = float( i );
    }
  }
  vTile = tile;

  // the billboard itself always faces the camera, independent of the shape's own turn
  vec3 camRight = vec3( viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0] );
  vec3 camUp = vec3( viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1] );
  vec3 worldPosition = center + ( camRight * position.x + camUp * position.y ) * objectScale;
  vUv = position.xy / radius * 0.5 + 0.5;

  gl_Position = projectionMatrix * viewMatrix * vec4( worldPosition, 1.0 );
}
`;

const fragmentShader = /* glsl */ `
#include <common>
uniform sampler2D albedoAtlas;
uniform sampler2D normalAtlas;
uniform float inset;
uniform vec3 sunDirection;
uniform vec3 sunColor;
uniform vec3 skyColor;
uniform vec3 groundColor;

varying vec2 vUv;
varying float vTile;
varying vec3 vBasisRight;
varying vec3 vBasisUp;
varying vec3 vBasisForward;

void main() {
  vec2 uv = clamp( vUv, inset, 1.0 - inset );
  vec2 atlasUv = vec2( ( vTile + uv.x ) / float( ${IMPOSTOR_VIEWS} ), uv.y );
  vec4 albedo = texture2D( albedoAtlas, atlasUv );
  if ( albedo.a < 0.5 ) discard;
  vec3 local = texture2D( normalAtlas, atlasUv ).xyz * 2.0 - 1.0;
  vec3 normal = normalize( local.x * vBasisRight + local.y * vBasisUp + local.z * vBasisForward );
  float diffuse = max( dot( normal, sunDirection ), 0.0 );
  vec3 ambient = mix( groundColor, skyColor, normal.y * 0.5 + 0.5 );
  vec3 outgoingLight = albedo.rgb * ( ambient + sunColor * diffuse );
  gl_FragColor = vec4( outgoingLight, 1.0 );

  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

/**
 * Shared by every impostor material, so Space (see its constructor, setSun, flare) sets and
 * updates the sun for all of them at once; a placeholder direction until Space does, which
 * happens before the first frame.
 */
export const IMPOSTOR_SUN = {
  direction: { value: new THREE.Vector3(0, 1, 0) },
  color: { value: new THREE.Color(0xfff0dd).multiplyScalar(0.9) },
  sky: { value: new THREE.Color(0x7788bb).multiplyScalar(0.5) },
  ground: { value: new THREE.Color(0x2a201c).multiplyScalar(0.5) },
};

/**
 * A quad spanning `radius` world units on each side, in its own local XY plane (the vertex
 * shader ignores its transform's rotation and always faces the camera; only its translation
 * and uniform scale matter, taken from modelMatrix or, instanced, modelMatrix * instanceMatrix).
 */
export function impostorGeometry(radius: number): THREE.BufferGeometry {
  const geometry = new THREE.PlaneGeometry(radius * 2, radius * 2);
  geometry.deleteAttribute('normal');
  geometry.deleteAttribute('uv');
  geometry.computeBoundingSphere();
  return geometry;
}

/** A billboard material for one shape: `albedo` (rgb + silhouette alpha) and `normal` (object-space, encoded) are atlases of IMPOSTOR_VIEWS tiles (see world/rocks, bakeImpostorAtlas). */
export function impostorMaterial(albedo: THREE.Texture, normal: THREE.Texture, atlasResolution: number, radius: number): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: {
      albedoAtlas: { value: albedo },
      normalAtlas: { value: normal },
      inset: { value: 0.5 / atlasResolution },
      radius: { value: radius },
      sunDirection: IMPOSTOR_SUN.direction,
      sunColor: IMPOSTOR_SUN.color,
      skyColor: IMPOSTOR_SUN.sky,
      groundColor: IMPOSTOR_SUN.ground,
    },
    vertexShader,
    fragmentShader,
    // the custom billboard transform can flip winding depending on the view angle
    side: THREE.DoubleSide,
  });
}
