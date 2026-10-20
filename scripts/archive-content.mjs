import fs from "node:fs/promises";
import { parse as parseYaml } from "yaml";
import { parseArchiveBody } from "./content-markdown.mjs";

const requiredFields = [
  "id",
  "title",
  "en",
  "department",
  "category",
  "date",
  "lead",
  "clearance",
  "abstract",
  "source",
];
const metadataFields = requiredFields.filter((field) => field !== "abstract");
const recordFields = new Set([...requiredFields, "findings", "file"]);
const frontMatter = /^---[ \t]*\n([\s\S]*?)\n---[ \t]*(?:\n|$)/;
const isText = (value) => typeof value === "string" && value.trim().length > 0;

export function parseArchiveFile(source, label = "档案") {
  const match = frontMatter.exec(source);
  if (!match) throw new Error(`${label}：缺少 YAML 前辅文`);
  let metadata;
  try {
    metadata = parseYaml(match[1]);
  } catch (error) {
    throw new Error(`${label}：YAML 前辅文无法解析：${error.message}`);
  }
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata))
    throw new Error(`${label}：YAML 前辅文必须是字段映射`);
  const body = source.slice(match[0].length);
  const notes = parseArchiveBody(body, label);
  return { metadata, ...notes };
}

export function validateContent(content) {
  const errors = [];
  if (!content || typeof content !== "object" || Array.isArray(content)) {
    throw new Error("档案数据必须是对象。");
  }
  for (const key of ["categories", "columns"]) {
    const names = content[key];
    if (!Array.isArray(names) || names.length !== 5 || !names.every(isText)) {
      errors.push(`${key}：必须包含五个非空分类名称`);
    } else if (new Set(names).size !== 5 || names.includes("全部档案")) {
      errors.push(`${key}：分类名称不能重复，也不能使用“全部档案”`);
    }
  }
  const categories = Array.isArray(content.categories) ? content.categories : [];
  const columns = Array.isArray(content.columns) ? content.columns : [];
  if (
    categories.some((name) => !columns.includes(name)) ||
    columns.some((name) => !categories.includes(name))
  ) {
    errors.push("categories 与 columns 必须包含相同的五个分类（顺序可以不同）");
  }
  const records = Array.isArray(content.records) ? content.records : [];
  if (records.length !== 40) errors.push("records：当前阵列要求四十份档案");
  const ids = new Set();
  records.forEach((record, index) => {
    const label = `records[${index}]`;
    if (!record || typeof record !== "object" || Array.isArray(record)) {
      errors.push(`${label}：必须是档案对象`);
      return;
    }
    for (const key of requiredFields) {
      if (!isText(record[key])) errors.push(`${label}.${key}：必须是非空文本`);
    }
    for (const key of Object.keys(record)) {
      if (!recordFields.has(key)) errors.push(`${label}.${key}：未知字段`);
    }
    const expectedId = `X-${String(index + 1).padStart(3, "0")}`;
    if (record.id !== expectedId)
      errors.push(`${label}.id：应为 ${expectedId}，编号须按顺序保持稳定`);
    if (ids.has(record.id)) errors.push(`${label}.id：重复编号 ${record.id}`);
    ids.add(record.id);
    if (record.file !== undefined && record.file !== `${record.id}.md`)
      errors.push(`${label}.file：文件名应为 ${record.id}.md`);
    if (!categories.includes(record.category))
      errors.push(`${label}.category：未知分类 ${record.category}`);
    if (
      !Array.isArray(record.findings) ||
      record.findings.length === 0 ||
      !record.findings.every(isText)
    ) {
      errors.push(`${label}.findings：必须包含至少一条非空研究记录`);
    }
    try {
      const url = new URL(record.source);
      if (!["https:", "http:"].includes(url.protocol)) throw new Error();
    } catch {
      errors.push(`${label}.source：必须是有效的 HTTP 或 HTTPS 链接`);
    }
  });
  for (const name of columns) {
    if (records.filter((record) => record?.category === name).length !== 8) {
      errors.push(`分类“${name}”：当前阵列要求八份档案`);
    }
  }
  if (errors.length)
    throw new Error(`档案数据校验失败：\n- ${errors.join("\n- ")}`);
  return content;
}

export async function loadContent() {
  const directory = new URL("../content/archives/", import.meta.url);
  const taxonomySource = await fs.readFile(
    new URL("../content/archives.yaml", import.meta.url),
    "utf8",
  );
  const taxonomy = parseYaml(taxonomySource);
  if (!taxonomy || typeof taxonomy !== "object" || Array.isArray(taxonomy))
    throw new Error("content/archives.yaml：分类配置必须是字段映射");
  const files = (await fs.readdir(directory))
    .filter((name) => name.endsWith(".md"))
    .sort();
  const records = [];
  for (const file of files) {
    const source = await fs.readFile(new URL(file, directory), "utf8");
    let metadata;
    let notes;
    try {
      ({ metadata, ...notes } = parseArchiveFile(source, file));
    } catch (error) {
      throw new Error(`档案数据校验失败：\n- ${error.message}`);
    }
    for (const key of Object.keys(metadata)) {
      if (!metadataFields.includes(key))
        throw new Error(
          `档案数据校验失败：\n- ${file}.${key}：前辅文只能包含档案元数据字段`,
        );
    }
    records.push({ ...metadata, ...notes, file });
  }
  return validateContent({
    categories: taxonomy.categories,
    columns: taxonomy.columns,
    records,
  });
}
