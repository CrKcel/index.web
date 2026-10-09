import assert from "node:assert/strict";
import * as THREE from "three";
import {
  createCardImpostorMaterial,
  fitCardImpostor,
} from "../src/archive-card-bake.ts";

// The array keeps five surfaces whose union bound is the model's extents.
const box = new THREE.Box3(
  new THREE.Vector3(-2.5, 0, -0.13),
  new THREE.Vector3(2.5, 3.7, 0.206),
);
const viewDirection = new THREE.Vector3(-0.8105, 0.3256, 0.487).normalize();
const distance = 140;
const fill = 0.9;
const fit = fitCardImpostor({ box, viewDirection, distance, fill });
const center = box.getCenter(new THREE.Vector3());
const camera = fit.camera;

assert.ok(
  Math.abs(camera.position.distanceTo(center) - distance) < 1e-6,
  "Bake camera keeps the settled lens distance",
);
assert.ok(
  camera.position.clone().sub(center).normalize().distanceTo(viewDirection) <
    1e-6,
  "Bake camera sits on the settled view direction",
);

// The proxy must keep the card's own shape. The array sees a card at a steep
// angle, so the card spans several world units of depth across its width; a
// flat proxy would sit at one depth and occlude the extracted model wrongly.
const proxy = fit.geometry;
proxy.computeBoundingBox();
const proxyBox = proxy.boundingBox;
assert.ok(
  proxyBox.min.distanceTo(box.min) < 1e-6 &&
    proxyBox.max.distanceTo(box.max) < 1e-6,
  "Proxy matches the card bound",
);
assert.ok(
  proxy.attributes.position.count === 24 && proxy.index.count === 36,
  "Proxy is a closed box",
);

// The projector frames the card the way the bake camera did, so the material
// can rebuild the baked image on any proxy surface.
const ndc = [];
for (const x of [box.min.x, box.max.x])
  for (const y of [box.min.y, box.max.y])
    for (const z of [box.min.z, box.max.z]) {
      const corner = new THREE.Vector4(x, y, z, 1).applyMatrix4(fit.projector);
      ndc.push(new THREE.Vector2(corner.x / corner.w, corner.y / corner.w));
    }
for (const point of ndc)
  assert.ok(
    point.x >= -1 && point.x <= 1 && point.y >= -1 && point.y <= 1,
    "Baked frame contains the whole card",
  );
const span = (axis) =>
  Math.max(...ndc.map((p) => p[axis])) - Math.min(...ndc.map((p) => p[axis]));
assert.ok(
  Math.abs(Math.max(span("x"), span("y")) / 2 - fill) < 1e-3,
  "Card fills the requested fraction of the map",
);

// Projection is taken in card space: applying the instance transform would
// place every card outside the bake frame.
const light = new THREE.Texture();
const dark = new THREE.Texture();
const projector = new THREE.Matrix4();
const material = createCardImpostorMaterial(light, dark, projector);
assert.equal(material.uniforms.archiveLight.value, light);
assert.equal(material.uniforms.archiveDark.value, dark);
assert.equal(material.uniforms.archiveProjector.value, projector);
assert.ok(
  material.uniforms.fogNear && material.uniforms.fogFar,
  "Baked cards share the scene fog",
);
console.log(
  "Baked card proxy bound, bake framing, card-space projection and material inputs: passed",
);
