import { defineConfig } from "vite";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { resolve } from "node:path";
import { buildContent } from "./scripts/build-content.mjs";

// Keep Blender's stable source/export paths, while production URLs identify
// exact bytes and can be cached without revalidation across deployments.
const models = ["archive-cassette", "archive-assembly"].map(name => {
  const source = readFileSync(`public/assets/${name}.glb`);
  const hash = createHash("sha256").update(source).digest("hex").slice(0,16);
  return { key:`assets/${name}.glb`, fileName:`assets/${name}.${hash}.glb`, source };
});
export default defineConfig(() => ({
  base: "/",
  define: {
    __RHINE_MODELS__: JSON.stringify(Object.fromEntries(models.map(model => [model.key,model.fileName]))),
  },
  plugins: [{
    name: "versioned-model-assets", apply: "build",
    buildStart() { for (const model of models) this.emitFile({type:"asset",fileName:model.fileName,source:model.source}); },
  }, {
    // Markdown sources are not imported by the app, so the dev server watches
    // them explicitly and rebuilds the generated payload on every edit.
    name: "archive-content", apply: "serve",
    configureServer(server) {
      let pending: Promise<unknown> = Promise.resolve();
      const rebuild = (file: string) => {
        if (!/[\\/]content[\\/](archives\.yaml|archives[\\/][^\\/]+\.md)$/.test(file)) return;
        pending = pending
          .then(() => buildContent())
          .then(() => server.ws.send({ type: "full-reload" }))
          .catch((error: Error) => server.config.logger.error(error.message));
      };
      server.watcher.add(resolve("content"));
      server.watcher.on("add", rebuild);
      server.watcher.on("change", rebuild);
      server.watcher.on("unlink", rebuild);
    },
  }],
}));
