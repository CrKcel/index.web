// The `window.rhine` review surface.
//
// The browser regressions drive the real application through these calls rather
// than a recorded surrogate, so the protocol -- which one of them may unlock
// audio, in what order state changes -- stays in one documented place. The page
// supplies the state and the intents; this module only owns the surface.
import type { TerminalAudio } from "./audio";
import type { AudioPreferences } from "./audio-types";

export type ReviewHost = {
  /** The scene finished loading. */
  ready(): boolean;
  /** The full diagnostic snapshot, composed by the page. */
  stats(): Record<string, unknown>;
  audio(): TerminalAudio;
  /** Audio preferences as configured, before the preview override. */
  preferences(): AudioPreferences;
  /**
   * Announces a boot preview and returns its request id. The id is compared
   * after every await, so a superseded preview never starts playback.
   */
  beginPreview(): number;
  currentPreview(): number;
  setPreview(on: boolean): void;
  /** Re-applies the stored audio preferences after a cancelled preview. */
  resetAudio(): void;
  replayBoot(forcePreview: boolean): void;
  /** Puts the opening timeline at `t` seconds without restarting the page. */
  startBootAt(t: number): void;
  setMode(mode: "boot" | "archive" | "detail"): void;
  openFile(): void;
  select(index: number): void;
};

export function installReviewApi(host: ReviewHost) {
  Object.assign(window, {
    rhine: {
      // The review button supplies a real user activation. Preferences stay local to this preview.
      playBootPreview: async (music = false) => {
        if (!host.ready() || !navigator.userActivation.isActive) return false;
        const request = host.beginPreview();
        host.audio().configure({ ...host.preferences(), sound: true, music });
        const unlocked = await host.audio().unlock();
        if (request !== host.currentPreview()) return false;
        if (!unlocked) {
          host.setPreview(false);
          host.resetAudio();
          return false;
        }
        host.replayBoot(true);
        return true;
      },
      seek: (t: number) => host.startBootAt(t),
      archive: () => host.setMode("archive"),
      detail: () => host.openFile(),
      select: (i: number) => host.select(i),
      stats: () => host.stats(),
    },
  });
}
