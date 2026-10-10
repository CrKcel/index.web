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
import { BOOT_START, FOOTAGE_OFFSET, bootMotion } from "../src/boot-motion.ts";
import { BOOT_CUES } from "../src/audio-types.ts";
import { TYPING_FRAMES } from "../src/typing-rhythm.ts";

// The opening becomes visible at the brand lockup. The audio facade seeds its
// previous sample with the same footage time, so a start at or after the first
// authored cue would swallow that cue, and any lettering frame before the start
// would reveal text the reader never sees.
assert.equal(bootMotion(BOOT_START).step, "logo");
assert.ok(
  BOOT_START + FOOTAGE_OFFSET < BOOT_CUES[0].time,
  "The opening starts before its first authored cue",
);
assert.ok(
  TYPING_FRAMES.every((frame) => frame / 25 > BOOT_START + FOOTAGE_OFFSET),
  "No lettering is revealed before the opening becomes visible",
);

// The lettering sequence reports its own steps; the array timeline overrides it.
assert.equal(bootStep(ARRAY_ENTRY - 0.01, "welcome"), "welcome");
assert.equal(bootStep(ARRAY_ENTRY, "welcome"), "array");
assert.equal(bootStep(SELECTION, "welcome"), "select");
assert.equal(bootStep(INSPECTION, "welcome"), "inspect");
assert.equal(bootStep(OPENING_END, "welcome"), "inspect");

assert.equal(bootTitle(22, "array"), "S");
assert.equal(bootTitle(22.5, "array"), "SELECTING ");
assert.equal(bootTitle(26, "array"), "SELECTING FILES...");
assert.equal(bootTitle(30, "select"), "FILE NUMBER: ");

// Entry fades and the callout rule saturate exactly at their authored ends.
assert.equal(bootEntryOpacity(21.9), 0);
assert.equal(bootEntryOpacity(22.03), 1);
assert.ok(Math.abs(bootEntryOpacity(21.965) - 0.5) < 1e-9, "The entry fade is half way at its midpoint");
assert.equal(bootRuleScale(22.08), 0);
assert.equal(bootRuleScale(22.98), 1);

const cinematic = (t) => bootCinematic(t);
assert.equal(cinematic(21).reveal, 0);
assert.equal(cinematic(22.4).reveal, 1);
assert.equal(cinematic(25).lift, 0);
assert.equal(cinematic(27.8).lift, 1);
assert.equal(cinematic(27).zoom, 0);
assert.equal(cinematic(34).zoom, 1);
assert.equal(cinematic(26).time, 26, "The cinematic reports its own reference time");

// Every authored channel rises without ever stepping back.
let previous = { reveal: -1, lift: -1, zoom: -1 };
for (let t = 21; t <= 35; t += 0.05) {
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
