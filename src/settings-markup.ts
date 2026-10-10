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
  return `<h2>SYSTEM SETTINGS<small>终端偏好设置</small></h2><p class="settings-intro">JOYCE MOORE <span>·</span> SESSION AUTHORIZED</p><div class="settings-list">${themeSettingsMarkup(prefs.colorTheme)}${audioSettingsMarkup(prefs)}</div>${qualityMarkup(prefs.rendering)}${pwaSettingsMarkup()}<div class="settings-shortcuts"><span>KEYBOARD CONTROLS</span><p><kbd>←</kbd><kbd>→</kbd> 切列 <kbd>↑</kbd><kbd>↓</kbd> 选档 <kbd>ENTER</kbd> 读取 <kbd>/</kbd> 检索 <kbd>ESC</kbd> 返回</p></div><div class="settings-bottom">${document.fullscreenEnabled ? '<button data-action="fullscreen">FULLSCREEN <span>↗</span></button>' : ''}<button data-action="restart">REINITIALIZE SYSTEM <span>↻</span></button></div><div class="modal-bottom"><span>ANALYSIS OS / 1.0 · 使用系统字体</span><span>POWERED BY RHINE LAB</span></div>`;
}
