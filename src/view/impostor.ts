import * as THREE from 'three';
import { tangentDirections } from '../world/surface';

/**
 * A billboard for a shape seen from far away: a camera-facing quad showing a few pre-rendered
 * views, picked by how the shape (which keeps turning: a field rock spins, a belt rock stands at
 * a fixed random turn) is actually turned now, so the right side keeps showing however it turns.
 * Used for the belt's rocks (one draw call per shape, instanced) and for the farthest LOD level
 * of the field's rocks and ice (see world/asteroids, world/rocks).
 *
 * A view does not hold colors: each of its cells holds where on the shape its ray meets the
 * surface (the direction the shape's relief map is read in, see world/rocks) and how far inside
 * or outside the silhouette it lies. The billboard reads the shape's own relief map there, the
 * very map its meshes read, and paints it with the meshes' own code; so it shows their colors,
 * their normals and their mipmaps' calm, lit by the same sun and sky as they are.
 */

/** How many fixed directions a shape is pre-rendered from (see impostorViews). */
export const IMPOSTOR_VIEWS = 8;

/**
 * How close (in the cosine between the direction to the camera and a view) another view must
 * come to the nearest one to be blended in: about 12° either side of where two views meet, so a
 * turning shape fades from one view to the next instead of jumping. Never more than four views
 * come this close (four only towards a face of the cube; the fifth always lies far behind).
 */
export const IMPOSTOR_BLEND = 0.25;

/** A pre-rendered view: the direction it looks from (out of the shape) and the axes across it, right × up = direction, as a camera's. */
export interface ImpostorView {
  direction: THREE.Vector3;
  right: THREE.Vector3;
  up: THREE.Vector3;
}

/** The 8 corners of a cube, normalized: a simple, even spread of view directions, each with its axes across it. */
export function impostorViews(): ImpostorView[] {
  const views: ImpostorView[] = [];
  for (const x of [-1, 1]) {
    for (const y of [-1, 1]) {
      for (const z of [-1, 1]) {
        const view = { direction: new THREE.Vector3(x, y, z).normalize(), right: new THREE.Vector3(), up: new THREE.Vector3() };
        tangentDirections(view.direction, view.right, view.up);
        views.push(view);
      }
    }
  }
  return views;
}

/** The views' directions and axes as GLSL array literals, so the shader picks and turns the very views the atlas was baked from. */
function viewsGLSL(): string {
  const views = impostorViews();
  const array = (name: string, pick: (v: ImpostorView) => THREE.Vector3) =>
    `const vec3 ${name}[${IMPOSTOR_VIEWS}] = vec3[${IMPOSTOR_VIEWS}](${views.map((v) => pick(v)).map((d) => `vec3(${d.x.toFixed(6)}, ${d.y.toFixed(6)}, ${d.z.toFixed(6)})`).join(', ')});`;
  return [array('VIEW_DIRECTIONS', (v) => v.direction), array('VIEW_RIGHT', (v) => v.right), array('VIEW_UP', (v) => v.up)].join('\n');
}

