// Node-only module resolution for the behavior checks in this folder.
//
// The checks import TypeScript sources directly, so Node needs to strip types
// and resolve relative specifiers such as "./theme-material" to the sibling
// ".ts" file. Vite and tsc both accept the extensionless form used in src/,
// and this hook keeps that style so production and check builds share one set
// of imports. Only preloaded by scripts/ checks; the browser build never loads it.
import { registerHooks } from "node:module";

registerHooks({
  resolve(specifier, context, nextResolve) {
    try {
      return nextResolve(specifier, context);
    } catch (error) {
      if (!specifier.startsWith(".") && !specifier.startsWith("file:"))
        throw error;
      try {
        return nextResolve(`${specifier}.ts`, context);
      } catch {
        throw error;
      }
    }
  },
});
