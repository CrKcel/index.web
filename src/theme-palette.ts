// The two surface endpoints `paintTheme` interpolates between: [light, dark].
//
// The module bundle is far too late for the first frame, so the endpoints are
// also spelled out as custom properties in `src/theme.css`, which is what
// answers the `data-dark-surface` the head bootstrap in index.html flips before
// the body is parsed. `scripts/check-theme.mjs` keeps the copies from drifting.
export const themePalette = {
  ink: ["#080a08", "#e0e3dc"],
  muted: ["#77756d", "#a6b0b1"],
  line: ["#aaa59a", "#536166"],
  paper: ["#eae5e1", "#11181b"],
  panel: ["#edebe4", "#202a2f"],
  field: ["#e7e3d9", "#2a363b"],
  accent: ["#9b7247", "#c5a16b"],
} as const;

/** A hex endpoint as the `r, g, b` triplet the CSS custom properties carry. */
export function themeRgb(hex: string) {
  return [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
}
