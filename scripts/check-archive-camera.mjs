// The framing numbers in archive-camera.ts were measured against reference
// frames, so this check pins the authored endpoints and the invariants the
// comments claim: the settled lens, the settled view direction, the opening
// zoom monotonicity, the fog anchoring and the portrait preview independence.
import assert from "node:assert/strict";
import * as THREE from "three";
import {
  ARCHIVE_CAMERA_DISTANCE,
  interactiveViewDirection,
  planArchiveCamera,
} from "../src/archive-camera.ts";

const settledFov = 2.999158312912754;
const detailFov = 4.692446223172939;
const base = {
  detail: 0,
  width: 1920,
  height: 1080,
  layout: "",
  position: new THREE.Vector3(0, 0, 0),
  aim: new THREE.Vector3(0, 0, 0),
  fov: 6.15,
  modelPosition: new THREE.Vector3(0, 0, 0),
  pointer: { x: 0, y: 0 },
  pointerParallax: false,
  uiOnlyParallax: false,
  transition: false,
  themeAmount: 0,
  dt: 1 / 60,
};
const close = (a, b, message, tolerance = 1e-9) =>
  assert.ok(Math.abs(a - b) < tolerance, `${message} (${a} vs ${b})`);
const shot = (time, overrides = {}) =>
  planArchiveCamera({
    ...base,
    ...overrides,
    cinematic: { reveal: 1, lift: 0, zoom: 0, time },
  });

// Settled interactive framing: the authored lens, span and view direction.
const settled = planArchiveCamera(base);
assert.equal(settled.responsiveOpening, false);
close(settled.distance, ARCHIVE_CAMERA_DISTANCE, "The settled lens distance is authored");
close(settled.span, 7.33, "The settled view span is authored");
close(settled.fov, settledFov, "The settled field of view matches the reference", 1e-6);
const direction = interactiveViewDirection();
close(direction.length(), 1, "The interactive view direction is normalized");
for (const axis of ["x", "y", "z"])
  close(
    settled.viewDirection[axis],
    direction[axis],
    `The settled ${axis} view direction matches the interactive endpoint`,
  );

// Extraction zooms in: the reference opening is monotone in both lens and fov.
const frames = [22, 23, 24, 25, 26, 27, 28, 29, 30, 35].map((time) => shot(time));
for (let i = 1; i < frames.length; i++) {
  assert.ok(
    frames[i].distance >= frames[i - 1].distance,
    `The opening keeps pulling back at frame ${i}`,
  );
  assert.ok(
    frames[i].fov <= frames[i - 1].fov + 1e-9,
    `The opening lens keeps tightening at frame ${i}`,
  );
}
close(frames.at(-1).distance, ARCHIVE_CAMERA_DISTANCE, "The opening settles on the interactive lens");

// Detail framing closes in to the authored extraction distance.
close(planArchiveCamera({ ...base, detail: 1 }).distance, 72, "Extraction uses the authored detail lens");
close(planArchiveCamera({ ...base, detail: 1 }).fov, detailFov, "The extraction field of view matches the reference", 1e-6);

// The whole authored timeline stays finite in every supported layout.
for (let time = 6; time <= 35; time += 0.05) {
  for (const [width, height, layout] of [
    [1920, 1080, ""],
    [390, 844, "opening"],
    [1280, 720, "compact"],
    [1024, 1366, "cinematic"],
  ]) {
    const plan = shot(time, { width, height, layout });
    for (const [name, value] of Object.entries({ ...plan, position: plan.position.x, aim: plan.aim.y }))
      if (typeof value === "number")
        assert.ok(Number.isFinite(value), `${name} stays finite at ${time}s in ${width}x${height}`);
    assert.ok(Number.isFinite(plan.position.y) && Number.isFinite(plan.position.z), "positions stay finite");
  }
}

// Fog is anchored to the rendered camera, so its depth range depends only on
// theme and detail -- never on how far the damped camera still has to travel.
const range = (plan) => plan.fogFar - plan.fogNear;
close(range(settled), 20, "The light-theme fog range is authored");
close(range(planArchiveCamera({ ...base, themeAmount: 1 })), 15, "The dark-theme fog range is authored");
close(range(planArchiveCamera({ ...base, position: new THREE.Vector3(500, 500, 500) })), 20, "An undamped camera keeps the same fog range");
close(
  planArchiveCamera({ ...base, position: new THREE.Vector3(500, 500, 500) }).fogNear,
  settled.fogNear,
  "With the blend at one the fog follows the target camera",
  1e-6,
);
const approaching = planArchiveCamera({
  ...base,
  transition: true,
  position: new THREE.Vector3(500, 500, 500),
});
assert.ok(
  approaching.fogNear > 200 && range(approaching) === range(settled),
  "A camera that is still travelling anchors the fog to where it actually is",
);
close(
  planArchiveCamera({ ...base, transition: true, position: new THREE.Vector3(500, 500, 500) }).fogNear,
  approaching.position.distanceTo(approaching.aim) + 5,
  "Fog near is measured from the damped camera",
  1e-9,
);

// The portrait preview must not follow the live lift, wave and rail.
const portrait = { width: 390, height: 844 };
const portraitAim = planArchiveCamera({ ...base, ...portrait }).aim;
const movedAim = planArchiveCamera({
  ...base,
  ...portrait,
  modelPosition: new THREE.Vector3(9, -3, 4),
}).aim;
assert.deepEqual(movedAim.toArray(), portraitAim.toArray(), "A portrait preview ignores the model position");
const landscapeAim = planArchiveCamera({ ...base, detail: 1 }).aim;
const movedLandscapeAim = planArchiveCamera({
  ...base,
  detail: 1,
  modelPosition: new THREE.Vector3(0, 4, 0),
}).aim;
assert.notDeepEqual(movedLandscapeAim.toArray(), landscapeAim.toArray(), "A detail framing follows the model");

// Pointer parallax is gated by both the motion preference and the UI-only flag.
const parallax = planArchiveCamera({ ...base, pointer: { x: 0.5, y: 0.5 }, pointerParallax: true });
close(parallax.position.x - settled.position.x, 0.06, "Pointer parallax offsets the camera");
close(parallax.position.y - settled.position.y, -0.06, "Pointer parallax offsets the camera vertically");
assert.deepEqual(
  planArchiveCamera({ ...base, pointer: { x: 0.5, y: 0.5 } }).position.toArray(),
  settled.position.toArray(),
  "Parallax stays off while the motion preference is off",
);
assert.deepEqual(
  planArchiveCamera({ ...base, pointer: { x: 0.5, y: 0.5 }, pointerParallax: true, uiOnlyParallax: true }).position.toArray(),
  settled.position.toArray(),
  "A UI-only parallax frame ignores the pointer",
);

// The reference opening only letterboxes a responsive layout.
assert.equal(shot(30, { layout: "opening" }).responsiveOpening, true);
assert.equal(shot(30, { layout: "cinematic" }).responsiveOpening, false);
assert.equal(planArchiveCamera({ ...base, layout: "opening" }).responsiveOpening, false);

console.log("Settled framing, opening zoom, fog anchoring and portrait preview invariants passed.");
