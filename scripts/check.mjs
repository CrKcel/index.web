// Runs the repository's checks. `npm run check` covers everything that works
// without a browser; `npm run check:browser` adds the real-browser regressions.
//
// The manifest below is the single place a check is registered, and the runner
// refuses to start when a scripts/check-*.mjs file is missing from it, so a new
// check cannot quietly stay unwired.
import { spawn } from "node:child_process";
import { readdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { loadPlaywright } from "./playwright.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const offline = [
  "check-content.mjs",
  "check-viewport.mjs",
  "check-archive-camera.mjs",
  "check-archive-field.mjs",
  "check-archive-stats.mjs",
  "check-boot-frame.mjs",
  "check-fonts.mjs",
  "check-motion.mjs",
  "check-loop.mjs",
  "check-archive-drag.mjs",
  "check-archive-visibility.mjs",
  "check-archive-impostor.mjs",
  "check-appearance.mjs",
  "check-assembly.mjs",
  "check-decryption.mjs",
  "check-shell.mjs",
  "check-quality.mjs",
  "check-render-updates.mjs",
  "check-theme.mjs",
  "check-audio.mjs",
  "check-pr15-port.mjs",
  "check-pwa-redirect.mjs",
];
const browser = [
  "check-pwa.mjs",
  "check-pwa-recovery.mjs",
  "check-responsive.mjs",
  "check-startup-entry.mjs",
  "check-startup-motion.mjs",
  "check-array-input.mjs",
  "check-archive-momentum.mjs",
  "check-archive-diagonal.mjs",
];

const mode = process.argv[2] ?? "offline";
if (!["offline", "browser", "all"].includes(mode))
  throw Error(`Unknown check mode: ${mode} (use offline, browser or all)`);

// Needs a live deployment and a locally packaged release, so it is run by
// `npm run check:deployment` instead of by this runner.
const tools = ["check-cloudflare-deployment.mjs"];
const known = new Set([...offline, ...browser]);
const found = (await readdir(here)).filter((name) => /^check-.*\.mjs$/.test(name));
const unwired = found.filter((name) => !known.has(name) && !tools.includes(name));
const missing = [...known].filter((name) => !found.includes(name));
if (unwired.length || missing.length)
  throw Error(
    `Check manifest is out of date. Unregistered: ${unwired.join(", ") || "none"}. Missing: ${missing.join(", ") || "none"}.`,
  );

const selected =
  mode === "offline"
    ? offline
    : mode === "browser"
      ? browser
      : [...offline, ...browser];
if (mode !== "offline") await loadPlaywright();

const failures = [];
for (const name of selected) {
  process.stdout.write(`\n▶ ${name}\n`);
  const code = await new Promise((settle) =>
    spawn(
      process.execPath,
      [
        "--import",
        resolve(here, "type-import-loader.mjs"),
        "--experimental-strip-types",
        resolve(here, name),
      ],
      { stdio: "inherit" },
    ).on("exit", (value) => settle(value ?? 1)),
  );
  if (code !== 0) failures.push(name);
}
const passed = selected.length - failures.length;
process.stdout.write(
  `\n${passed}/${selected.length} checks passed${failures.length ? `, failed: ${failures.join(", ")}` : ""}.\n`,
);
process.exitCode = failures.length ? 1 : 0;
