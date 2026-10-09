// The browser checks drive a real Chrome (or WebKit). Playwright is deliberately
// not a dependency of this project because it downloads its own browsers, so the
// reviewer either has it installed globally or points PLAYWRIGHT_MODULE at an
// existing install. This helper turns a missing module into one actionable line
// instead of a raw "Cannot find package 'playwright'".
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

export async function loadPlaywright() {
  const module = process.env.PLAYWRIGHT_MODULE;
  try {
    return await import(
      module ? pathToFileURL(resolve(module)).href : "playwright"
    );
  } catch (error) {
    throw new Error(
      "Browser checks need Playwright: run `npm i -D playwright && npx playwright install chromium`, " +
        "or set PLAYWRIGHT_MODULE to an existing playwright install. See README.md.",
      { cause: error },
    );
  }
}
