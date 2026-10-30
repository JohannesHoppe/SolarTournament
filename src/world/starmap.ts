import * as THREE from 'three';
import { celestial, ecliptic } from './celestial';
import type { StarList } from './starfile';

/**
 * The real sky of the arenas in the solar system: the stars of the Yale Bright Star Catalogue
 * (see tools/sky, public/assets/sky/README.md), every star the eye sees under a dark sky, as
 * points sharp at any size of the screen, and the Milky Way generated in code along the real
 * galactic plane (see world/milkyway) as a cube map behind them. From anywhere in the solar
 * system the stars stand where they stand seen from Earth: only the sun and the planets wander
 * among them.
 */

/**
 * Saturn's north pole (right ascension and declination, degrees; IAU): the ring lies in Saturn's
 * equator, so the Rings of Saturn's reference plane (its horizon, the world's y = 0) is square to it.
 */
const SATURN_POLE = { ra: 40.589, dec: 83.537 };

/**
 * The turn from the celestial frame into the world, the same in every arena that shows the real
 * sky: the world's up is Saturn's north pole, and the sun stands on the ecliptic where
 * SUN_DIRECTION puts it, 8.3° above the ring's plane, as the sun stands over Saturn's ring at
 * the ecliptic longitude `SUN_LONGITUDE` (the ring opens to the sun by as much as it did in
 * 2023). These two directions fix the turn wholly. The other arenas have no pole of their own
 * to turn by (Jupiter's deck is the top of its clouds, square to the planet's radius, not to its
 * axis; Earth below the Satellite Junkyard is seen from the side): they take the Rings' sky.
 */
const SUN_LONGITUDE = 151.69;

/** The turn from a frame given by two directions (the first exact, the second within the plane they span) into another such frame. */
function frameTurn(fromUp: THREE.Vector3, fromSide: THREE.Vector3, toUp: THREE.Vector3, toSide: THREE.Vector3): THREE.Matrix4 {
  const basis = (up: THREE.Vector3, side: THREE.Vector3) => {
    const a = up.clone().normalize();
    const b = side.clone().addScaledVector(a, -side.dot(a)).normalize();
    return new THREE.Matrix4().makeBasis(a, b, a.clone().cross(b));
  };
  return basis(toUp, toSide).multiply(basis(fromUp, fromSide).transpose());
}

/** The turn from the celestial frame into the world for a sun in `sun` (a unit direction of the world): see SUN_LONGITUDE. */
export function skyTurn(sun: THREE.Vector3): THREE.Matrix4 {
  return frameTurn(celestial(SATURN_POLE.ra, SATURN_POLE.dec), ecliptic(SUN_LONGITUDE), new THREE.Vector3(0, 1, 0), sun);
}

/**
 * A star's light on screen (see starVertex) is its brightness (starfile's magnitudeFlux) times
 * this: a star of the sixth magnitude about 0.7, the catalogue's faintest about 0.25 (barely
 * seen), Sirius about 28 (a disk of six pixels whose middle the bloom catches).
 */
const STAR_GAIN = 0.7;
/** The Milky Way's glow, as bright as its cube map holds it times this: its brightest star clouds (the map's 1) a dim 0.22, under the brightest stars. */
const GLOW_GAIN = 0.22;

const starVertex = /* glsl */ `
  attribute vec3 tint;
  attribute float flux;
  uniform float brightness;
  uniform float pixelRatio;
  varying vec3 vColor;
  #include <fog_pars_vertex>
  void main() {
    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mvPosition;
    // a star's light spread over a soft disk: the faint ones under two pixels, the brightest up
    // to eight, so a bright star shows larger as well as brighter, as the eye takes it
    float light = flux * brightness;
    float size = clamp(1.6 + 0.9 * sqrt(light), 1.6, 8.0);
    gl_PointSize = size * pixelRatio;
    // the disk's light in all is the star's (its bell over the square of the point holds 0.3 of it)
    vColor = tint * light / (0.3 * size * size);
    #include <fog_vertex>
  }
`;

