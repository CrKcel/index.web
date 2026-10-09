// Runs the repository's checks. `npm run check` covers everything that works
// without a browser and is also what CI runs; the real-browser regressions are
// opt-in because they drive a full browser for minutes.
//
// The manifest below is the single place a check is registered, and the runner
// refuses to start when a scripts/check-*.mjs file is missing from it, so a new
// check cannot quietly stay unwired.
import { spawn } from "node:child_process";
import { readdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { browserChecks, runBrowserChecks } from "./check-browser.mjs";
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

const mode = process.argv[2] ?? "offline";
if (!["offline", "browser", "all"].includes(mode))
  throw Error(`Unknown check mode: ${mode} (use offline, browser or all)`);
// `--only=a,b` narrows the browser half the same way `--only` does in
// scripts/check-browser.mjs, so a single regression does not cost a full pass.
const only = process.argv
  .filter((argument) => argument.startsWith("--only="))
  .map((argument) => argument.slice("--only=".length))
  .pop();

// Runners rather than checks: one needs a live deployment and a locally
// packaged release, the other orchestrates the browser list above.
const tools = ["check-cloudflare-deployment.mjs", "check-browser.mjs"];
const known = new Set([...offline, ...browserChecks]);
const found = (await readdir(here)).filter((name) => /^check-.*\.mjs$/.test(name));
const unwired = found.filter((name) => !known.has(name) && !tools.includes(name));
const missing = [...known].filter((name) => !found.includes(name));
if (unwired.length || missing.length)
  throw Error(
    `Check manifest is out of date. Unregistered: ${unwired.join(", ") || "none"}. Missing: ${missing.join(", ") || "none"}.`,
  );

// Offline checks run here, one process at a time. The browser half is handed to
// scripts/check-browser.mjs, which serves dist, keeps a previous release for
// check-pwa-recovery and reports one timing per check.
const offlineSelected = mode === "browser" ? [] : offline;
async function browserPass() {
  try {
    return (await runBrowserChecks({ only })).failures;
  } catch (error) {
    console.error(error.message);
    return ["browser setup"];
  }
}
if (mode === "browser") {
  const failed = await browserPass();
  process.exit(failed.length ? 1 : 0);
}
if (mode === "all") await loadPlaywright();

const failures = [];
for (const name of offlineSelected) {
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
const passed = offlineSelected.length - failures.length;
process.stdout.write(
  `\n${passed}/${offlineSelected.length} checks passed${failures.length ? `, failed: ${failures.join(", ")}` : ""}.\n`,
);
// `all` appends the browser regressions; either half failing fails the run.
const browserFailures = mode === "all" ? await browserPass() : [];
process.exitCode = failures.length || browserFailures.length ? 1 : 0;
