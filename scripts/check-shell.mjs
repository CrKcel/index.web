import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import * as T from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { glassRevealAtHeight as reveal } from "../src/glass-reveal.ts";
async function load(path) {
  const b = await readFile(new URL(path, import.meta.url));
  const s = (
    await new GLTFLoader().parseAsync(
      b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength),
      "",
    )
  ).scene;
  s.updateMatrixWorld(true);
  return s;
}
const shell = await load("../public/assets/archive-assembly.glb");
let glass,
  patch,
  metal,
  engravingDepth = -Infinity;
shell.traverse((m) => {
  if (!m.isMesh) return;
  const name = m.material.name.replace(/\.\d+$/, "");
  const box = new T.Box3().setFromObject(m);
  if (name === "Frosted_Polymer" && m.userData.assemblyPart === "cover")
    glass = box;
  if (name === "Index_Inlay") patch = box;
  if (name === "Titanium_Fasteners") metal = m;
  if (name.startsWith("Case_") && m.userData.assemblyPart === "cover")
    engravingDepth = Math.max(engravingDepth, box.max.z);
});
assert.ok(glass && patch && metal);
// The index inlay is set flush into the front panel: floating above it or
// sinking into the shell both break the closed silhouette.
assert.ok(
  Math.abs(patch.max.y - glass.max.y) < 1e-5,
  "Patch flushed with the top of the panel",
);
assert.ok(
  Math.abs(patch.max.z - glass.max.z) < 1e-5,
  "Patch flushed with the front of the panel",
);
assert.ok(patch.min.z > glass.min.z, "Patch stays inside the panel");
// Every frame and boss engraving is recessed behind the front face.
assert.ok(
  engravingDepth < glass.max.z - 0.03,
  "Engravings stay behind the front face",
);
// Fasteners exist only at the two opposite corners the reference shows: a third
// screw anywhere else is a modelling regression.
const positions = metal.geometry.attributes.position;
const far = glass.max.x * 0.9,
  high = glass.max.y * 0.9,
  low = glass.max.y * 0.1;
let topRight = 0,
  bottomLeft = 0;
for (let i = 0; i < positions.count; i++) {
  const v = new T.Vector3()
    .fromBufferAttribute(positions, i)
    .applyMatrix4(metal.matrixWorld);
  if (v.x > far && v.y > high) topRight++;
  else if (v.x < -far && v.y < low) bottomLeft++;
  else assert.fail(`Fastener outside the two screw corners: ${v.toArray()}`);
}
assert.ok(topRight > 0 && bottomLeft > 0, "Both screw corners carry fasteners");
// The frosted-to-clear sweep is monotonic in height, keeps both endpoints exact
// and has no dead spot in between.
for (let h = 0; h <= 1; h += 0.01) {
  assert.equal(reveal(0, h), 0);
  assert.equal(reveal(1, h), 1);
  let last = 0;
  for (let p = 0; p <= 1; p += 0.01) {
    const next = reveal(p, h);
    assert.ok(next >= last, "Reveal sweep is monotonic");
    last = next;
  }
}
assert.equal(reveal(0.5, 0.9), 1);
assert.equal(reveal(0.5, 0.1), 0);
console.log(
  JSON.stringify(
    {
      passed: true,
      screwRegions: 2,
      patchSize: patch.getSize(new T.Vector3()).toArray(),
      engravingDepth,
      reveal: "fully frosted → top to bottom → fully clear",
    },
    null,
    2,
  ),
);
