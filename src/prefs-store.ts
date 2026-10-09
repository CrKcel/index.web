// Persisted terminal preferences.
//
// One module owns the storage keys, the forgiving read, the defaults and the
// resolved motion state, so the page only has to hold the live object and the
// settings markup only has to read it.
import { isColorTheme, type ColorTheme } from "./color-theme";
import {
  createMotionPreferences,
  motionPresetFor,
  type MotionPreferences,
  type MotionPreset,
  type StoredMotion,
} from "./motion-preferences";
import { normalizeQuality, type RenderQuality } from "./render-quality";

export const SAVED_KEY = "rhine-saved";
export const SETTINGS_KEY = "rhine-settings";

export type TerminalPreferences = {
  sound: boolean;
  music: boolean;
  soundVolume: number;
  musicVolume: number;
  motion: MotionPreferences;
  motionPreset: MotionPreset;
  quality: boolean;
  rendering: RenderQuality;
  colorTheme: ColorTheme;
};

/** Whatever an older release wrote; every field is optional and unchecked. */
type StoredPreferences = Partial<{
  sound: boolean;
  music: boolean;
  soundVolume: number;
  musicVolume: number;
  reduced: boolean;
  quality: boolean;
  rendering: RenderQuality;
  colorTheme: ColorTheme;
  motion: StoredMotion;
  motionPreset: MotionPreset;
}>;

export function readLocal<T>(key: string, fallback: T): T {
  try {
    return JSON.parse(localStorage.getItem(key) ?? "null") ?? fallback;
  } catch {
    return fallback;
  }
}

/** Storage can be denied outright; a preference is never worth an exception. */
export function writeLocal(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {}
}

export function loadSaved(): Set<string> {
  return new Set(readLocal<string[]>(SAVED_KEY, []));
}

export function storeSaved(saved: ReadonlySet<string>) {
  writeLocal(SAVED_KEY, [...saved]);
}

export function loadPreferences(): TerminalPreferences {
  const stored = readLocal<StoredPreferences>(SETTINGS_KEY, {});
  const motion = createMotionPreferences(
    stored.motion,
    stored.reduced ??
      (stored.motion === undefined
        ? matchMedia("(prefers-reduced-motion: reduce)").matches
        : undefined),
  );
  return {
    sound: stored.sound ?? true,
    music: stored.music ?? stored.sound ?? true,
    soundVolume: stored.soundVolume ?? .55,
    musicVolume: stored.musicVolume ?? .5,
    motion,
    motionPreset: motionPresetFor(motion),
    quality: stored.quality ?? true,
    rendering: normalizeQuality(stored.rendering, stored.quality !== false),
    colorTheme: isColorTheme(stored.colorTheme) ? stored.colorTheme : "system",
  };
}

export function storePreferences(prefs: TerminalPreferences) {
  writeLocal(SETTINGS_KEY, prefs);
}
