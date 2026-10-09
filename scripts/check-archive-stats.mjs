// The stats dump is the contract every browser regression reads, so the pure
// readings it is built from are pinned here: rounding, projection, pool bounds,
// the selection phase and the two material-hook lookups.
import assert from "node:assert/strict";
import * as THREE from "three";
import {
  glassClarityOf,
  indexDimOf,
  poolBounds,
  projectPoint,
  rounded,
  roundedVector,
  selectionPhase,
} from "../src/archive-stats.ts";

assert.equal(rounded(1.23456, 4), 1.2346);
assert.equal(rounded(1.23456, 3), 1.235);
// Rounding a tiny negative reading yields -0, which serialises as 0 -- the same
// wire value the review surface has always reported.
assert.ok(Object.is(rounded(-0.00004, 3), -0));
assert.equal(JSON.stringify(rounded(-0.00004, 3)), "0");
assert.deepEqual(roundedVector(new THREE.Vector3(1.00004, -2.5, 3)), [1, -2.5, 3]);

// A camera on +Z looking at the origin: the model origin lands in the centre of
// the container, +X goes right and +Y goes up (which is a smaller pixel row).
const camera = new THREE.PerspectiveCamera(45, 800 / 600, 0.1, 100);
camera.position.set(0, 0, 5);
camera.lookAt(0, 0, 0);
camera.updateMatrixWorld(true);
const model = new THREE.Group();
model.updateMatrixWorld(true);
assert.deepEqual(projectPoint(model, camera, 800, 600, 0, 0, 0), [400, 300]);
const [rightX, rightY] = projectPoint(model, camera, 800, 600, 1, 0, 0);
assert.ok(rightX > 400 && rightY === 300, "A point to the right projects to the right");
const [upX, upY] = projectPoint(model, camera, 800, 600, 0, 1, 0);
assert.ok(upX === 400 && upY < 300, "A point above projects to a smaller row");
// A moved model carries its own transform.
model.position.set(0, 1, 0);
model.updateMatrixWorld(true);
assert.ok(projectPoint(model, camera, 800, 600, 0, 0, 0)[1] < 300, "The model transform is applied");

assert.deepEqual(
  poolBounds([
    { lane: 1, row: 2 },
    { lane: 3, row: -1 },
  ]),
  { minLane: 1, maxLane: 3, minRow: -1, maxRow: 2 },
);
assert.deepEqual(poolBounds([]), {
  minLane: Infinity,
  maxLane: -Infinity,
  minRow: Infinity,
  maxRow: -Infinity,
});

assert.equal(selectionPhase({ lane: 0, row: 0 }, []), "lifting");
assert.equal(selectionPhase(null, [{}]), "wave");
assert.equal(selectionPhase(null, []), "settled");

const file = new THREE.Group();
const inlay = new THREE.Mesh();
inlay.userData.surface = "Index_Inlay";
inlay.userData.subduedIndex = { value: 0.25 };
const glass = new THREE.Mesh();
glass.userData.surface = "Frosted_Polymer";
glass.userData.glassClarity = { value: 0.75 };
file.add(inlay, glass);
assert.equal(indexDimOf(file), 0.25);
assert.equal(glassClarityOf(file), 0.75);
assert.equal(indexDimOf(new THREE.Group()), undefined);
assert.equal(glassClarityOf(new THREE.Group()), undefined);

console.log("Stats rounding, projection, pool bounds, phase and material-hook readings passed.");
