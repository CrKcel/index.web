import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import {
  decryptionFrame,
  DecryptionController,
  DECRYPTION_START,
  DECRYPTION_END,
  INTERACTIVE_RATE,
} from "../src/decryption.ts";
import { CardAppearance } from "../src/appearance.ts";
import { frostedTransmissionLod, FROSTED_ROUGHNESS, CLEAR_ROUGHNESS } from "../src/glass-reveal.ts";

// Frost occupies the same fraction of a cover across viewport sizes. Clearing
// must never briefly increase its blur, and both original endpoints survive.
for (const scale of [0.5, 1, 2]) {
  const pixels = 400 * scale, width = 1920 * scale;
  assert.ok(Math.abs(2 ** frostedTransmissionLod(pixels, width, FROSTED_ROUGHNESS) / pixels - 0.016) < 1e-10);
  let prior = -Infinity;
  for (let i = 0; i <= 100; i++) {
    const roughness = CLEAR_ROUGHNESS + (FROSTED_ROUGHNESS - CLEAR_ROUGHNESS) * i / 100;
    const lod = frostedTransmissionLod(pixels, width, roughness);
    assert.ok(lod >= prior - 1e-10, "Clearing monotonically reduces blur");
    prior = lod;
  }
}

const length = (frame) => frame.intervals.reduce((n, [a, b]) => n + b - a, 0);
let previous = 0;
for (let t = 22.36; t < 24.16; t += 0.001) {
  const f = decryptionFrame(t),
    current = length(f);
  assert.ok(current >= previous - 1e-10 && current <= 1);
  if (f.intervals.length)
    assert.ok(Math.abs(f.intervals[0][1] + f.intervals[1][0] - 1) < 1e-10);
  previous = current;
}
assert.deepEqual(decryptionFrame(24.16).intervals, [[0, 1]]);
assert.equal(length(decryptionFrame(25.83)), 1);
previous = 1;
for (let t = 25.84; t < 26.96; t += 0.001) {
  const f = decryptionFrame(t),
    current = length(f);
  assert.ok(current <= previous + 1e-10 && current >= 0);
  assert.ok(Math.abs(f.intervals[0][0] + f.intervals[0][1] - 1) < 1e-10);
  assert.equal(f.clarity, 0);
  previous = current;
}
assert.equal(length(decryptionFrame(26.96)), 0);
assert.equal(decryptionFrame(26.96).clarity, 0);
assert.equal(decryptionFrame(27.68).clarity, 1);
assert.ok(length(decryptionFrame(22.76)) > 0.5, "Joining is eased, not linear");
const a = new DecryptionController();
const INTERACTIVE_SECONDS = (DECRYPTION_END - DECRYPTION_START) / INTERACTIVE_RATE;
a.enter();
a.update(1 / 30);
assert.ok(a.frame.time > DECRYPTION_START, "Entering the mode starts the timeline immediately");
let steps = 1;
for (; steps < 300 && a.clarity < 1; steps++) a.update(1 / 30);
assert.equal(a.clarity, 1, "The timeline reaches the clear state without an external ready cue");
const elapsed = steps / 30;
assert.ok(
  Math.abs(elapsed - INTERACTIVE_SECONDS) < 0.05,
  `The interactive timeline keeps its authored length (${elapsed.toFixed(2)}s vs ${INTERACTIVE_SECONDS.toFixed(2)}s)`,
);
const revealAt = (26.96 - DECRYPTION_START) / INTERACTIVE_RATE;
assert.ok(
  revealAt + 0.95 <= 3.1,
  `The document opens inside the camera move, not after it (opens at ${revealAt.toFixed(2)}s)`,
);
a.leave();
assert.equal(a.frame.intervals.length, 0);
a.update(0.1);
const returning = a.clarity;
a.enter();
a.update(0);
assert.equal(a.clarity, returning);
a.select();
assert.equal(a.clarity, 0);
a.update(0, 23.12);
assert.equal(a.frame.phase, "joining");
a.update(0, 27.68);
assert.equal(a.clarity, 1);
a.update(0, 22.12);
assert.equal(a.clarity, 0, "Reference seeking is reversible");

const appearance = new CardAppearance();
const high = new THREE.MeshPhysicalMaterial({
  transmission: 0.9,
  thickness: 0.12,
  attenuationDistance: 2,
});
const low = high.clone();
low.thickness = 0.25;
appearance.register("Frosted_Polymer", high, low);
const group = new THREE.Group(),
  mesh = new THREE.Mesh(new THREE.BoxGeometry(), high);
mesh.userData.surface = "Frosted_Polymer";
group.add(mesh);
appearance.prepare(group);
appearance.apply(group, 1);
const shader = {
  uniforms: {},
  vertexShader: "#include <begin_vertex>\n#include <project_vertex>",
  fragmentShader: "#include <transmission_pars_fragment>\n#include <color_fragment>\n#include <roughnessmap_fragment>",
};
mesh.material.onBeforeCompile(shader);
const part = new THREE.Group();
group.add(part);
part.add(mesh);
appearance.setClarity(group, 1);
assert.equal(shader.uniforms.archiveClarity.value, 1);
assert.ok(
  mesh.material.thickness < 0.12,
  "Revealed glass thins its absorption",
);
appearance.setClarity(group, 0);
assert.equal(shader.uniforms.archiveClarity.value, 0);
assert.equal(mesh.material.thickness, 0.12);

const bytes = await readFile(
  new URL("../public/assets/archive-assembly.glb", import.meta.url),
);
const asset = (
  await new GLTFLoader().parseAsync(
    bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
    "",
  )
).scene;
asset.updateMatrixWorld(true);
let interiors = 0,
  maxDepth = -Infinity,
  minDepth = Infinity;
asset.traverse((mesh) => {
  if (
    !mesh.isMesh ||
    !["optical-core", "optical-lenses"].includes(mesh.userData.assemblyPart)
  )
    return;
  const box = new THREE.Box3().setFromObject(mesh);
  minDepth = Math.min(minDepth, box.min.z);
  maxDepth = Math.max(maxDepth, box.max.z);
  interiors++;
  assert.ok(
    box.min.z > -0.038 && box.max.z < 0.174,
    "Interior stays between substrate and cover",
  );
});
assert.ok(interiors >= 6);
console.log(
  JSON.stringify(
    {
      passed: true,
      interiorMeshes: interiors,
      interiorDepth: [minDepth, maxDepth],
    },
    null,
    2,
  ),
);
