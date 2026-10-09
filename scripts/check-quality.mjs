import assert from "node:assert/strict";
import {
  normalizeQuality,
  qualityPresets,
  renderDimensions,
} from "../src/render-quality.ts";

// Anything unusable that a browser can hand back from storage must fall back to
// the authored preset instead of reaching the renderer.
assert.deepEqual(normalizeQuality(null), qualityPresets.original);
for (const bad of [
  null,
  false,
  "ultra",
  [],
  {
    scale: NaN,
    pixelRatio: 99,
    antialias: "injected",
    shadows: -1,
    aoSamples: Infinity,
  },
]) {
  assert.deepEqual(normalizeQuality(bad), qualityPresets.original);
}
assert.equal(normalizeQuality({ scale: 99999 }).scale, 200);
assert.equal(normalizeQuality({ scale: -1 }).scale, 50);
assert.equal(normalizeQuality({ depthOfField: 99999 }).depthOfField, 150);

// Every device/dpr/limit combination has to stay inside the fill-rate budget and
// inside the driver's maximum texture size.
for (const width of [640, 1920, 3840, 7680]) {
  for (const dpr of [1, 1.5, 2, 3]) {
    for (const max of [2048, 4096, 16384]) {
      const dimensions = renderDimensions(
        normalizeQuality({ scale: 200, pixelRatio: 3 }),
        1920,
        1080,
        width / 1920,
        dpr,
        max,
      );
      assert.ok(dimensions.width * dimensions.height <= 8_294_400);
      assert.ok(dimensions.width <= max && dimensions.height <= max);
      assert.ok(dimensions.ratio > 0);
    }
  }
}
assert.equal(
  renderDimensions(qualityPresets.ultra, 1920, 1080, 2, 2, 16384).limited,
  true,
  "A device that cannot cover the supersampled frame must report the limit",
);
console.log(
  "Quality checks passed: invalid storage, clamping and 48 device-limit combinations.",
);
