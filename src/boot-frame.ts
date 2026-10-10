// The opening timeline as pure functions.
//
// The reader still drives audio, the lettering sequence and the DOM dataset from
// these readings, but the authored thresholds and easings live here so the
// reference timing is reviewable and checkable without a page. Times are app
// seconds, shared with the lettering sequence in `boot-motion`.
export type BootCinematic = {
  reveal: number;
  lift: number;
  zoom: number;
  time: number;
};

const ease = (t: number) => {
  t = Math.max(0, Math.min(1, t));
  return t * t * (3 - 2 * t);
};

/** The array enters, selection starts, inspection starts. */
export const ARRAY_ENTRY = 15.12;
export const SELECTION = 18.8;
export const INSPECTION = 21.42;
/** The opening hands the terminal to the detail view. */
export const OPENING_END = 28.12;

/** The stage's opening step, whichever came last. */
export function bootStep(t: number, motionStep: string): string {
  if (t >= INSPECTION) return "inspect";
  if (t >= SELECTION) return "select";
  if (t >= ARRAY_ENTRY) return "array";
  return motionStep;
}

/** The typed status line of the entry callout. */
export function bootTitle(t: number, step: string): string {
  return step === "array"
    ? "SELECTING FILES...".slice(0, Math.max(0, Math.floor((t - 15.06) * 18)))
    : "FILE NUMBER: ";
}

/** Entry fade and callout rule, as authored fractions. */
export const bootEntryOpacity = (t: number) => ease((t - 15.02) / 0.13);
export const bootRuleScale = (t: number) => ease((t - 15.2) / 0.9);

/** The camera choreography the scene reads as its cinematic input. */
export function bootCinematic(t: number): BootCinematic {
  return {
    reveal: ease((t - 15.12) / 0.4),
    lift: ease((t - 19.12) / 1.8),
    zoom: 0.55 * ease((t - 20.42) / 1.65) + 0.45 * ease((t - 22.12) / 5.0),
    time: t,
  };
}
