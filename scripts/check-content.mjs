import assert from "node:assert/strict";
import { test } from "node:test";
import { loadContent, validateContent } from "./archive-content.mjs";
import { archiveText } from "../src/archive-text.ts";
import { escapeHtml } from "../src/html.ts";

const content = await loadContent();
test("download text carries every field of the record", () => {
  const record = {
    ...content.records[0],
    title: "T1",
    en: "E1",
    department: "D1",
    date: "C1",
    lead: "L1",
    clearance: "K1",
    abstract: "A1",
    findings: ["F1", "F2"],
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
    record.abstract,
    ...record.findings,
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
  assert.ok(archiveText(edited.records[0]).includes(title));
});
