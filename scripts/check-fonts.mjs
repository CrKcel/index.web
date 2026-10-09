import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { systemFontStack } from "../src/fonts.ts";

// The interface ships no webfont. The same stack therefore has to be written out
// three times -- the CSS variable, the TypeScript constant used by the 2D canvas
// and inline SVG, and the standalone update page -- and all three must agree.
const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");
const tokens = (value) =>
  value
    .replace(/["']/g, "")
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);

const css = await read("src/style.css");
const cssRule = css.match(/--font-system:([^;]+);/);
assert.ok(cssRule, "src/style.css must define --font-system");

const update = await read("public/update.html");
const start = update.indexOf("MiSans");
const end = update.indexOf("sans-serif", start);
assert.ok(start >= 0 && end > start, "public/update.html must inline the stack");

const reference = tokens(systemFontStack);
assert.deepEqual(
  tokens(cssRule[1]),
  reference,
  "--font-system must match src/fonts.ts",
);
assert.deepEqual(
  tokens(update.slice(start, end + "sans-serif".length)),
  reference,
  "update.html must inline the same stack",
);

// Ordering rule: the authored family first, then each platform's named UI sans,
// and only then the generic fallbacks that OEM themes are allowed to replace.
const generics = new Set([
  "system-ui",
  "Arial",
  "Helvetica",
  "sans-serif",
  "serif",
  "monospace",
  "cursive",
  "fantasy",
  "ui-sans-serif",
  "ui-serif",
]);
const firstGeneric = reference.findIndex((family) => generics.has(family));
assert.equal(reference[0], "MiSans", "The calibration family stays first");
assert.ok(
  firstGeneric > 0,
  "Named platform families must precede the generic fallbacks",
);
assert.ok(
  reference.slice(firstGeneric).every((family) => generics.has(family)),
  "No named family may hide behind a generic fallback",
);

for (const path of ["src/style.css", "index.html", "public/update.html"])
  assert.ok(
    !(await read(path)).includes("@font-face"),
    `${path} must not declare a webfont`,
  );
const shipped = (
  await readdir(new URL("../public", import.meta.url), { recursive: true })
).filter((name) => /\.(woff2?|ttf|otf|eot)$/i.test(name));
assert.deepEqual(shipped, [], "The site ships no font files");
console.log(
  `Font stack: ${reference.length} families agree across CSS, TypeScript and update.html; no webfont shipped.`,
);
