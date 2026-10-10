import assert from "node:assert/strict";
import {
  archiveWave,
  cinematicField,
  columnStrength,
  extraction,
  selectionWave,
  rippleEnvelope,
  settlingWave,
  returnStep,
  damp,
  idleWave,
} from "../src/motion.ts";

// Idle drift must be visible without input, but never lift a card by more than
// 3% of its height nor move it more than a fraction of a pixel per frame.
let idleRange = 0;
for (let lane = 0; lane < 5; lane++) {
  for (let row = 0; row < 32; row++) {
    for (let frame = 0; frame < 60 * 13; frame++) {
      const a = idleWave(row, lane, frame / 60);
      const b = idleWave(row, lane, (frame + 1) / 60);
      idleRange = Math.max(idleRange, Math.abs(a));
      assert.ok(
        Math.abs(a) < 3.7 * 0.03,
        "Idle lift stays below 3% of card height",
      );
      assert.ok(
        Math.abs(b - a) * (1080 / 7.33) < 0.21,
        "Idle motion remains subpixel per frame",
      );
    }
  }
}
assert.ok(idleRange > 0.075, "Idle field remains perceptible without input");

// Reference prelude: two authored crests travel across the rows, and sampling
// the 25 fps timeline must not teleport either of them.
const peak = (t) =>
  Array.from({ length: 32 }, (_, row) => archiveWave(row, 2, t)).reduce(
    (best, y, row, values) => (y > values[best] ? row : best),
    0,
  );
assert.ok(peak(19.18) > peak(18.58) + 6, "First crest must travel across rows");
assert.ok(peak(20.68) < peak(20.08) - 8, "Second crest must return across rows");
let maxFrameDelta = 0;
for (let frame = 447; frame <= 556; frame++) {
  for (let row = 0; row < 32; row++)
    for (let lane = 0; lane < 5; lane++) {
      const a = archiveWave(row, lane, frame / 25);
      const b = archiveWave(row, lane, (frame + 1) / 25);
      assert.ok(Number.isFinite(a));
      maxFrameDelta = Math.max(maxFrameDelta, Math.abs(b - a));
    }
}
assert.ok(maxFrameDelta < 0.7, "25 fps samples must not teleport");
assert.ok(
  Math.abs(extraction(22.48) - extraction(23.08)) < 0.01,
  "Pause between extraction phases",
);
assert.ok(extraction(24.88) > 3 && extraction(20.98) === 0);
assert.ok(
  Math.abs(settlingWave(2, 21.98) - settlingWave(2, 22.38)) > 0.01,
  "Neighbors keep moving during the first extraction hold",
);
assert.ok(selectionWave(8, 1) > 0.1, "Click ripple reaches neighboring rows");

// Handoff: the flat equal-crest frame must blend into the selected-column wave
// without a visible step.
let preludeDelta = 0;
for (let frame = 522; frame < 558; frame++) {
  for (let row = 0; row < 32; row++)
    for (let lane = 0; lane < 5; lane++)
      preludeDelta = Math.max(
        preludeDelta,
        Math.abs(
          cinematicField(row, lane, (frame + 1) / 25) -
            cinematicField(row, lane, frame / 25),
        ),
      );
}
assert.ok(
  preludeDelta < 0.65,
  "The equal-crest to selected-column handoff is continuous",
);
assert.ok(columnStrength(0, 2) >= 0.25, "Other columns retain a visible wave");
assert.ok(
  columnStrength(2, 2) > columnStrength(1, 2),
  "The focused column leads the wave",
);

// Selection feedback is one-sided: a click must never push a card below its
// resting row, and the pulse must settle back exactly onto it.
for (let frame = 0; frame <= 200; frame++) {
  const age = frame / 60;
  for (let distance = 0; distance <= 32; distance += 0.5) {
    const y = selectionWave(distance, age);
    assert.ok(
      y >= 0 && y <= 0.8,
      "Selection pulse cannot create a negative trough",
    );
    if (age > 3.2) assert.equal(y, 0, "Pulse settles back to the resting row");
  }
}
const ripple = (distance, age) =>
  selectionWave(distance, age) * rippleEnvelope(distance, age);
for (let frame = 0; frame <= 200; frame++) {
  assert.equal(
    ripple(0, frame / 60),
    0,
    "The selected source cannot bounce on its own ripple",
  );
}
for (const distance of [3, 5, 8, 12]) {
  const crestTime = distance / 8;
  assert.equal(
    ripple(distance, crestTime),
    selectionWave(distance, crestTime),
    "The outward crest keeps its strength away from the source",
  );
  const edge = (distance - Math.PI / (2 * 0.58)) / 8;
  const epsilon = 1e-5;
  const velocity =
    (ripple(distance, edge + epsilon) - ripple(distance, edge - epsilon)) /
    (2 * epsilon);
  assert.ok(
    Math.abs(velocity) < 0.001,
    "Ripple edges approach rest without a velocity snap",
  );
}

// Returning an inspected file: alignment has to finish exactly before the card
// re-enters its slot, otherwise the copy pops on insertion.
let angle = 0.8,
  elapsed = 0;
while (angle !== 0 && elapsed < 2) {
  angle = returnStep(angle, 1 / 60);
  elapsed += 1 / 60;
}
assert.equal(angle, 0, "Alignment finishes exactly before insertion");
assert.ok(
  elapsed > 0.5 && elapsed < 1.2,
  "Alignment settles within a human-scale beat",
);

const coarse = { value: 5, velocity: -2 },
  fine = { ...coarse };
for (let i = 0; i < 30; i++) damp(coarse, -3, 4, 1 / 30);
for (let i = 0; i < 120; i++) damp(fine, -3, 4, 1 / 120);
assert.ok(
  Math.abs(coarse.value - fine.value) < 1e-9,
  "Spring must be frame-rate independent",
);
const before = coarse.value;
damp(coarse, 6, 4, 1 / 120);
assert.ok(
  Math.abs(coarse.value - before) < 0.05,
  "Retargeting must preserve position continuity",
);
console.log(
  JSON.stringify(
    {
      forwardPeaks: [peak(22.7), peak(23.3)],
      returnPeaks: [peak(24.2), peak(24.8)],
      maxFrameDelta,
      preludeDelta,
      alignmentSeconds: elapsed,
      checks: "passed",
    },
    null,
    2,
  ),
);
