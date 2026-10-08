export type ColorTheme = "system" | "light" | "dark";
export const colorThemes: ReadonlyArray<[ColorTheme, string]> = [
  ["system", "跟随系统"],
  ["light", "亮色"],
  ["dark", "暗色"],
];
export function isColorTheme(value: unknown): value is ColorTheme {
  return colorThemes.some(([theme]) => theme === value);
}
export function systemPrefersDark() {
  return matchMedia("(prefers-color-scheme: dark)").matches;
}
/** Resolves a stored preference to the concrete dark or light surface. */
export function resolveDarkTheme(theme: ColorTheme, prefersDark = systemPrefersDark()) {
  return theme === "dark" || (theme === "system" && prefersDark);
}
