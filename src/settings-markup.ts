// The system settings panel: one authored composition of the theme, audio,
// motion and PWA sections, so the settings modal only has to hand over the
// current preferences.
import { audioSettingsMarkup } from "./audio-settings";
import type { ColorTheme } from "./color-theme";
import { pwaSettingsMarkup } from "./pwa";
import { themeSettingsMarkup } from "./theme-ui";

export type SettingsPreferences = {
  colorTheme: ColorTheme;
  sound: boolean;
  music: boolean;
  soundVolume: number;
  musicVolume: number;
};

export function settingsMarkup(prefs: SettingsPreferences) {
  const fullscreen = document.fullscreenEnabled ? '<button data-action="fullscreen">FULLSCREEN <span>↗</span></button>' : "";
  return `<h2>SYSTEM SETTINGS<small>终端偏好设置</small></h2><p class="settings-intro">JOYCE MOORE <span>·</span> SESSION AUTHORIZED</p><div class="settings-list">${themeSettingsMarkup(prefs.colorTheme)}${audioSettingsMarkup(prefs)}</div>${pwaSettingsMarkup()}<footer class="settings-footer"><div class="settings-actions">${fullscreen}<button data-action="restart">REINITIALIZE SYSTEM <span>↻</span></button></div><div class="settings-meta"><span>ANALYSIS OS / 1.0</span><span>POWERED BY RHINE LAB</span></div></footer>`;
}
