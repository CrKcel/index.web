// The system settings panel: one authored composition of the theme, audio,
// motion, render-quality and PWA sections, so the settings modal only has to
// hand over the current preferences.
import { audioSettingsMarkup } from "./audio-settings";
import type { ColorTheme } from "./color-theme";
import { pwaSettingsMarkup } from "./pwa";
import { qualityMarkup } from "./quality-settings";
import type { RenderQuality } from "./render-quality";
import { themeSettingsMarkup } from "./theme-ui";

export type SettingsPreferences = {
  colorTheme: ColorTheme;
  sound: boolean;
  music: boolean;
  soundVolume: number;
  musicVolume: number;
  rendering: RenderQuality;
};

export function settingsMarkup(prefs: SettingsPreferences) {
  return `<h2>SYSTEM SETTINGS<small>终端偏好设置</small></h2><p class="settings-intro">JOYCE MOORE <span>·</span> SESSION AUTHORIZED</p><div class="settings-list">${themeSettingsMarkup(prefs.colorTheme)}${audioSettingsMarkup(prefs)}</div>${qualityMarkup(prefs.rendering)}${pwaSettingsMarkup()}<div class="settings-bottom">${document.fullscreenEnabled ? '<button data-action="fullscreen">FULLSCREEN <span>↗</span></button>' : ''}<button data-action="restart">REINITIALIZE SYSTEM <span>↻</span></button></div><div class="modal-bottom"><span>ANALYSIS OS / 1.0</span><span>POWERED BY RHINE LAB</span></div>`;
}
