import { writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { loadContent } from "./archive-content.mjs";
import {
  markdownInlineText,
  markdownText,
  renderInlineMarkdown,
  renderMarkdown,
} from "./content-markdown.mjs";

export const outputFile = new URL(
  "../content/archives.generated.json",
  import.meta.url,
);

/**
 * Validates the Markdown sources and writes the reader payload. The generated
 * file is a build artifact; content/archives/*.md and content/archives.yaml
 * remain the only files an editor needs to touch.
 */
export async function buildContent() {
  const content = await loadContent();
  const generated = {
    categories: content.categories,
    columns: content.columns,
    records: content.records.map(
      ({
        id,
        title,
        en,
        department,
        category,
        date,
        lead,
        clearance,
        source,
        abstract,
        findings,
      }) => ({
        id,
        title,
        en,
        department,
        category,
        date,
        lead,
        clearance,
        source,
        abstractText: markdownText(abstract),
        abstractHtml: renderMarkdown(abstract),
        findingsText: findings.map(markdownInlineText),
        findingsHtml: findings.map(renderInlineMarkdown),
      }),
    ),
  };
  await writeFile(outputFile, `${JSON.stringify(generated, null, 2)}\n`);
  return generated;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const generated = await buildContent();
  console.log(
    `Validated ${generated.records.length} archive records and wrote ${outputFile.pathname}.`,
  );
}
