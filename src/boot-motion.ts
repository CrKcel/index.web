// The opening runs on one clock in app seconds, counted from the page load.
// Its own frame grid is 25 fps: discrete editorial cuts land on frame numbers,
// spatial motion uses the continuous time.
import { brandTrack, companyTrack, scanTrack, track } from "./boot-tracks";
import { scanOrbitTrack } from "./boot-orbit-tracks";
import { bootLogoTrack } from "./boot-logo-tracks";
/** Opening clock origin: app 0.00 s is the page load, where the brand lockup
 *  starts drawing. */
export const BOOT_START = 0;
export const progress = (t: number, a: number, b: number) =>
  Math.max(0, Math.min(1, (t - a) / (b - a)));
export const smooth = (p: number) => p * p * (3 - 2 * p);
const typed = (text: string, f: number, start: number, end: number) =>
  text.slice(
    0,
    f < start
      ? 0
      : Math.min(
          text.length,
          1 + Math.floor(((f - start) * (text.length - 1)) / (end - start)),
        ),
  );
const at = (f: number, frames: number[]) => frames.includes(f);

export function bootMotion(t: number) {
  const f = Math.floor(t * 25 + 0.00001);
  const step =
    t < 2 ? "logo" : t < 7.6 ? "auth" : t < 10.88 ? "scan" : "welcome";
  let auth = "";
  // Each entry rests for roughly half a second before the next one starts
  // typing, and the scan takes over on frame 190.
  if (f < 98) {
    auth = typed("ID CONFIRMED", f, 54, 62);
    // The separator lands a short beat after the status line, so the name
    // reads as the same entry rather than a second one.
    if (f >= 71) auth += " : " + typed("JOYCE MOORE", f, 72, 82);
  } else if (f < 132) auth = typed("REQUEST RECEIVED", f, 102, 116);
  else {
    auth = typed("START PROCESSING", f, 134, 151);
    if (f >= 160)
      auth += ".".repeat(Math.min(3, 1 + Math.floor((f - 160) / 4)));
    if (at(f, [182, 188, 189])) auth = "              SING...";
  }
  const frame = t * 25;
  const scan = scanTrack(frame);
  const scanOrbit = scanOrbitTrack(frame);
  const scanGlitch = at(f, [228, 229, 231, 232]);
  const welcomeIntro = [1, 0, 0.28, 0, 1, 0, 0];
  const flashIndex = f - 272;
  const exit = smooth(progress(t, 14.68, 15.04));
  return {
    t,
    f,
    step,
    auth,
    logoOpacity: t >= 0.04 && t < 7.6 ? 1 : 0,
    logo: bootLogoTrack(frame),
    logoLetters: typed("RHINE·LAB", f, 4, 27),
    authOpacity: f >= 53 && f < 190 ? 1 : 0,
    brand: [0, 1, 2].map((line) => brandTrack(frame, line)),
    poweredLetters: typed("POWERED BY RHINE LAB", f, 51, 67).length,
    scanVisible: t >= 7.6 && t < 10.88,
    scan,
    scanOrbit,
    scanRadius: scan.radius,
    ringScale: scanGlitch ? 1.94 : 1,
    ringOpacity: scanGlitch
      ? 0.32
      : track(
          [
            [190, 0],
            [191, 0.18],
            [193, 0.6],
            [196, 1],
          ],
          frame,
        ),
    ringBlur: scanGlitch ? 2.2 : 0,
    scanTracking: track(
      [
        [190, 40],
        [195, 28],
        [200, 18],
        [203, 14],
        [208, 8],
        [213, 4],
        [218, 1.7],
        [223, 0.5],
        [230, 0],
        [271, 0],
      ],
      frame,
    ),
    scanFont: 26.5,
    permissionOpacity:
      t < 9.92
        ? progress(t, 7.6, 8.0)
        : track(
            [
              [248, 1],
              [249, 0.4],
              [250, 0.3],
              [251, 0.25],
              [252, 0.1],
              [253, 0.04],
              [254, 0],
            ],
            frame,
          ),
    ornament: t >= 9.96,
    coreRadius: scanOrbit.coreRadius,
    welcomeVisible: t >= 10.88 && t < 15.04,
    welcomePanel:
      flashIndex >= 0 && flashIndex < 7 ? welcomeIntro[flashIndex] : 0,
    welcomeInk:
      flashIndex >= 0 && flashIndex < 7
        ? [0, 0, 0.2, 1, 0, 0, 0.25][flashIndex]
        : 1,
    companyVisible: f >= 291 && !at(f, [293, 294]),
    companyMask: at(f, [297, 298]),
    highlight: companyTrack(frame),
    databaseOpacity: f < 329 || at(f, [331, 332, 334, 337]) ? 0 : 1,
    welcomeLogo: f >= 291,
    welcomeScale: 1 - 0.46 * exit,
    welcomeOpacity: 1 - Math.pow(exit, 3),
    exitBlur: 8 * exit,
    exit,
    backgroundOpacity: t < 15.04 ? 1 : 0,
    white: smooth(progress(t, 14.28, 15.0)),
  };
}
