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
    t < 2 ? "logo" : t < 10.36 ? "auth" : t < 13.64 ? "scan" : "welcome";
  let auth = "";
  if (f < 135) {
    auth = typed("ID CONFIRMED", f, 54, 67);
    if (f >= 92) auth += " : " + typed("JOYCE MOORE", f, 93, 111);
  } else if (f < 193) auth = typed("REQUEST RECEIVED", f, 139, 161);
  else {
    auth = typed("START PROCESSING", f, 195, 212);
    if (f >= 221)
      auth += ".".repeat(Math.min(3, 1 + Math.floor((f - 221) / 4)));
    if (at(f, [251, 257, 258])) auth = "              SING...";
  }
  const frame = t * 25;
  const scan = scanTrack(frame);
  const scanOrbit = scanOrbitTrack(frame);
  const scanGlitch = at(f, [297, 298, 300, 301]);
  const welcomeIntro = [1, 0, 0.28, 0, 1, 0, 0];
  const flashIndex = f - 341;
  const exit = smooth(progress(t, 17.44, 17.8));
  return {
    t,
    f,
    step,
    auth,
    logoOpacity: t >= 0.04 && t < 10.36 ? 1 : 0,
    logo: bootLogoTrack(frame),
    logoLetters: typed("RHINE·LAB", f, 4, 27),
    authOpacity: f >= 53 && f < 259 ? 1 : 0,
    brand: [0, 1, 2].map((line) => brandTrack(frame, line)),
    poweredLetters: typed("POWERED BY RHINE LAB", f, 51, 67).length,
    scanVisible: t >= 10.36 && t < 13.64,
    scan,
    scanOrbit,
    scanRadius: scan.radius,
    ringScale: scanGlitch ? 1.94 : 1,
    ringOpacity: scanGlitch
      ? 0.32
      : track(
          [
            [259, 0],
            [260, 0.18],
            [262, 0.6],
            [265, 1],
          ],
          frame,
        ),
    ringBlur: scanGlitch ? 2.2 : 0,
    scanTracking: track(
      [
        [259, 40],
        [264, 28],
        [269, 18],
        [272, 14],
        [277, 8],
        [282, 4],
        [287, 1.7],
        [292, 0.5],
        [299, 0],
        [340, 0],
      ],
      frame,
    ),
    scanFont: 26.5,
    permissionOpacity:
      t < 12.68
        ? progress(t, 10.36, 10.76)
        : track(
            [
              [317, 1],
              [318, 0.4],
              [319, 0.3],
              [320, 0.25],
              [321, 0.1],
              [322, 0.04],
              [323, 0],
            ],
            frame,
          ),
    ornament: t >= 12.72,
    coreRadius: scanOrbit.coreRadius,
    welcomeVisible: t >= 13.64 && t < 17.8,
    welcomePanel:
      flashIndex >= 0 && flashIndex < 7 ? welcomeIntro[flashIndex] : 0,
    welcomeInk:
      flashIndex >= 0 && flashIndex < 7
        ? [0, 0, 0.2, 1, 0, 0, 0.25][flashIndex]
        : 1,
    companyVisible: f >= 360 && !at(f, [362, 363]),
    companyMask: at(f, [366, 367]),
    highlight: companyTrack(frame),
    databaseOpacity: f < 398 || at(f, [400, 401, 403, 406]) ? 0 : 1,
    welcomeLogo: f >= 360,
    welcomeScale: 1 - 0.46 * exit,
    welcomeOpacity: 1 - Math.pow(exit, 3),
    exitBlur: 8 * exit,
    exit,
    backgroundOpacity: t < 17.8 ? 1 : 0,
    white: smooth(progress(t, 17.04, 17.76)),
  };
}
