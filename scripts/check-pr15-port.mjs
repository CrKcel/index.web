// Adapted from the upstream PR #15 performance checks.
import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import {
  ArchiveDrawCoverage,
  ArchiveShadowCoverage,
} from "../src/archive-draw-coverage.ts";
import { archiveWave } from "../src/motion.ts";
import { SharedDepthAO } from "../src/shared-depth.ts";
test("visible edge bounds and independent offscreen shadow transforms", () => {
  const camera = new THREE.PerspectiveCamera(45, 16 / 9, 1, 100);
  camera.position.set(0, 0, 20);
  camera.updateMatrixWorld();
  const coverage = new ArchiveDrawCoverage();
  coverage.update(camera);
  assert.equal(coverage.contains(0, -2, 0), true);
  assert.equal(coverage.contains(100, -2, 0), false);
  // A card whose own box straddles the visible edge is still drawn.
  const edge =
    (Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2) * 20 * 16) / 9;
  assert.equal(coverage.contains(edge + 2, -2, 0), true);
  const geometry = new THREE.BoxGeometry(),
    material = new THREE.MeshBasicMaterial();
  const source = new THREE.InstancedMesh(geometry, material, 1);
  source.castShadow = true;
  const shadow = new ArchiveShadowCoverage(source),
    matrix = new THREE.Matrix4();
  shadow.begin();
  shadow.add(matrix);
  shadow.add(matrix.makeTranslation(100, 0, 0));
  assert.equal(shadow.commit(), true);
  assert.equal(source.castShadow, false, "The pool stops casting its own shadows");
  assert.equal(shadow.mesh.count, 2);
  const placed = new THREE.Matrix4();
  shadow.mesh.getMatrixAt(1, placed);
  assert.equal(
    placed.elements[12],
    100,
    "An offscreen caster keeps its own transform",
  );
  shadow.mesh.onBeforeRender();
  assert.equal(shadow.mesh.count, 0);
  shadow.mesh.onAfterRender();
  assert.equal(shadow.mesh.count, 2);
  // Re-committing unchanged transforms must not rebuild the instance buffer.
  shadow.begin();
  shadow.add(matrix.identity());
  shadow.add(matrix.makeTranslation(100, 0, 0));
  assert.equal(shadow.commit(), false);
  shadow.begin();
  shadow.add(matrix.identity());
  assert.equal(shadow.commit(), true);
  assert.equal(shadow.mesh.count, 1);
  shadow.mesh.dispose();
  source.dispose();
  geometry.dispose();
  material.dispose();
});
test("zero scan shortcut keeps the authored waveform continuous at both edges", () => {
  // Outside the authored interval the waveform rests at exactly zero, and the
  // shortcut must not introduce a step where it takes over.
  for (const time of [0, 17.78, 1000])
    for (let lane = -4; lane < 9; lane++)
      for (let row = -20; row < 60; row += 0.5)
        assert.equal(
          archiveWave(row, lane, time),
          0,
          `Wave must rest before the take at t=${time}`,
        );
  for (const [outside, inside] of [
    [17.88 - 1e-6, 17.88 + 1e-6],
    [22.23 + 1e-6, 22.23 - 1e-6],
  ])
    for (let lane = -4; lane < 9; lane++)
      for (let row = -20; row < 60; row += 0.5) {
        assert.equal(archiveWave(row, lane, outside), 0);
        assert.ok(
          Math.abs(archiveWave(row, lane, inside)) < 1e-3,
          "The shortcut hands over without a step",
        );
      }
});
test("AO depth-buffer removal preserves normal depth and shared packed Bokeh depth", () => {
  const pass = new SharedDepthAO(
    new THREE.Scene(),
    new THREE.PerspectiveCamera(30, 1, 5, 300),
    800,
    600,
    32,
  );
  assert.equal(pass.normalRenderTarget.depthBuffer, true);
  assert.ok(pass.normalRenderTarget.depthTexture);
  assert.equal(pass.ssaoRenderTarget.depthBuffer, false);
  assert.equal(pass.blurRenderTarget.depthBuffer, false);
  assert.equal(pass.normalRenderTarget.textures.length, 2);
  pass.setSharing(false);
  assert.equal(pass.normalRenderTarget.textures.length, 1);
  pass.setSharing(true);
  assert.equal(pass.normalRenderTarget.textures.length, 2);
  pass.dispose();
});
