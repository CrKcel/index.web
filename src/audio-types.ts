// Shared vocabulary of the audio layer: the sound catalogue, the four scenes
// that remix the stems, the persisted preferences, and the two primitives the
// synthesis and the transport both need (level ramps and the opening cue list).
// This module must stay dependency-free so the synth, the music transport and
// the TerminalAudio facade can all import it without a cycle.
/** The effect catalogue. Ordered as authored; the check walks this list. */
export const SOUND_TYPES = [
  "page-open",
  "page-close",
  "ui-tick",
  "brand",
  "text-reveal",
  "key",
  "tick",
  "column",
  "open",
  "confirm",
  "back",
  "scan",
  "welcome",
  "array",
  "inspect",
  "explode",
  "assemble",
] as const;
export type Sound = (typeof SOUND_TYPES)[number];
export type SoundScene = "boot" | "archive" | "detail" | "viewer";
export type AudioPreferences = {
  sound: boolean;
  music: boolean;
  soundVolume: number;
  musicVolume: number;
};
export const clamp = (x: number) =>
  Math.max(0, Math.min(1, Number.isFinite(x) ? x : 0));
/** Firefox has no cancelAndHoldAtTime (bug 1308629), so hold the current value explicitly. */
export const rampLevel = (
  param: AudioParam,
  value: number,
  now: number,
  seconds = 0.05,
) => {
  if (typeof param.cancelAndHoldAtTime === "function") {
    param.cancelAndHoldAtTime(now);
  } else {
    const held = param.value;
    param.cancelScheduledValues(now);
    param.setValueAtTime(held, now);
  }
  param.linearRampToValueAtTime(value, now + seconds);
};
export const BOOT_CUES: readonly { time: number; sound: Sound }[] = [
  { time: 9.16, sound: "brand" },
  { time: 11.84, sound: "confirm" },
  { time: 19.48, sound: "scan" },
  { time: 21.84, sound: "confirm" },
  { time: 22.76, sound: "welcome" },
  { time: 23.52, sound: "text-reveal" },
  { time: 25.04, sound: "text-reveal" },
  { time: 26.92, sound: "array" },
  { time: 30.68, sound: "open" },
  { time: 34.3, sound: "inspect" },
];
