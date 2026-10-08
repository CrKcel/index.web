import * as THREE from "three";

/**
 * Array cards never turn relative to the interactive camera: the selected
 * column stays centred and the long lens keeps every visible card within a
 * couple of degrees of the axis. One projection of the card therefore serves
 * every instance, which removes the extra transmission, depth and normal
 * passes the five instanced surfaces produced.
 */

export interface CardImpostor {
  /** Card-space proxy box carrying the baked projection. */
  geometry: THREE.BufferGeometry;
  camera: THREE.PerspectiveCamera;
  projector: THREE.Matrix4;
  width: number;
  height: number;
}

const CORNERS: THREE.Vector3[] = [];
for (const x of [-1, 1])
  for (const y of [-1, 1])
    for (const z of [-1, 1]) CORNERS.push(new THREE.Vector3(x, y, z));

/**
 * Fit a bake camera to the card and derive the proxy the baked projection is
 * carried by. The proxy is the card's own bound, not a screen-aligned quad:
 * the array sees each card at a steep angle, so a flat quad would sit at one
 * depth across five world units and occlude the extracted model wrongly.
 * A bound-shaped proxy keeps the model/silhouette occlusion of the modelled
 * surfaces while the material projects the bake onto it.
 */
export function fitCardImpostor(options: {
  box: THREE.Box3;
  /** Direction from the card toward the camera. */
  viewDirection: THREE.Vector3;
  distance: number;
  width?: number;
  /** Fraction of the frame the larger silhouette axis fills. */
  fill?: number;
}): CardImpostor {
  const { box, distance } = options;
  const viewDirection = options.viewDirection.clone().normalize();
  const fill = options.fill ?? 0.9;
  const width = options.width ?? 1024;
  const center = box.getCenter(new THREE.Vector3());
  const size = box.getSize(new THREE.Vector3());
  const corners = CORNERS.map(
    (sign) =>
      new THREE.Vector3(
        sign.x < 0 ? box.min.x : box.max.x,
        sign.y < 0 ? box.min.y : box.max.y,
        sign.z < 0 ? box.min.z : box.max.z,
      ),
  );

  // Size the map to the projected card so the silhouette fills the texture.
  const across = new THREE.Vector3()
    .crossVectors(new THREE.Vector3(0, 1, 0), viewDirection)
    .normalize();
  const upright = new THREE.Vector3()
    .crossVectors(viewDirection, across)
    .normalize();
  let minAcross = Infinity,
    maxAcross = -Infinity,
    minUpright = Infinity,
    maxUpright = -Infinity;
  for (const corner of corners) {
    const offset = corner.clone().sub(center);
    minAcross = Math.min(minAcross, offset.dot(across));
    maxAcross = Math.max(maxAcross, offset.dot(across));
    minUpright = Math.min(minUpright, offset.dot(upright));
    maxUpright = Math.max(maxUpright, offset.dot(upright));
  }
  const aspect = THREE.MathUtils.clamp(
    (maxAcross - minAcross) / Math.max(1e-4, maxUpright - minUpright),
    1,
    2.6,
  );
  const height = Math.max(64, Math.round(width / aspect / 4) * 4);

  const reach = size.length();
  const camera = new THREE.PerspectiveCamera(
    3,
    width / height,
    Math.max(0.1, distance - reach * 2),
    distance + reach * 2,
  );
  camera.position.copy(center).addScaledVector(viewDirection, distance);
  camera.up.set(0, 1, 0);
  camera.lookAt(center);
  camera.updateMatrixWorld(true);

  const project = () =>
    corners.map((corner) => {
      const ndc = corner.clone().project(camera);
      return new THREE.Vector2(ndc.x, ndc.y);
    });
  // NDC scales inversely with tan(fov / 2), so one correction lands exactly.
  for (let pass = 0; pass < 2; pass++) {
    const projected = project();
    const span = Math.max(
      Math.max(...projected.map((p) => p.x)) -
        Math.min(...projected.map((p) => p.x)),
      Math.max(...projected.map((p) => p.y)) -
        Math.min(...projected.map((p) => p.y)),
    );
    const halfHeight =
      Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * distance;
    camera.fov = THREE.MathUtils.radToDeg(
      2 * Math.atan((halfHeight * span * 0.5) / fill / distance),
    );
    camera.updateProjectionMatrix();
  }

  const geometry = new THREE.BoxGeometry(size.x, size.y, size.z);
  geometry.translate(center.x, center.y, center.z);
  geometry.computeBoundingSphere();
  const projector = new THREE.Matrix4().multiplyMatrices(
    camera.projectionMatrix,
    camera.matrixWorldInverse,
  );
  return { geometry, camera, projector, width, height };
}

/**
 * Draws the baked projection with the per-instance theme amount and the scene
 * fog. Re-projecting each fragment from the bake camera reproduces the baked
 * image on any proxy surface, so the proxy can keep the card's own shape. The
 * maps hold linear pre-tone-mapping values, so the composer output pass grades
 * array cards exactly like the extracted model.
 */
export function createCardImpostorMaterial(
  light: THREE.Texture,
  dark: THREE.Texture,
  projector: THREE.Matrix4,
) {
  return new THREE.ShaderMaterial({
    name: "Archive_Card_Impostor",
    fog: true,
    uniforms: {
      fogColor: { value: new THREE.Color() },
      fogNear: { value: 1 },
      fogFar: { value: 2000 },
      fogDensity: { value: 0.00025 },
      archiveLight: { value: light },
      archiveDark: { value: dark },
      archiveProjector: { value: projector },
    },
    vertexShader: `
attribute float archiveTheme;
uniform mat4 archiveProjector;
varying float vRhineTheme;
varying vec4 vArchiveProjection;
#include <common>
#include <fog_pars_vertex>
void main() {
  vRhineTheme = archiveTheme;
  #include <begin_vertex>
  // The bake camera is defined in card space, so the projection is taken
  // before the instance transform.
  vArchiveProjection = archiveProjector * vec4(transformed, 1.0);
  vec4 archivePosition = vec4(transformed, 1.0);
  #ifdef USE_INSTANCING
    archivePosition = instanceMatrix * archivePosition;
  #endif
  vec4 mvPosition = modelViewMatrix * archivePosition;
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}`,
    fragmentShader: `
uniform sampler2D archiveLight;
uniform sampler2D archiveDark;
varying float vRhineTheme;
varying vec4 vArchiveProjection;
#include <common>
#include <fog_pars_fragment>
void main() {
  vec2 archiveUv = vArchiveProjection.xy / vArchiveProjection.w * 0.5 + 0.5;
  gl_FragColor = vec4(mix(
    texture2D(archiveLight, archiveUv).rgb,
    texture2D(archiveDark, archiveUv).rgb,
    clamp(vRhineTheme, 0.0, 1.0)), 1.0);
  #include <fog_fragment>
}`,
  });
}
