// Runs the real-browser regressions. This is deliberately not part of
// `npm run check` and not part of CI: it drives a full Chrome (or WebKit) over
// the WebGL build and waits on real animation time, so a complete pass costs
// minutes of wall clock on a desktop. Run it only when browser behaviour is what
// changed — see AGENTS.md and README.md.
//
// The runner prepares everything the checks expect, so the command works on a
// fresh checkout after `npm run build`:
//   * serves `dist` on 127.0.0.1:5204 itself, unless REVIEW_URL points at a
//     server the reviewer already started (that one is then used untouched);
//   * keeps an earlier build in `.tools/pwa-previous` so `check-pwa-recovery`
//     compares two real releases. Override with PWA_PREVIOUS_DIST, or delete the
//     snapshot to re-seed it from the current dist;
//   * prints one line per check with pass/fail and its own wall time, plus a
//     total with the slowest checks.
import { spawn } from "node:child_process";
import { cp, readFile, readdir, stat, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { dirname, extname, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));

// `check-pwa` and `check-pwa-recovery` start their own disposable servers.
// Every other browser check navigates to REVIEW_URL.
export const browserChecks = [
  "check-pwa.mjs",
  "check-pwa-recovery.mjs",
  "check-responsive.mjs",
  "check-startup-entry.mjs",
  "check-array-input.mjs",
  "check-archive-momentum.mjs",
  "check-archive-diagonal.mjs",
];
const defaultPort = 5204;
const mime = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".webmanifest": "application/manifest+json",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".ico": "image/x-icon",
  ".txt": "text/plain",
  ".glb": "model/gltf-binary",
  ".ogg": "audio/ogg",
};

// A minimal static server for `dist`; the browser checks only need the built
// application, so no dev server or bundler has to stay running for them.
export function serveDist({ root, port = defaultPort }) {
  const base = resolve(root);
  const server = createServer(async (request, response) => {
    try {
      const url = new URL(request.url, "http://localhost");
      const path = decodeURIComponent(
        url.pathname === "/" ? "/index.html" : url.pathname,
      );
      const file = resolve(base, `.${path}`);
      if (!file.startsWith(base + sep)) throw Error("outside the build");
      if (request.method === "HEAD") {
        response.writeHead(200).end();
        return;
      }
      const body = await readFile(file);
      response
        .writeHead(200, {
          "Content-Type": mime[extname(file)] ?? "application/octet-stream",
          "Cache-Control": "no-cache",
        })
        .end(body);
    } catch {
      response.writeHead(404, { "Content-Type": "text/plain" }).end("404");
    }
  });
  return new Promise((ready) =>
    server.listen(port, "127.0.0.1", () =>
      ready({
        url: `http://127.0.0.1:${port}`,
        close: () => new Promise((done) => server.close(done)),
      }),
    ),
  );
}

// `check-pwa-recovery` asserts the browser is running one release and then
// activates the next, so it needs two different built releases. Snapshotting the
// current dist and renaming its release version provides the older one without
// asking the reviewer to keep an old build around.
async function preparePreviousRelease(directory, current) {
  await stat(directory)
    .then(() => true)
    .catch(async () => {
      await cp(resolve("dist"), directory, { recursive: true });
      return false;
    });
  const manifestPath = resolve(directory, "pwa-build.json");
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  if (manifest.version !== current) return;
  const [prefix, counter] = [current.slice(0, 8), current.slice(8, 16)];
  const older = `${prefix}${(Number.parseInt(counter, 16) - 1)
    .toString(16)
    .padStart(8, "0")
    .slice(-8)}`;
  manifest.version = older;
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  const workerPath = resolve(directory, "sw.js");
  const worker = await readFile(workerPath, "utf8");
  await writeFile(workerPath, worker.split(current).join(older));
  return older;
}

const marker = "▶ ";
async function runCheck(name, url) {
  const started = performance.now();
  const code = await new Promise((settle) =>
    spawn(
      process.execPath,
      [
        "--import",
        resolve(here, "type-import-loader.mjs"),
        "--experimental-strip-types",
        resolve(here, name),
      ],
      {
        stdio: "inherit",
        env: { ...process.env, ...(url ? { REVIEW_URL: url } : {}) },
      },
    ).on("exit", (value) => settle(value ?? 1)),
  );
  return { code, seconds: (performance.now() - started) / 1000 };
}

