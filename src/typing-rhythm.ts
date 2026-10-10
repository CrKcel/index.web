import { bootMotion } from "./boot-motion";

// Use the actual 25 fps text reveal, including the first character of each field.
// Glitch restoration at frames 251/257/258 is not new typing.
export const TYPING_FRAMES: readonly number[] = [
  [54, 67],
  [92, 111],
  [139, 161],
  [195, 212],
  [221, 229],
].flatMap(([start, end]) => {
  const frames: number[] = [];
  let previous = 0;
  for (let frame = start; frame <= end; frame++) {
    const motion = bootMotion(frame / 25);
    const text = motion.auth;
    const count = text.replace(/\s/g, "").length;
    if (count > previous) frames.push(frame);
    previous = count;
  }
  return frames;
});

export function hasTypingBetween(previousTime: number, time: number) {
  return TYPING_FRAMES.some(
    (frame) =>
      frame / 25 > previousTime + 1e-6 && frame / 25 <= time + 1e-6,
  );
}
