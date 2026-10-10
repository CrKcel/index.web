// The surface field is the sum of four authored motions, and every consumer
// (height, slope, neighbours, packing) reads it through one frame cache. This
// check pins the cinematic hand-off, the term gating and the cache contract,
// which is the part a refactor can silently break.
import assert from "node:assert/strict";
import { ArchiveField, fieldHeight } from "../src/archive-field.ts";
import { archiveWave, cinematicField, settlingWave, columnStrength } from "../src/motion.ts";

const base = {
  cinematic: false,
  shot: 24.98,
  now: 25.88,
  shoulder: 12,
  laneFocus: 2,
  origin: { row: 0, lane: 0 },
  scanTime: 24.98,
  scanBlend: 0,
  idleGain: 0,
  flatMix: 0,
  selectionWave: true,
  pulses: [],
  selectionPulse: () => 0,
  deferSelectionPulse: false,
  pulseGain: 1,
  playfield: { bands: { low: 0, mid: 0, high: 0, activity: 0 }, strength: 1 },
  rhythm: null,
  relayLift: () => 0,
  screenX: () => 0.5,
};
const at = (row, lane, overrides = {}) => fieldHeight({ ...base, ...overrides }, row, lane);

// The reference opening hands the whole surface to the cinematic field.
assert.equal(
  at(14, 2, { cinematic: true, shot: 21.88 }),
  cinematicField(14, 2, 21.88, base.shoulder, base.laneFocus),
  "A cinematic frame uses the authored opening field verbatim",
);

// Without the score the resting surface is the settling wave around the shoulder.
assert.equal(
  at(13, 2),
  settlingWave(13 - base.shoulder, 22.44) * columnStrength(2, base.laneFocus),
  "The resting height is the settling wave at the authored width",
);
assert.equal(
  at(13, 2, { flatMix: 1 }),
  0,
  "A fully flattened surface drops the resting wave",
);
assert.equal(
  at(13, 2, { scanBlend: 0.4, flatMix: 1 }),
  at(13, 2, { scanBlend: 0.9, flatMix: 1 }),
  "A flattened surface no longer reads the entry scan",
);
// 19.38s is inside the authored entry-scan window; 24.98s is past it.
const scanLift =
  at(13, 2, { scanTime: 19.38, scanBlend: 0.7 }) - at(13, 2, { scanTime: 19.38, scanBlend: 0 });
assert.ok(Math.abs(scanLift - archiveWave(13, 2, 19.38) * 0.7) < 1e-12, "The entry scan contributes its authored wave");
assert.notEqual(scanLift, 0, "The entry scan is live inside its window");
assert.equal(
  at(13, 2, { idleGain: 1 }) - at(13, 2, { idleGain: 0 }),
  at(13, 2, { idleGain: 1 }) - at(13, 2, { idleGain: 0 }),
  "Idle breathing is deterministic",
);

// Relay targets add their authored height on top of everything else.
assert.equal(
  at(13, 2, { relayLift: () => 0.75 }) - at(13, 2),
  0.75,
  "A relay lift adds exactly its height",
);

// Selection ripples are gated by the motion preference and the pulse gain.
const pulse = [{ row: 13, lane: 2, time: 25.88 - 0.15 }];
const rippled = at(13, 2, { pulses: pulse, selectionPulse: (d, age) => 0.8 * Math.exp(-age) });
assert.ok(rippled > at(13, 2) + 0.2, "A live pulse raises the selected cell");
assert.equal(
  at(13, 2, { pulses: pulse, selectionWave: false, selectionPulse: () => 1 }),
  at(13, 2, { selectionWave: false }),
  "Selection ripples stay off while the motion preference is off",
);
assert.equal(
  at(13, 2, { pulses: pulse, pulseGain: 0, selectionPulse: () => 1 }),
  at(13, 2),
  "A faded pulse gain removes the ripple",
);
assert.equal(
  at(13, 2, { pulses: pulse, deferSelectionPulse: true, selectionPulse: () => 0.8 }),
  at(13, 2, { pulses: pulse, deferSelectionPulse: true, selectionPulse: () => 0.8 }),
  "The deferred envelope stays deterministic",
);
assert.notEqual(
  at(13, 2, { pulses: pulse, selectionPulse: () => 0.8 }),
  at(13, 2, { pulses: pulse, deferSelectionPulse: true, selectionPulse: () => 0.8 }),
  "The deferred envelope reshapes the pulse",
);

// Score displacement only exists while the caller supplies a rhythm frame.
assert.equal(
  at(13, 2, { playfield: { bands: { low: 1, mid: 1, high: 1, activity: 1 }, strength: 1 } }),
  at(13, 2),
  "A band without a rhythm frame does not displace the surface",
);

// One frame of samples is cached until the camera invalidates them.
{
  const field = new ArchiveField();
  const first = field.sample(base, 13, 2);
  assert.equal(field.sample(base, 13, 2), first, "A repeated sample is cached");
  const lifted = { ...base, relayLift: () => 0.75 };
  assert.equal(field.sample(lifted, 13, 2), first, "A cached cell ignores later inputs in the same frame");
  assert.equal(field.sample(lifted, 14, 2), fieldHeight(lifted, 14, 2), "Another cell is sampled normally");
  field.clear();
  assert.equal(field.sample(lifted, 13, 2), first + 0.75, "After the camera advances the cell is resampled");
}

console.log("Cinematic hand-off, field terms and the per-frame sample cache passed.");
