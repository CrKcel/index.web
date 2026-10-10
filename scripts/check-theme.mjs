import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";
import { ThemeWave } from "../src/theme-motion.ts";
import { resolveDarkTheme } from "../src/color-theme.ts";
import { themePalette, themeRgb } from "../src/theme-palette.ts";

// The cascade spreads from the origin; a card caught mid-transition keeps its
// own value when the user flips the theme back.
const wave = new ThemeWave();
const center = { lane: 2, row: 12 },
  far = { lane: 5, row: 20 };
wave.set(true, 0, center);
wave.beginFrame();
const origin = wave.sample(center, 0.3),
  distant = wave.sample(far, 0.3);
assert.ok(origin > distant && origin > 0 && origin < 1, "Origin changes first");
wave.set(false, 0.3, center);
assert.equal(wave.sample(center, 0.3), origin);
assert.equal(
  wave.sample(far, 0.3),
  distant,
  "Reversal preserves each current card",
);
wave.beginFrame();
assert.equal(wave.sample(center, 2), 0);
assert.equal(wave.sample(far, 2), 0);
assert.equal(wave.background(2), 0);
// The immediate form skips the cascade and lands on the target at once, which
// the first paint uses so a reload never animates from the other theme.
wave.set(true, 3, center, true);
assert.equal(wave.sample(far, 3), 1);
assert.equal(wave.background(3), 1, "An immediate theme change lands on its target");
// Cells that enter the pool while the wave is settled must not replay it.
const settled = new ThemeWave();
settled.set(true, 12, center);
settled.beginFrame();
assert.equal(settled.sample(far, 14), 1);
settled.set(false, 14, center);
assert.equal(
  settled.sample({ row: -300, lane: -20 }, 14),
  1,
  "A cell entering a settled wave takes the target value",
);
// Sampled values stay inside their endpoints everywhere in the lattice.
wave.set(false, 4, center);
wave.beginFrame();
for (let i = -100; i < 100; i++) {
  const value = wave.sample({ lane: i, row: i }, 4.2);
  assert.ok(value >= 0 && value <= 1);
}

// The dark surface has to exist before the module bundle can paint it, so the
// two endpoint sets live in theme.css and the choice is resolved by an inline
// bootstrap in index.html. Both are copies of src/theme-palette.ts and the
// resolver in src/color-theme.ts; every copy is checked here instead of trusted.
const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");
const css = await read("src/theme.css");
function paletteBlock(selector) {
  const rule = new RegExp(`${selector}\\s*\\{([^}]*)\\}`).exec(css);
  assert.ok(rule, `src/theme.css must define ${selector}`);
  return Object.fromEntries(
    [...rule[1].matchAll(/--theme-([a-z]+)(-rgb)?:\s*([^;]+);/g)].map(
      ([, name, triplet, value]) => [`${name}${triplet ?? ""}`, value.trim()],
    ),
  );
}
const light = paletteBlock(":root"),
  dark = paletteBlock('\\[data-dark-surface="true"\\]');
for (const [name, endpoints] of Object.entries(themePalette))
  endpoints.forEach((hex, index) => {
    const state = index ? dark : light,
      which = index ? "dark" : "light";
    assert.equal(
      state[name],
      hex,
      `theme.css ${which} --theme-${name} must match src/theme-palette.ts`,
    );
    assert.equal(
      state[`${name}-rgb`],
      themeRgb(hex).join(", "),
      `theme.css ${which} --theme-${name}-rgb must match src/theme-palette.ts`,
    );
  });
assert.deepEqual(
  Object.keys(light).sort(),
  Object.keys(dark).sort(),
  "Both surfaces must define the same variables",
);

const html = await read("index.html");
const boot = /<script data-theme-boot>([\s\S]*?)<\/script>/.exec(html);
assert.ok(boot, "index.html must carry the first-paint theme bootstrap");
assert.ok(
  html.indexOf("data-theme-boot") < html.indexOf("</head>"),
  "The bootstrap must resolve the theme before the body is parsed",
);
function bootstrap(stored, prefersDark) {
  const dataset = {},
    style = {};
  runInNewContext(boot[1], {
    localStorage: { getItem: () => stored },
    matchMedia: () => ({ matches: prefersDark }),
    document: { documentElement: { dataset, style } },
  });
  return { dark: dataset.darkSurface === "true", background: style.backgroundColor };
}
for (const preference of ["system", "light", "dark"])
  for (const prefersDark of [false, true]) {
    const result = bootstrap(JSON.stringify({ colorTheme: preference }), prefersDark);
    assert.equal(
      result.dark,
      resolveDarkTheme(preference, prefersDark),
      `The bootstrap must agree with resolveDarkTheme for ${preference}/${prefersDark}`,
    );
  }
// Storage that is empty, unreadable or written by an older release falls back to
// the default "system" preference exactly like loadPreferences does.
for (const stored of [null, "", "null", "{", JSON.stringify({ colorTheme: "sepia" })])
  for (const prefersDark of [false, true]) {
    const result = bootstrap(stored, prefersDark);
    assert.equal(
      result.dark,
      resolveDarkTheme("system", prefersDark),
      `Unusable storage must follow the system`,
    );
    assert.equal(
      result.background,
      prefersDark ? themePalette.paper[1] : undefined,
      "Only the dark first paint needs a concrete colour",
    );
  }
assert.equal(
  bootstrap(JSON.stringify({ colorTheme: "dark" }), false).background,
  themePalette.paper[1],
  "The dark first paint must not wait for the stylesheet",
);
assert.equal(
  bootstrap(JSON.stringify({ colorTheme: "light" }), true).background,
  undefined,
  "A light reader must not be painted dark first",
);
console.log(
  "Theme cascade, reversal continuity, endpoints, settled pool, immediate change, cast/bootstrap drift and dark first paint passed.",
);
