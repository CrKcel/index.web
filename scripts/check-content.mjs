import assert from "node:assert/strict";
import { test } from "node:test";
import { loadContent, validateContent } from "./archive-content.mjs";
import {
  markdownText,
  parseArchiveBody,
  renderMarkdown,
} from "./content-markdown.mjs";
import { archiveText } from "../src/archive-text.ts";
import { escapeHtml } from "../src/html.ts";

const content = await loadContent();
test("loads one markdown source per record", () => {
  assert.equal(content.records.length, 40);
  assert.equal(content.records[0].file, "X-001.md");
  assert.ok(content.records[0].abstract.length > 0);
  assert.ok(content.records[0].findings.length > 0);
});
test("splits the markdown body at the notes heading", () => {
  const parsed = parseArchiveBody(
    "摘要 **加粗**。\n\n## 研究记录\n\n- 第一条\n- 第二条",
  );
  assert.equal(parsed.abstract, "摘要 **加粗**。");
  assert.deepEqual(parsed.findings, ["第一条", "第二条"]);
});
test("rejects missing or empty research notes", () => {
  assert.throws(() => parseArchiveBody("只有摘要"), /研究记录/);
  assert.throws(() => parseArchiveBody("摘要\n\n## 研究记录"), /列表项/);
  assert.throws(
    () => parseArchiveBody("摘要\n\n## 研究记录\n\n- 第一条\n\n多余段落"),
    /只能包含列表项/,
  );
});
test("renders markdown without passing raw HTML through", () => {
  assert.equal(renderMarkdown("**粗体**"), "<p><strong>粗体</strong></p>");
  assert.ok(renderMarkdown("<script>x</script>").includes("&lt;script&gt;"));
  assert.equal(markdownText("**粗体** [链接](https://example.com)"), "粗体 链接");
});
test("download text carries every field of the record", () => {
  const record = {
    ...content.records[0],
    title: "T1",
    en: "E1",
    department: "D1",
    date: "C1",
    lead: "L1",
    clearance: "K1",
    abstractText: "A1",
    findingsText: ["F1", "F2"],
    source: "https://example.com/x",
  };
  const text = archiveText(record);
  for (const value of [
    record.id,
    record.title,
    record.en,
    record.department,
    record.date,
    record.lead,
    record.clearance,
    record.abstractText,
    ...record.findingsText,
    record.source,
  ])
    assert.ok(text.includes(value), `download text is missing ${value}`);
  assert.ok(text.indexOf("1. F1") < text.indexOf("2. F2"));
});

const invalidCases = [
  [
    "missing title",
    (c) => {
      delete c.records[0].title;
    },
    /records\[0\].title/,
  ],
  [
    "blank abstract",
    (c) => {
      c.records[0].abstract = "  ";
    },
    /abstract/,
  ],
  [
    "duplicate ID",
    (c) => {
      c.records[1].id = "X-001";
    },
    /重复编号/,
  ],
  [
    "reordered ID",
    (c) => {
      [c.records[0], c.records[1]] = [c.records[1], c.records[0]];
    },
    /X-001/,
  ],
  [
    "unknown category",
    (c) => {
      c.records[0].category = "未知";
    },
    /未知分类/,
  ],
  [
    "unbalanced columns",
    (c) => {
      c.records[0].category = c.columns[0];
    },
    /八份档案/,
  ],
  [
    "missing record",
    (c) => {
      c.records.pop();
    },
    /四十份档案/,
  ],
  [
    "null record",
    (c) => {
      c.records[0] = null;
    },
    /必须是档案对象/,
  ],
  [
    "empty findings",
    (c) => {
      c.records[0].findings = [];
    },
    /findings/,
  ],
  [
    "non-text findings",
    (c) => {
      c.records[0].findings = [42];
    },
    /findings/,
  ],
  [
    "unsafe URL",
    (c) => {
      c.records[0].source = "javascript:alert(1)";
    },
    /HTTPS/,
  ],
  [
    "invalid URL",
    (c) => {
      c.records[0].source = "example.com";
    },
    /HTTPS/,
  ],
  [
    "duplicate categories",
    (c) => {
      c.categories[1] = c.categories[0];
    },
    /不能重复/,
  ],
  [
    "reserved category",
    (c) => {
      c.categories[0] = "全部档案";
    },
    /全部档案/,
  ],
  [
    "mismatched columns",
    (c) => {
      c.columns[0] = "其他";
    },
    /相同的五个分类/,
  ],
];
for (const [name, mutate, error] of invalidCases) {
  test(`rejects ${name}`, () => {
    const invalid = structuredClone(content);
    mutate(invalid);
    assert.throws(() => validateContent(invalid), error);
  });
}
test("accepts independent filter and column order", () => {
  const edited = structuredClone(content);
  edited.categories.reverse();
  assert.equal(validateContent(edited), edited);
});
test("plain-text punctuation stays literal in HTML and downloadable text", () => {
  const title = `<玻璃> & "实验" 'A'`;
  const edited = structuredClone(content);
  edited.records[0].title = title;
  validateContent(edited);
  assert.equal(
    escapeHtml(title),
    "&lt;玻璃&gt; &amp; &quot;实验&quot; &#39;A&#39;",
  );
  assert.ok(
    archiveText({
      ...edited.records[0],
      abstractText: edited.records[0].abstract,
      findingsText: edited.records[0].findings,
    }).includes(title),
  );
});