const vertexShader = /* glsl */ `
#include <common>
#include <fog_pars_vertex>
uniform float radius;
varying vec4 vUv01;
varying vec4 vUv23;
varying vec4 vViews;
varying vec4 vWeights;
varying vec3 vBasisRight;
varying vec3 vBasisUp;
varying vec3 vBasisForward;
varying vec3 vToCamera;

${viewsGLSL()}

// where a point of the quad (its offset across the screen, in the shape's own units) lies on
// view k: the view's axes turned about the line of sight onto the screen's, so the view shows
// the shape turned about that line as it actually is
vec2 viewUv( int k, mat3 turn, vec3 camRight, vec3 camUp, vec2 offset ) {
  vec3 r = turn * VIEW_RIGHT[ k ];
  vec3 u = turn * VIEW_UP[ k ];
  vec2 roll = vec2( dot( r, camRight ) + dot( u, camUp ), dot( r, camUp ) - dot( u, camRight ) );
  roll /= max( length( roll ), 1e-4 );
  return vec2( roll.x * offset.x + roll.y * offset.y, roll.x * offset.y - roll.y * offset.x ) / radius * 0.5 + 0.5;
}

void main() {
  #ifdef USE_INSTANCING
    mat4 world = modelMatrix * instanceMatrix;
  #else
    mat4 world = modelMatrix;
  #endif
  vec3 center = world[3].xyz;
  float objectScale = length( world[0].xyz );
  mat3 turn = mat3( world[0].xyz, world[1].xyz, world[2].xyz ) / objectScale;
  vBasisRight = turn[0];
  vBasisUp = turn[1];
  vBasisForward = turn[2];

  // the direction to the camera in the shape's own (turning) frame picks the views to show: the
  // nearest four, each weighed by how close it comes to the nearest (IMPOSTOR_BLEND); a fifth never comes
  // that close, so the picture changes smoothly however the shape turns
  vec3 toCamera = normalize( cameraPosition - center );
  vToCamera = toCamera;
  vec3 localView = toCamera * turn;
  float closeness[ ${IMPOSTOR_VIEWS} ];
  for ( int i = 0; i < ${IMPOSTOR_VIEWS}; i++ ) closeness[ i ] = dot( localView, VIEW_DIRECTIONS[ i ] );
  int picked[ 4 ];
  for ( int n = 0; n < 4; n++ ) {
    int best = -1;
    for ( int i = 0; i < ${IMPOSTOR_VIEWS}; i++ ) {
      bool taken = false;
      for ( int m = 0; m < n; m++ ) taken = taken || picked[ m ] == i;
      if ( !taken && ( best < 0 || closeness[ i ] > closeness[ best ] ) ) best = i;
    }
    picked[ n ] = best;
  }
  vec4 weights = clamp( 1.0 - ( closeness[ picked[ 0 ] ] - vec4( closeness[ picked[ 0 ] ], closeness[ picked[ 1 ] ], closeness[ picked[ 2 ] ], closeness[ picked[ 3 ] ] ) ) / ${IMPOSTOR_BLEND.toFixed(3)}, 0.0, 1.0 );
  vWeights = weights / dot( weights, vec4( 1.0 ) );
  vViews = vec4( float( picked[ 0 ] ), float( picked[ 1 ] ), float( picked[ 2 ] ), float( picked[ 3 ] ) );

  // the billboard itself always faces the camera, independent of the shape's own turn
  vec3 camRight = vec3( viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0] );
  vec3 camUp = vec3( viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1] );
  vec3 worldPosition = center + ( camRight * position.x + camUp * position.y ) * objectScale;
  vUv01 = vec4( viewUv( picked[ 0 ], turn, camRight, camUp, position.xy ), viewUv( picked[ 1 ], turn, camRight, camUp, position.xy ) );
  vUv23 = vec4( viewUv( picked[ 2 ], turn, camRight, camUp, position.xy ), viewUv( picked[ 3 ], turn, camRight, camUp, position.xy ) );

  gl_Position = projectionMatrix * viewMatrix * vec4( worldPosition, 1.0 );
  // the haze of an arena's air (see view/haze)
  #ifdef USE_FOG
    vHazeWorld = worldPosition;
  #endif
}
`;

