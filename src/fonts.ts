// The interface ships no webfont: every surface uses the platform's own UI
// fonts. CSS keeps the same list in `--font-system`; this constant serves the 2D
// canvas label and the inline SVG that cannot read a custom property. Names are
// single-quoted so the stack can also be embedded in a double-quoted attribute.
// Order: the authored size first (MiSans), each platform's named UI sans before
// the themeable `system-ui`, then generic Latin fallbacks.
export const systemFontStack =
  "MiSans, 'Mi Sans', -apple-system, BlinkMacSystemFont, 'PingFang SC', 'Hiragino Sans GB', 'Segoe UI', 'Microsoft YaHei UI', 'Microsoft YaHei', Roboto, 'Noto Sans', 'Noto Sans CJK SC', 'Noto Sans SC', 'Source Han Sans SC', 'WenQuanYi Micro Hei', Ubuntu, Cantarell, 'DejaVu Sans', system-ui, Arial, Helvetica, sans-serif";
