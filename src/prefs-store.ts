// Persisted terminal preferences.
//
// One module owns the storage keys, the forgiving read and the defaults, so the
// page only has to hold the live object and the settings markup only has to
// read it.
import { isColorTheme, type ColorTheme } from "./color-theme";

export const SAVED_KEY = "rhine-saved";
export const SETTINGS_KEY = "rhine-settings";

export type TerminalPreferences = {
  sound: boolean;
  music: boolean;
  soundVolume: number;
  musicVolume: number;
  colorTheme: ColorTheme;
};

/** Whatever an older release wrote; every field is optional and unchecked. */
type StoredPreferences = Partial<{
  sound: boolean;
  music: boolean;
  soundVolume: number;
  musicVolume: number;
  colorTheme: ColorTheme;
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
  return {
    sound: stored.sound ?? true,
    music: stored.music ?? stored.sound ?? true,
    soundVolume: stored.soundVolume ?? .55,
    musicVolume: stored.musicVolume ?? .5,
    colorTheme: isColorTheme(stored.colorTheme) ? stored.colorTheme : "system",
  };
}

export function storePreferences(prefs: TerminalPreferences) {
  writeLocal(SETTINGS_KEY, prefs);
}