/** The billboard's fragment shader, with the shape's own declarations (`pars`) and the code (`color`) that paints `diffuseColor` from `reliefTexel` as its meshes do. */
const fragmentShader = (pars: string, color: string) => /* glsl */ `
#include <common>
#include <fog_pars_fragment>
uniform highp sampler2DArray atlas;
uniform samplerCube reliefMap;
uniform vec3 baseColor;
uniform float roughness;
uniform float metalness;
uniform vec3 sunDirection;
uniform vec3 sunColor;
uniform vec3 skyColor;
uniform vec3 groundColor;
uniform vec3 skyUp;
uniform vec3 emissive;
uniform vec3 translucent;
${pars}

varying vec4 vUv01;
varying vec4 vUv23;
varying vec4 vViews;
varying vec4 vWeights;
varying vec3 vBasisRight;
varying vec3 vBasisUp;
varying vec3 vBasisForward;
varying vec3 vToCamera;

void main() {
  // all four read every time, never in a branch, so the mipmaps' choice stays well defined
  vec4 hit = texture( atlas, vec3( vUv01.xy, vViews.x ) ) * vWeights.x + texture( atlas, vec3( vUv01.zw, vViews.y ) ) * vWeights.y
    + texture( atlas, vec3( vUv23.xy, vViews.z ) ) * vWeights.z + texture( atlas, vec3( vUv23.zw, vViews.w ) ) * vWeights.w;
  if ( hit.a < 0.5 ) discard;
  // the shape's relief map where the views meet its surface, read and painted as its meshes do
  vec4 reliefTexel = textureCube( reliefMap, normalize( hit.rgb * 2.0 - 1.0 ) );
  float reliefNear = 0.0;
  float reliefTile = 0.5;
  vec4 diffuseColor = vec4( baseColor, 1.0 );
  ${color}
  vec3 local = normalize( reliefTexel.xyz * 2.0 - 1.0 );
  vec3 normal = normalize( local.x * vBasisRight + local.y * vBasisUp + local.z * vBasisForward );
  // the sun and the sky's hemisphere as three.js's standard material takes them: Lambert's
  // diffuse light (1/π) on what the metalness leaves, and the sun's highlight (GGX, Smith, Schlick)
  float lit = max( dot( normal, sunDirection ), 0.0 );
  vec3 ambient = mix( groundColor, skyColor, dot( normal, skyUp ) * 0.5 + 0.5 );
  vec3 halfway = normalize( sunDirection + vToCamera );
  float facing = max( dot( normal, vToCamera ), 1e-3 );
  float a2 = pow4( max( roughness, 0.0525 ) );
  float spread = pow2( dot( normal, halfway ) ) * ( a2 - 1.0 ) + 1.0;
  float visibility = 0.5 / max( lit * sqrt( a2 + ( 1.0 - a2 ) * facing * facing ) + facing * sqrt( a2 + ( 1.0 - a2 ) * lit * lit ), EPSILON );
  vec3 highlight = F_Schlick( mix( vec3( 0.04 ), diffuseColor.rgb, metalness ), 1.0, max( dot( vToCamera, halfway ), 0.0 ) ) * visibility * a2 * RECIPROCAL_PI / ( spread * spread );
  // what lets the sun through (ice): its side away from the sun glows, most when the sun stands behind it
  float behind = max( -dot( normal, sunDirection ), 0.0 );
  float backlit = pow( max( -dot( vToCamera, sunDirection ), 0.0 ), 4.0 );
  vec3 outgoingLight = ( diffuseColor.rgb * ( 1.0 - metalness ) * ( ambient + sunColor * lit ) + translucent * sunColor * behind * ( 0.25 + backlit ) ) * RECIPROCAL_PI + sunColor * lit * highlight + emissive;
  gl_FragColor = vec4( outgoingLight, 1.0 );
  #include <fog_fragment>

  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

/**
 * The light of every billboard, shared by every impostor material, so Space (see its shine)
 * sets and updates it for all of them at once from the scene's own lights: the sun's direction
 * and its color times its intensity, the sky's hemisphere light (its colors times its intensity
 * and the way it points). Placeholders until Space sets them, which happens before the first frame.
 */
export const IMPOSTOR_SUN = {
  direction: { value: new THREE.Vector3(0, 1, 0) },
  color: { value: new THREE.Color(0xfff0dd).multiplyScalar(3) },
  sky: { value: new THREE.Color(0x7788bb) },
  ground: { value: new THREE.Color(0x2a201c) },
  up: { value: new THREE.Vector3(0, 1, 0) },
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

/**
 * A billboard's own light besides the sun's and the sky's on its color: what an ice piece's
 * billboard shows (see world/ice) as its meshes do, its cold glow in the shadow and the
 * sunlight it lets through on its side away from the sun.
 */
export interface ImpostorGlow {
  emissive: THREE.ColorRepresentation;
  /** The share of the sun's light, by color, that comes through. */
  translucent: THREE.ColorRepresentation;
}

/** How a shape's billboard paints its surface, as its meshes do: their relief map and their code. */
export interface ImpostorLook {
  /** The shape's relief map (see world/rocks, reliefMap), the very one its meshes read. */
  relief: THREE.CubeTexture;
  /** The color, roughness and metalness of the meshes' standard material (the color linear). */
  color: THREE.Color;
  roughness: number;
  metalness: number;
  /** Declarations for `chunk`. */
  pars: string;
  /** The meshes' own code that works `reliefTexel` into `diffuseColor` (with `reliefNear` 0 and `reliefTile` 0.5: no detail tile this far). */
  chunk: string;
  /** The uniforms `pars` declares. */
  uniforms?: Record<string, THREE.IUniform>;
  /** Its own light, none for rock. */
  glow?: ImpostorGlow;
}

/**
 * A billboard material for one shape: `atlas` holds its IMPOSTOR_VIEWS views (see world/rocks,
 * impostorShape), one layer each, every cell the direction the relief map is read in (rgb,
 * encoded as 0.5 + 0.5 · d) and how far inside the silhouette (a, 0.5 on it); `radius` half the
 * quad's edge; `look` how it is painted.
 */
export function impostorMaterial(atlas: THREE.DataArrayTexture, radius: number, look: ImpostorLook): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: {
      ...look.uniforms,
      atlas: { value: atlas },
      reliefMap: { value: look.relief },
      baseColor: { value: look.color },
      roughness: { value: look.roughness },
      metalness: { value: look.metalness },
      radius: { value: radius },
      sunDirection: IMPOSTOR_SUN.direction,
      sunColor: IMPOSTOR_SUN.color,
      skyColor: IMPOSTOR_SUN.sky,
      groundColor: IMPOSTOR_SUN.ground,
      skyUp: IMPOSTOR_SUN.up,
      emissive: { value: new THREE.Color(look.glow?.emissive ?? 0x000000) },
      translucent: { value: new THREE.Color(look.glow?.translucent ?? 0x000000) },
    },
    vertexShader,
    fragmentShader: fragmentShader(look.pars, look.chunk),
    // the custom billboard transform can flip winding depending on the view angle
    side: THREE.DoubleSide,
    fog: true,
  });
}
