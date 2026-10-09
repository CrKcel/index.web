import assert from "node:assert/strict";
import { ThemeWave } from "../src/theme-motion.ts";

// The cascade spreads from the origin; a card caught mid-transition keeps its
// own value when the user flips the theme back.
const wave = new ThemeWave();
const center = { lane: 2, row: 12 },
  far = { lane: 5, row: 20 };
wave.set(true, 0, center);
wave.beginFrame();
const origin = wave.sample(center, 0.3),
  distant = wave.sample(far, 0.3);
assert.ok(origin > distant && origin > 0 && origin < 1, "Origin changes first");
wave.set(false, 0.3, center);
assert.equal(wave.sample(center, 0.3), origin);
assert.equal(
  wave.sample(far, 0.3),
  distant,
  "Reversal preserves each current card",
);
wave.beginFrame();
assert.equal(wave.sample(center, 2), 0);
assert.equal(wave.sample(far, 2), 0);
assert.equal(wave.background(2), 0);
// Reduced motion skips the cascade and lands on the target immediately.
wave.set(true, 3, center, true);
assert.equal(wave.sample(far, 3), 1);
assert.equal(wave.background(3), 1, "Reduced motion goes directly to target");
// Cells that enter the pool while the wave is settled must not replay it.
const settled = new ThemeWave();
settled.set(true, 12, center);
settled.beginFrame();
assert.equal(settled.sample(far, 14), 1);
settled.set(false, 14, center);
assert.equal(
  settled.sample({ row: -300, lane: -20 }, 14),
  1,
  "A cell entering a settled wave takes the target value",
);
// Sampled values stay inside their endpoints everywhere in the lattice.
wave.set(false, 4, center);
wave.beginFrame();
for (let i = -100; i < 100; i++) {
  const value = wave.sample({ lane: i, row: i }, 4.2);
  assert.ok(value >= 0 && value <= 1);
}
console.log(
  "Theme cascade, reversal continuity, endpoints, settled pool and reduced motion passed.",
);
