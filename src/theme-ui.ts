import "./theme.css";
import { colorThemes, ColorTheme } from "./color-theme";
import { themePalette as palette, themeRgb as rgb } from "./theme-palette";
let previous = -1;
export let themeAmount = 0;
export function paintTheme(amount: number) {
  if (Math.abs(amount - previous) < .0001) return;
  previous = themeAmount = amount;
  const root = document.documentElement;
  root.dataset.darkSurface = String(amount > .0001);
  // The head bootstrap can only paint the resolved dark paper; the stylesheet
  // and the interpolated variables below own the surface from the first frame on.
  root.style.removeProperty("background-color");
  for (const [name, values] of Object.entries(palette)) {
    const from = rgb(values[0]), to = rgb(values[1]);
    const value = from.map((v, i) => Math.round(v + (to[i] - v) * amount)).join(", ");
    root.style.setProperty(`--theme-${name}`, `rgb(${value})`);
    root.style.setProperty(`--theme-${name}-rgb`, value);
  }
}

export function themeSettingsMarkup(theme: ColorTheme) {
  const choices = colorThemes
    .map(([value, label]) => `<button data-color-theme="${value}" aria-pressed="${theme === value}">${label}</button>`)
    .join("");
  return `<div class="theme-settings"><strong>界面配色</strong><div class="theme-choices" role="group" aria-label="界面配色">${choices}</div></div>`;
}
