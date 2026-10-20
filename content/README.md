# 修改档案内容

档案正文与元数据分开保存：

- [`archives.yaml`](archives.yaml)：检索筛选器与三维阵列的五列分类。
- [`archives/`](archives/)：四十份档案，一份一个 Markdown 文件，文件名与编号一致，例如 `X-001.md`。

`src/data.ts` 只保留类型与阵列位置映射；页面读取的 `content/archives.generated.json` 由脚本生成，不属于内容源文件。

## 文件结构

`archives.yaml` 包含 `categories` 与 `columns`，两者都必须有五个分类名称，顺序可以不同。“全部档案”由界面添加，无需填写。

每个 Markdown 文件由 YAML 前辅文和正文组成：

```md
---
id: X-001
title: 莱茵生命
en: RHINE LAB, LLC.
department: 总辖构件科
category: 机构档案
date: 跨期资料汇编
lead: Kristen Wright / Saria
clearance: REFERENCE AREA
source: https://arknights.wiki.gg/wiki/Rhine_Lab
---

莱茵生命从克丽斯腾与塞雷娅共同创办的研究室发展而来。

## 研究记录

- 研究方向跨越多个科属，重大项目往往依赖跨科协作。
- 一项成果的技术价值，与它最终被怎样使用，需要分别讨论。
```

### 前辅文

| 字段                     | 内容                                                        |
| ------------------------ | ----------------------------------------------------------- |
| `id`                     | 稳定编号，用于收藏、定位和下载文件名                        |
| `title`、`en`            | 中文标题、英文标题                                          |
| `department`、`category` | 科室、所属分类；分类须与 `archives.yaml` 的名称完全一致     |
| `date`、`lead`           | 编目范围、相关人物                                          |
| `clearance`              | 访问范围；`RESTRICTED` 对应目录访问状态                     |
| `source`                 | 设定参考的完整 HTTP 或 HTTPS 链接                           |

以上字段均必填。值包含 `: `、`#`、引号等 YAML 特殊字符时需要用引号包起来，例如 `en: "IFRIT: RECOVERY"`。

### 正文

`## 研究记录` 之前的全部内容按 Markdown 渲染为“摘要”；该标题之后必须是一个列表，每个顶层列表项是一段研究记录。摘要与研究记录都支持常用 Markdown 语法，例如强调、链接、行内代码与段落。原始 HTML 会被转义；研究记录保持单段行内内容，以适配编号列表。

TXT 下载会去掉 Markdown 标记，保留纯文本。

## 生成与验证

`npm run dev`、`npm run build` 与 `npm run check` 都会先校验 Markdown 源并重新生成 `content/archives.generated.json`。开发服务器运行期间，修改 Markdown 或 `archives.yaml` 会自动重建并刷新页面。

也可以单独执行：

```sh
npm run content:build
npm run check:content
```

`check:content` 校验数据规则、Markdown 解析与下载文本。之后运行 `npm run build` 验证构建，并在 `npm run dev` 中查看标题、详情、检索和下载结果，尤其检查长标题与较长正文的实际布局。

## 约束

当前五列、每列八份与原片布局、循环阵列相连。校验会拒绝增减档案、改变分类数量或改变文件顺序；调整这些数量需要另行修改阵列逻辑。不要通过交换或重编号档案改变顺序，以免已有收藏指向不同内容。

- 文件名必须与 `id` 一致，且编号按 `X-001` 至 `X-040` 排列。
- 每个分类必须恰好有八份档案。
- 前辅文只能包含上表字段；正文以 Markdown 书写，不使用 HTML。
- 保留公开设定的来源，区分档案式改写与游戏原文。
