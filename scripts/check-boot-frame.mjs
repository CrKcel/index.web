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

console.log("Opening steps, entry fades and the cinematic channels passed.");
