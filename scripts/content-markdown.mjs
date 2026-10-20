// Markdown handling shared by content validation and the generated reader
// payload. Rendering happens at build time, so the browser receives only
// finished HTML and never needs a Markdown parser.
import MarkdownIt from "markdown-it";

const markdown = new MarkdownIt({ html: false, linkify: false, typographer: false });
export const NOTES_HEADING = "研究记录";

const normalize = (source) => source.replace(/\r\n?/g, "\n");

function inlineText(tokens) {
  let text = "";
  for (const token of tokens) {
    if (token.type === "text" || token.type === "code_inline") text += token.content;
    else if (token.type === "softbreak" || token.type === "hardbreak") text += " ";
    else if (token.type === "image")
      text += token.children ? inlineText(token.children) : token.content;
    else if (token.children) text += inlineText(token.children);
  }
  return text;
}

export function markdownInlineText(source) {
  const tokens = markdown.parseInline(source, {});
  return inlineText(tokens[0]?.children ?? []).trim();
}

export function markdownText(source) {
  const tokens = markdown.parse(source, {});
  let text = "";
  for (const token of tokens) {
    if (token.type === "inline") text += inlineText(token.children ?? []);
    else if (token.type === "fence" || token.type === "code_block")
      text += token.content.trimEnd();
    else if (token.type === "list_item_open") text += "- ";
    else if (token.type === "paragraph_close" || token.type === "heading_close")
      text += "\n\n";
    else if (token.type === "list_item_close" || token.type === "bullet_list_close")
      text += "\n";
  }
  return text
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function renderMarkdown(source) {
  return markdown.render(source, {}).trim();
}

export function renderInlineMarkdown(source) {
  return markdown.renderInline(source, {}).trim();
}

/**
 * Splits one archive body into its abstract and research notes. The abstract
 * is everything before the `## 研究记录` heading; the notes are that section's
 * top-level list items. Each finding stays inline Markdown so it can sit inside
 * the numbered list without adding block markup.
 */
export function parseArchiveBody(source, label = "正文") {
  const body = normalize(source).trim();
  if (!body) throw new Error(`${label}：正文不能为空`);
  const tokens = markdown.parse(body, {});
  let headingIndex = -1;
  for (let index = 0; index < tokens.length; index++) {
    const token = tokens[index];
    if (token.type !== "heading_open" || token.tag !== "h2") continue;
    const inline = tokens[index + 1];
    if (inline?.type !== "inline" || inline.content.trim() !== NOTES_HEADING) continue;
    if (headingIndex !== -1)
      throw new Error(`${label}：只能出现一个“## ${NOTES_HEADING}”章节`);
    headingIndex = index;
  }
  if (headingIndex === -1)
    throw new Error(`${label}：正文必须包含“## ${NOTES_HEADING}”章节`);

  const abstract = body.split("\n").slice(0, tokens[headingIndex].map[0]).join("\n").trim();
  if (!abstract) throw new Error(`${label}：“## ${NOTES_HEADING}”之前必须有摘要正文`);

  let notesStart = headingIndex + 1;
  while (notesStart < tokens.length && tokens[notesStart].type !== "heading_close")
    notesStart++;
  notesStart++;
  const listTokens = new Set([
    "bullet_list_open",
    "bullet_list_close",
    "ordered_list_open",
    "ordered_list_close",
  ]);
  const findings = [];
  let depth = 0;
  let current = null;
  for (let index = notesStart; index < tokens.length; index++) {
    const token = tokens[index];
    if (token.level === 0 && !listTokens.has(token.type))
      throw new Error(`${label}：“## ${NOTES_HEADING}”之后只能包含列表项`);
    if (token.type === "list_item_open") {
      depth++;
      if (depth === 1) current = [];
    } else if (token.type === "inline" && depth === 1) {
      current.push(token.content.trim());
    } else if (token.type === "list_item_close") {
      depth--;
      if (depth === 0) {
        const finding = current.join(" ").trim();
        if (finding) findings.push(finding);
        current = null;
      }
    }
  }
  if (!findings.length)
    throw new Error(`${label}：“## ${NOTES_HEADING}”之后必须包含至少一条列表项`);
  return { abstract, findings };
}
