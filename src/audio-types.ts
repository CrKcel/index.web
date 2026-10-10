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
/** Opening effect cues in app seconds, on the same clock as the camera. */
export const BOOT_CUES: readonly { time: number; sound: Sound }[] = [
  { time: 0.04, sound: "brand" },
  { time: 2.72, sound: "confirm" },
  { time: 7.6, sound: "scan" },
  { time: 9.96, sound: "confirm" },
  { time: 10.88, sound: "welcome" },
  { time: 11.64, sound: "text-reveal" },
  { time: 13.16, sound: "text-reveal" },
  { time: 15.04, sound: "array" },
  { time: 18.8, sound: "open" },
  { time: 22.42, sound: "inspect" },
];
