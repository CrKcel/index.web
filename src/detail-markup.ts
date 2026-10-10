// Detail-view markup: the file header, the metadata table, the tab panel and
// the access log. One module owns the authored strings so the reader view only
// binds state and transitions.
import type { ArchiveRecord } from "./data";
import { escapeHtml } from "./html";

export type AccessLogEntry = { id: string; time: string };

const tabPanel = (label: string, body: string) =>
  `<div class="panel-label">${label}</div>${body}`;

export function overviewMarkup(record: ArchiveRecord) {
  return tabPanel("ABSTRACT / 摘要", `<p>${escapeHtml(record.abstract)}</p>`);
}

export function researchNotesMarkup(record: ArchiveRecord) {
  return tabPanel(
    "RESEARCH NOTES / 研究记录",
    `<ol class="research-notes">${record.findings
      .map((finding, i) => `<li><span>${String(i + 1).padStart(2, "0")}</span>${escapeHtml(finding)}</li>`)
      .join("")}</ol>`,
  );
}

export function accessLogMarkup(record: ArchiveRecord, log: readonly AccessLogEntry[]) {
  const rows = log
    .filter((entry) => entry.id === record.id)
    .slice(0, 4)
    .map(
      (entry) =>
        `<div class="log-row"><span>${entry.time}</span><span>JOYCE MOORE</span><b>READ AUTHORIZED</b></div>`,
    )
    .join("");
  return tabPanel(
    "ACCESS LOG / 本次访问",
    `${rows}<p class="log-note">本次会话已通过身份验证。档案内容以当前终端可访问范围展示。</p>`,
  );
}

export function tabPanelMarkup(
  tab: string,
  record: ArchiveRecord,
  log: readonly AccessLogEntry[],
) {
  if (tab === "notes") return researchNotesMarkup(record);
  if (tab === "history") return accessLogMarkup(record, log);
  return overviewMarkup(record);
}

export function detailMarkup(
  record: ArchiveRecord,
  selection: { saved: boolean },
) {
  const savedLabel = selection.saved ? "− REMOVE FROM SAVED" : "＋ SAVE ARCHIVE";
  const savedNote = selection.saved ? "已收藏" : "收藏档案";
  return `
  <div class="detail-kicker"><span>FILE ${record.id}</span><span>${escapeHtml(record.clearance)}</span></div>
  <h2>${escapeHtml(record.en)}</h2><div class="detail-title-cn">${escapeHtml(record.title)}<span>${escapeHtml(record.category)}</span></div>
  <div class="detail-rule"></div>
  <dl class="metadata"><div><dt>DEPARTMENT / 科室</dt><dd>${escapeHtml(record.department)}</dd></div><div><dt>COLLECTION / 编目范围</dt><dd>${escapeHtml(record.date)}</dd></div><div><dt>RELATED / 相关人物</dt><dd>${escapeHtml(record.lead)}</dd></div><div><dt>STATUS / 状态</dt><dd><i></i>${record.clearance === "RESTRICTED" ? "目录访问" : "已归档 · 可读取"}</dd></div></dl>
  <div class="detail-tabs" role="tablist"><button id="tab-overview" class="active" role="tab" aria-controls="tab-panel" aria-selected="true" data-tab="overview">01 <span>概述</span></button><button id="tab-notes" role="tab" aria-controls="tab-panel" aria-selected="false" data-tab="notes">02 <span>研究记录</span></button><button id="tab-history" role="tab" aria-controls="tab-panel" aria-selected="false" data-tab="history">03 <span>访问日志</span></button><i class="tab-indicator" aria-hidden="true"></i></div>
  <div id="tab-panel" class="tab-panel" role="tabpanel">${overviewMarkup(record)}</div>
  <div class="detail-actions"><button class="solid-button" data-action="bookmark">${savedLabel}<span>${savedNote}</span></button><button class="export-button" data-action="export" aria-label="导出 ${record.id} 档案">EXPORT <span>↓</span></button></div>
  <div class="detail-footnote"><a href="${escapeHtml(record.source)}" target="_blank" rel="noopener">设定参考 ↗</a></div>`;
}
