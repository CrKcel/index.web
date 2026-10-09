import assert from "node:assert/strict";
import * as THREE from "three";
import { CardAppearance } from "../src/appearance.ts";

const appearance = new CardAppearance();
const high = new THREE.MeshPhysicalMaterial({
  color: "#fffdfa",
  transmission: 0.9,
  roughness: 0.21,
  attenuationColor: "#eee6df",
  attenuationDistance: 2,
});
const low = new THREE.MeshPhysicalMaterial({
  color: "#fff7ed",
  transmission: 0.78,
  roughness: 0.28,
  attenuationColor: "#d4c7b4",
  attenuationDistance: 1.2,
});
appearance.register("Frosted_Polymer", high, low);
const group = new THREE.Group();
const body = new THREE.Mesh(new THREE.BoxGeometry(), high);
body.userData.surface = "Frosted_Polymer";
group.add(body);
appearance.prepare(group);
appearance.apply(group, 0);
assert.ok(body.material.color.equals(low.color));
assert.equal(body.material.transmission, low.transmission);
assert.ok(body.material.attenuationColor.equals(low.attenuationColor));
assert.equal(body.material.attenuationDistance, low.attenuationDistance);

// Array-to-detail handoff blends the two authored surfaces without a step at
// either end, and the blend never reverses direction mid-transition.
let lastTransmission = body.material.transmission;
let lastDistance = body.material.attenuationDistance;
for (let i = 1; i <= 100; i++) {
  appearance.apply(group, i / 100);
  assert.ok(
    body.material.transmission >= lastTransmission,
    "Surface changes continuously",
  );
  assert.ok(
    body.material.attenuationDistance >= lastDistance,
    "Absorption follows the surface",
  );
  lastTransmission = body.material.transmission;
  lastDistance = body.material.attenuationDistance;
}
assert.ok(body.material.color.equals(high.color));
assert.equal(body.material.transmission, high.transmission);
assert.ok(body.material.attenuationColor.equals(high.attenuationColor));
assert.equal(body.material.attenuationDistance, high.attenuationDistance);

// Opaque glTF surfaces may be Standard materials without absorption properties.
const opaque = new THREE.MeshStandardMaterial({ color: "#c7beb6" });
appearance.register("Opaque", opaque, opaque.clone());
const solid = new THREE.Mesh(new THREE.BoxGeometry(), opaque);
solid.userData.surface = "Opaque";
const solids = new THREE.Group();
solids.add(solid);
appearance.prepare(solids);
assert.doesNotThrow(() => appearance.apply(solids, 0.5));

// Default unbounded absorption must not turn into NaN during interpolation.
const clear = new THREE.MeshPhysicalMaterial();
appearance.register("Clear", clear, clear.clone());
const glass = new THREE.Mesh(new THREE.BoxGeometry(), clear);
glass.userData.surface = "Clear";
solids.add(glass);
appearance.prepare(solids);
appearance.apply(solids, 0.5);
assert.equal(glass.material.attenuationDistance, Infinity);
appearance.dispose(solids);

// A file selected again while descending must keep its own material state.
const returning = group.clone(true);
appearance.prepare(returning);
appearance.apply(returning, 0.37);
appearance.apply(group, 0.81);
assert.notEqual(returning.children[0].material, body.material);
assert.equal(returning.children[0].userData.appearance.value, 0.37);
assert.equal(body.userData.appearance.value, 0.81);
appearance.apply(returning, 1e-8);
assert.ok(
  Math.abs(returning.children[0].material.transmission - low.transmission) <
    1e-8,
  "Array handoff has the same surface",
);

// The quality value has to reach the compiled material.
const shader = {
  uniforms: {},
  vertexShader: "#include <begin_vertex>",
  fragmentShader: "#include <color_fragment>\n#include <roughnessmap_fragment>",
};
body.material.onBeforeCompile(shader, null);
assert.equal(shader.uniforms.archiveQuality, body.userData.appearance);
appearance.dispose(returning);
console.log(
  "Appearance interpolation, independent returning materials, shader uniform and array handoff: passed",
);