const short = (name) => name.replace(/^check-/, "").replace(/\.mjs$/, "");

// Selects a subset with `--only=responsive,momentum`; names may keep or drop the
// `check-` prefix and the `.mjs` extension.
export function selectChecks(only) {
  if (!only) return browserChecks;
  const words = only
    .split(",")
    .map((word) => word.trim().replace(/^check-/, "").replace(/\.mjs$/, ""))
    .filter(Boolean);
  const unknown = words.filter(
    (word) => !browserChecks.includes(`check-${word}.mjs`),
  );
  if (unknown.length)
    throw Error(
      `Unknown browser check: ${unknown.join(", ")}. Known: ${browserChecks
        .map(short)
        .join(", ")}`,
    );
  return browserChecks.filter((name) => words.includes(short(name)));
}

export async function runBrowserChecks({ only } = {}) {
  const selected = selectChecks(only);
  const found = (await readdir(here)).filter((name) =>
    /^check-.*\.mjs$/.test(name),
  );
  const missing = browserChecks.filter((name) => !found.includes(name));
  if (missing.length) throw Error(`Missing browser check: ${missing.join(", ")}`);

  let server = null;
  let url = process.env.REVIEW_URL || "";
  if (url) {
    console.log(`Using REVIEW_URL ${url} instead of serving dist locally.`);
  } else {
    const metadata = await readFile(resolve("dist/pwa-build.json"), "utf8")
      .then(JSON.parse)
      .catch(() => {
        throw Error(
          "No dist build found. Run `npm run build` before the browser checks.",
        );
      });
    server = await serveDist({ root: "dist" });
    url = server.url;
    console.log(`Serving dist ${metadata.version} on ${url}.`);
  }
  // check-pwa-recovery needs an earlier release; seed one unless the reviewer
  // supplied one.
  if (!process.env.PWA_PREVIOUS_DIST) {
    const directory = resolve(".tools/pwa-previous");
    const current = JSON.parse(
      await readFile(resolve("dist/pwa-build.json"), "utf8"),
    ).version;
    try {
      const older = await preparePreviousRelease(directory, current);
      process.env.PWA_PREVIOUS_DIST = directory;
      console.log(
        `${older ? `Snapshot ${current} as ${older}` : `Reusing previous release`} in ${directory}.`,
      );
    } catch (error) {
      console.log(`Could not prepare a previous release: ${error.message}`);
    }
  }

  const failures = [];
  const durations = [];
  try {
    for (const name of selected) {
      process.stdout.write(`\n${marker}${name}\n`);
      const { code, seconds } = await runCheck(name, url);
      durations.push({ name, seconds });
      process.stdout.write(
        `\n${marker}${short(name)} · ${code === 0 ? "passed" : `FAILED (exit ${code})`} · ${seconds.toFixed(1)}s\n`,
      );
      if (code !== 0) failures.push(name);
    }
  } finally {
    if (server) await server.close();
  }

  const total = durations.reduce((sum, entry) => sum + entry.seconds, 0);
  const slowest = [...durations]
    .sort((a, b) => b.seconds - a.seconds)
    .slice(0, 3)
    .map((entry) => `${short(entry.name)} ${entry.seconds.toFixed(1)}s`);
  process.stdout.write(
    `\n${selected.length - failures.length}/${selected.length} browser checks passed in ${total.toFixed(1)}s` +
      `${slowest.length ? `; slowest ${slowest.join(", ")}` : ""}` +
      `${failures.length ? `; failed: ${failures.map(short).join(", ")}` : ""}.\n`,
  );
  process.exitCode = failures.length ? 1 : 0;
  return { failures, durations, total };
}

async function report() {
  const only = process.argv
    .filter((argument) => argument.startsWith("--only="))
    .map((argument) => argument.slice("--only=".length))
    .pop();
  try {
    await runBrowserChecks({ only });
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url))
  await report();
