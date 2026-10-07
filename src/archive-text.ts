import type { ArchiveRecord } from "./data";

/**
 * Plain-text export of one archive record, shared by the download action and
 * the content checks. The leading BOM keeps the Chinese text readable in
 * editors that still assume the system code page.
 */
export function archiveText(r: ArchiveRecord) {
  return `\uFEFFRHINE LAB · INTERNAL DATABASE\nFILE ${r.id} / ${r.title}\n${r.en}\n\n科室：${r.department}\n编目范围：${r.date}\n相关人物：${r.lead}\n访问范围：${r.clearance}\n\n${r.abstract}\n\n研究记录\n${r.findings.map((f, i) => `${i + 1}. ${f}`).join("\n")}\n\n设定参考：${r.source}\n本文为基于公开设定的档案式改写，非游戏原文。\n`;
}