const starFragment = /* glsl */ `
  varying vec3 vColor;
  #include <fog_pars_fragment>
  void main() {
    vec2 p = gl_PointCoord * 2.0 - 1.0;
    float fall = exp(-2.5 * dot(p, p));
    gl_FragColor = vec4(vColor * fall, 1.0);
    #include <fog_fragment>
  }
`;

const glowVertex = /* glsl */ `
  uniform mat3 toCelestial;
  varying vec3 vCelestial;
  #include <fog_pars_vertex>
  void main() {
    vCelestial = toCelestial * position;
    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mvPosition;
    #include <fog_vertex>
  }
`;

const glowFragment = /* glsl */ `
  uniform samplerCube glow;
  uniform float brightness;
  varying vec3 vCelestial;
  #include <fog_pars_fragment>
  void main() {
    gl_FragColor = vec4(textureCube(glow, vCelestial).rgb * brightness, 1.0);
    #include <fog_fragment>
  }
`;

/**
 * The real sky, at `radius` around the camera (it follows the camera with the sky, see Space):
 * the stars of `stars` as points and the glow of `glow` (a cube map in the celestial frame) on a
 * sphere inside them, both turned by `turn` from the celestial frame into the world, added to
 * the arena's space.
 */
export class Starmap {
  readonly group = new THREE.Group();
  private readonly points: THREE.Points<THREE.BufferGeometry, THREE.ShaderMaterial>;
  private readonly sphere: THREE.Mesh<THREE.SphereGeometry, THREE.ShaderMaterial>;

  constructor(stars: StarList, glow: THREE.CubeTexture, turn: THREE.Matrix4, radius: number) {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(stars.directions.map((d) => d * radius), 3));
    geometry.setAttribute('tint', new THREE.BufferAttribute(stars.colors, 3));
    geometry.setAttribute('flux', new THREE.BufferAttribute(stars.fluxes, 1));
    this.points = new THREE.Points(
      geometry,
      new THREE.ShaderMaterial({
        uniforms: { brightness: { value: STAR_GAIN }, pixelRatio: { value: 1 } },
        vertexShader: starVertex,
        fragmentShader: starFragment,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        transparent: true,
        fog: true,
      }),
    );
    this.points.onBeforeRender = (renderer) => (this.points.material.uniforms.pixelRatio.value = renderer.getPixelRatio());
    this.points.quaternion.setFromRotationMatrix(turn);
    this.points.frustumCulled = false;

    this.sphere = new THREE.Mesh(
      new THREE.SphereGeometry(radius * 0.97, 48, 24),
      new THREE.ShaderMaterial({
        uniforms: { glow: { value: glow }, brightness: { value: GLOW_GAIN }, toCelestial: { value: new THREE.Matrix3().setFromMatrix4(turn).transpose() } },
        vertexShader: glowVertex,
        fragmentShader: glowFragment,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        transparent: true,
        side: THREE.BackSide,
        fog: true,
      }),
    );
    this.sphere.frustumCulled = false;
    // the glow first, the stars over it; the group drawn with the sky's (see Space), before
    // everything else of the transparent pass, so a planet drawn behind all (Earth below the
    // Satellite Junkyard) hides them as it hides the rest of the sky
    this.sphere.renderOrder = -2;
    this.points.renderOrder = -1;
    this.group.renderOrder = -1;
    this.group.add(this.sphere, this.points);
  }

  /** How bright the sky shows (1 in the dark; a near sun's glare drowns it), the stars and the glow alike. */
  setBrightness(share: number) {
    this.points.material.uniforms.brightness.value = STAR_GAIN * share;
    this.sphere.material.uniforms.brightness.value = GLOW_GAIN * share;
  }

  /** Shows the glow from another cube map (see Space.setDetail). */
  setGlow(glow: THREE.CubeTexture) {
    this.sphere.material.uniforms.glow.value = glow;
  }
}
