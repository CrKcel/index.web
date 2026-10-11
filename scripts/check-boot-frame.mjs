// The opening timeline drives audio cues, the lettering sequence and the camera,
// so its authored thresholds and easings are pinned here.
import assert from "node:assert/strict";
import {
  ARRAY_ENTRY,
  INSPECTION,
  OPENING_END,
  SELECTION,
  WELCOME_FLASH,
  WELCOME_HOLD,
  bootCinematic,
  bootEntryOpacity,
  bootRuleScale,
  bootStep,
  bootTitle,
  isWelcomePause,
} from "../src/boot-frame.ts";
import { BOOT_START, bootMotion } from "../src/boot-motion.ts";
import { BOOT_CUES } from "../src/audio-types.ts";
import { TYPING_FRAMES, TYPING_WINDOWS } from "../src/typing-rhythm.ts";

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

// The key-click audio reads the declared windows while the reveal itself lives
// in the timeline, so a retimed field must not leave the two out of step: every
// frame that adds a character falls inside a window, and a window ends on a
// frame that really reveals its last character.
const declaredFrames = new Set();
for (const [start, end] of TYPING_WINDOWS)
  for (let frame = start; frame <= end; frame++) declaredFrames.add(frame);
let revealed = 0;
// The glitch from frame 182 restores text that was already typed, so the walk
// stops before it.
for (let frame = 0; frame <= 181; frame++) {
  const motion = bootMotion(frame / 25);
  if (!motion.authOpacity) {
    revealed = 0;
    continue;
  }
  const count = motion.auth.replace(/\s/g, "").length;
  if (count > revealed)
    assert.ok(
      declaredFrames.has(frame),
      `Frame ${frame} reveals a character outside the declared typing windows`,
    );
  revealed = count;
}
for (const [, end] of TYPING_WINDOWS)
  assert.ok(
    TYPING_FRAMES.includes(end),
    `Typing window ends at ${end}, which reveals no character`,
  );

// The lettering sequence reports its own steps; the array timeline overrides it.
assert.equal(bootStep(ARRAY_ENTRY - 0.01, "welcome"), "welcome");
assert.equal(bootStep(ARRAY_ENTRY, "welcome"), "array");
assert.equal(bootStep(SELECTION, "welcome"), "select");
assert.equal(bootStep(INSPECTION, "welcome"), "inspect");
assert.equal(bootStep(OPENING_END, "welcome"), "inspect");

assert.equal(bootTitle(15.12, "array"), "S");
assert.equal(bootTitle(15.62, "array"), "SELECTING ");
assert.equal(bootTitle(19.12, "array"), "SELECTING FILES...");
assert.equal(bootTitle(23.12, "select"), "FILE NUMBER: ");

// Entry fades and the callout rule saturate exactly at their authored ends.
assert.equal(bootEntryOpacity(15.02), 0);
assert.equal(bootEntryOpacity(15.15), 1);
// A downloaded release restarts the page in the welcome pause, so the pause has
// to be a settled frame the next load can continue from: the composed card is
// on screen, no channel is mid-transition, the camera has not moved, and the
// reading falls between the last text reveal and the array-entry cue so the
// restart neither swallows a cue nor delays one.
const pause = bootMotion(WELCOME_HOLD);
assert.equal(pause.step, "welcome");
assert.equal(pause.welcomeVisible, true);
assert.equal(pause.exit, 0, "The card has not started its exit at the pause");
assert.equal(pause.white, 0, "The white flash has not started at the pause");
assert.equal(isWelcomePause(WELCOME_HOLD), true);
assert.equal(isWelcomePause(WELCOME_HOLD - 0.01), false, "The restart does not fire before the pause");
assert.equal(isWelcomePause(WELCOME_FLASH), false, "The restart does not fire once the card starts leaving");
assert.equal(bootMotion(WELCOME_FLASH).white, 0, "The window ends where the white flash starts");
assert.ok(bootMotion(WELCOME_FLASH + 0.04).white > 0, "The white flash follows the window");
assert.equal(
  BOOT_CUES.filter((cue) => cue.time < WELCOME_HOLD).at(-1).sound,
  "text-reveal",
);
assert.equal(
  BOOT_CUES.find((cue) => cue.time > WELCOME_HOLD).sound,
  "array",
);
const pauseCinematic = bootCinematic(WELCOME_HOLD);
assert.equal(
  pauseCinematic.reveal + pauseCinematic.lift + pauseCinematic.zoom,
  0,
  "The camera has not moved at the pause",
);
assert.ok(Math.abs(bootEntryOpacity(15.085) - 0.5) < 1e-9, "The entry fade is half way at its midpoint");
assert.equal(bootRuleScale(15.2), 0);
assert.equal(bootRuleScale(16.1), 1);

const cinematic = (t) => bootCinematic(t);
assert.equal(cinematic(14.12).reveal, 0);
assert.equal(cinematic(15.52).reveal, 1);
assert.equal(cinematic(18.12).lift, 0);
assert.equal(cinematic(20.92).lift, 1);
assert.equal(cinematic(20.12).zoom, 0);
assert.equal(cinematic(27.12).zoom, 1);
assert.equal(cinematic(19.12).time, 19.12, "The cinematic reports its own reference time");

// Every authored channel rises without ever stepping back.
let previous = { reveal: -1, lift: -1, zoom: -1 };
for (let t = 14.12; t <= 28.12; t += 0.05) {
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
