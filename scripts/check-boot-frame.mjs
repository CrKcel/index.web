// The opening timeline drives audio cues, the lettering sequence and the camera,
// so its authored thresholds and easings are pinned here.
import assert from "node:assert/strict";
import {
  ARRAY_ENTRY,
  INSPECTION,
  OPENING_END,
  SELECTION,
  bootCinematic,
  bootEntryOpacity,
  bootRuleScale,
  bootStep,
  bootTitle,
} from "../src/boot-frame.ts";
import { BOOT_START, bootMotion } from "../src/boot-motion.ts";
import { BOOT_CUES } from "../src/audio-types.ts";
import { TYPING_FRAMES } from "../src/typing-rhythm.ts";

// The opening becomes visible at the brand lockup. The audio facade seeds its
// previous sample with the same app time, so a start at or after the first
// authored cue would swallow that cue, and any lettering frame before the start
// would reveal text the reader never sees.
assert.equal(bootMotion(BOOT_START).step, "logo");
assert.ok(
  BOOT_START < BOOT_CUES[0].time,
  "The opening starts before its first authored cue",
);
assert.ok(
  TYPING_FRAMES.every((frame) => frame / 25 > BOOT_START),
  "No lettering is revealed before the opening becomes visible",
);

// The lettering sequence reports its own steps; the array timeline overrides it.
assert.equal(bootStep(ARRAY_ENTRY - 0.01, "welcome"), "welcome");
assert.equal(bootStep(ARRAY_ENTRY, "welcome"), "array");
assert.equal(bootStep(SELECTION, "welcome"), "select");
assert.equal(bootStep(INSPECTION, "welcome"), "inspect");
assert.equal(bootStep(OPENING_END, "welcome"), "inspect");

assert.equal(bootTitle(17.88, "array"), "S");
assert.equal(bootTitle(18.38, "array"), "SELECTING ");
assert.equal(bootTitle(21.88, "array"), "SELECTING FILES...");
assert.equal(bootTitle(25.88, "select"), "FILE NUMBER: ");

// Entry fades and the callout rule saturate exactly at their authored ends.
assert.equal(bootEntryOpacity(17.78), 0);
assert.equal(bootEntryOpacity(17.91), 1);
assert.ok(Math.abs(bootEntryOpacity(17.845) - 0.5) < 1e-9, "The entry fade is half way at its midpoint");
assert.equal(bootRuleScale(17.96), 0);
assert.equal(bootRuleScale(18.86), 1);

const cinematic = (t) => bootCinematic(t);
assert.equal(cinematic(16.88).reveal, 0);
assert.equal(cinematic(18.28).reveal, 1);
assert.equal(cinematic(20.88).lift, 0);
assert.equal(cinematic(23.68).lift, 1);
assert.equal(cinematic(22.88).zoom, 0);
assert.equal(cinematic(29.88).zoom, 1);
assert.equal(cinematic(21.88).time, 21.88, "The cinematic reports its own reference time");

// Every authored channel rises without ever stepping back.
let previous = { reveal: -1, lift: -1, zoom: -1 };
for (let t = 16.88; t <= 30.88; t += 0.05) {
  const frame = cinematic(t);
  for (const key of ["reveal", "lift", "zoom"])
    assert.ok(
      frame[key] >= previous[key] - 1e-12,
      `${key} stays monotone at ${t.toFixed(2)}s`,
    );
  for (const key of ["reveal", "lift", "zoom"])
    assert.ok(frame[key] >= 0 && frame[key] <= 1, `${key} stays normalized at ${t.toFixed(2)}s`);
  previous = frame;
}

console.log(
  "Opening start, steps, entry fades and the cinematic channels passed.",
);
