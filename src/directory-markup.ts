// Archive directory markup: the modal shell, the search body, the result rows
// and the empty state. The reader only supplies the current query, filter and
// saved set.
import type { ArchiveRecord } from "./data";
import { escapeHtml } from "./html";

export type DirectoryKind = "search" | "saved";

export function modalMarkup(kind: "search" | "saved" | "settings", body: string) {
  const label = kind === "settings" ? "系统设置" : kind === "saved" ? "收藏档案" : "档案检索";
  const heading = kind === "settings" ? "SYSTEM PREFERENCES" : "ARCHIVE DIRECTORY";
  return `<div class="modal-backdrop"><section class="terminal-modal ${kind === "settings" ? "settings-modal" : ""}" role="dialog" aria-modal="true" aria-label="${label}"><div class="modal-top"><span>RHINE LAB / ${heading}</span><button data-action="close-modal" aria-label="关闭窗口"><span>×</span></button></div>${body}</section></div>`;
}

export function directoryBodyMarkup(kind: DirectoryKind, categoryList: readonly string[]) {
  const title = kind === "saved" ? "SAVED ARCHIVES" : "ARCHIVE INDEX";
  const subtitle = kind === "saved" ? "收藏档案" : "内部档案检索";
  return `<h2>${title}<small>${subtitle}</small></h2><div class="search-field"><span>⌕</span><input id="archive-search" type="search" autocomplete="off" placeholder="输入档案编号、名称或科室" aria-label="检索档案"/><span class="key">ESC</span></div><div class="category-filters">${categoryList.map((category, i) => `<button data-filter="${escapeHtml(category)}" class="${i === 0 ? "active" : ""}">${escapeHtml(category)}</button>`).join("")}</div><div class="result-header"><span>FILE / 档案</span><span>DEPARTMENT / 科室</span><span>ACCESS</span></div><div id="search-results" class="search-results"></div><div class="modal-bottom"><span id="result-count"></span><span>INTERNAL DATABASE <i>●</i> CONNECTED</span></div>`;
}

export function resultRowMarkup(record: ArchiveRecord, index: number, saved: boolean) {
  return `<button class="result-row" data-result="${index}"><span class="result-name"><b>${record.id}</b><span>${escapeHtml(record.title)}<small>${escapeHtml(record.en)}</small></span>${saved ? "<i>＋</i>" : ""}</span><span>${escapeHtml(record.department)}</span><span>${record.clearance === "RESTRICTED" ? "CATALOG ONLY" : "AUTHORIZED"} <i>↗</i></span></button>`;
}

export function emptyResultsMarkup(kind: DirectoryKind, searching: boolean) {
  const empty = kind === "saved" && !searching;
  return `<div class="empty-results"><span>∅</span><strong>${empty ? "尚无收藏档案" : "没有匹配的档案"}</strong><p>${empty ? "读取档案时，选择 SAVE ARCHIVE 将其保存在此处。" : "尝试其他名称、档案编号，或切换科室分类。"}</p><button data-action="reset-search">${empty ? "查看全部档案 →" : "重置检索 →"}</button></div>`;
}

export function resultCountMarkup(count: number) {
  return `${String(count).padStart(2, "0")} RECORDS FOUND`;
}
