## 范围

本仓库维护网页版本的 Rhine Lab 终端，域名为 `https://index.crkcel.com/`，部署在 Cloudflare Workers 的静态资源上，Worker 名称为 `index`，配置见 `wrangler.jsonc`。技术栈、工程结构与建模脚本清单见 `README.md`。

文档分工：命令、检查、部署与运行约束以本文件为准；视觉、相机、材质、字体与运动基准见 `docs/DESIGN.md`；发行包内容、缓存语义与额度见 `docs/CLOUDFLARE-DEPLOYMENT.md`；档案数据规则见 `content/README.md`；目录索引见 `README.md`。

## 命令

需要 Node 24 或更高版本（`package.json` 的 `engines`）：检查脚本直接以类型剥离方式运行 `src/` 的 TypeScript。

| 命令 | 作用 |
| --- | --- |
| `npm run dev` | 本地开发，启动前校验档案数据；开发模式不注册 Service Worker |
| `npm run build` | `tsc` + Vite 构建到 `dist`，并生成带内容版本的 Service Worker；构建前校验档案数据 |
| `npm run build:worker` | 在 `build` 之后打包 Cloudflare 发行包到 `release/cloudflare/site` |
| `npm run deploy` | `build:worker` 之后由 Wrangler 上传发行包 |
| `npm run check:content` | 校验档案数据规则与下载文本 |
| `npm run check` | 全部免浏览器检查，与 CI 相同 |
| `npm run check:browser` | 真实浏览器回归，默认不跑，见「浏览器回归」 |
| `npm run check:deployment` | 核验线上发行，默认 `https://index.crkcel.com/`，可传其他基址，只接受 HTTPS 基址或 `127.0.0.1` |

Wrangler：`npx wrangler dev` 本地开发，`npx wrangler deploy` 部署，`npx wrangler types` 生成类型，改动绑定后运行 `wrangler types`。Cloudflare Workers 文档 https://developers.cloudflare.com/workers/ ，MCP `https://docs.mcp.cloudflare.com/mcp`，限制与配额从产品的 `/platform/limits/` 页面获取。

本地调试入口：`/?scene=archive` 直接进入档案阵列，`/?scene=detail` 直接进入档案详情。

`npx wrangler dev` 运行时提供 Local Explorer API 用于检查本地 Worker、绑定与存储状态，API 基址在终端输出。常用端点：`/cdn-cgi/local/explorer/api/local/workers`、`/storage/kv/namespaces`、`/d1/database`、`/r2/buckets`、`/workers/durable_objects/namespaces`、`/workflows`，以及 `POST /local/observability/query`（只读 SQL）与 `POST /local/observability/clear`。

## 检查

`npm run check` 覆盖内容规则、视口与取景、相机取景端点、表面波场、开场帧、字体栈一致性、运动与循环、拖拽与惯性、可见性覆盖、外观与解密、模型外壳与装配、画质上限、渲染去重、主题波、音效与配乐、PWA 重定向。清单在 `scripts/check.mjs`，也是唯一登记处：清单外的 `scripts/check-*.mjs` 会让运行器直接报错，新增检查必须登记；`scripts/check-browser.mjs` 与 `scripts/check-cloudflare-deployment.mjs` 是运行器，不参与清单校验。

这些脚本直接导入 `src/` 的 TypeScript 源码，而源码沿用 Vite 与 tsc 接受的无扩展名相对导入，因此需要预先加载 `scripts/type-import-loader.mjs` 才能在 Node 下解析（`scripts/check.mjs` 已代为加载）。浏览器检查通过页面每帧写在 `#stage[data-stats]` 上的只读 JSON 快照读数（读取入口见 `scripts/page-snapshot.mjs`），应用本身不暴露 JavaScript 评审接口。

`.github/workflows/checks.yml` 在推送与合并请求上运行 `npm run check` 与 `npm run build:worker`；浏览器回归不进入该流程，需手动运行。

## 浏览器回归

除非要求，默认不运行：`npm run check:browser` 驱动真实 Chrome 等待动画实时推进。只有改动确实落在浏览器行为上（PWA 更新、响应式布局、开场入口、输入与惯性）时用 `node scripts/check-browser.mjs --only=responsive,momentum` 只跑受影响项；它不进入 CI。

运行器自备前置条件：自己在 `127.0.0.1:5204` 提供刚构建的 `dist`，并在 `.tools/pwa-previous` 保留一份发行副本供 `check-pwa-recovery` 使用，逐项打印结果与耗时。已有 `npm run dev` 或 `npm run preview` 时用 `REVIEW_URL` 指向它，而不是额外起服务；已有旧发行包时用 `PWA_PREVIOUS_DIST` 覆盖。浏览器检查需要 Playwright：`npm i -D playwright && npx playwright install chromium`，或把 `PLAYWRIGHT_MODULE` 指向已有的安装；没有系统 Chrome 时回退到自带 Chromium 并有窗口运行（无头构建是软件渲染，跑不到实时）。`REVIEW_CHANNEL`、`REVIEW_HEADED` 控制浏览器与显示方式。

## 部署与验收

`npm run deploy` 先执行 `npm run build:worker` 生成发行包到 `release/cloudflare/site`，写入缓存标头与 `404.html`，再通过 Wrangler 上传。未命中路径返回 404，`/index.html` 重定向到 `/`。

部署后运行 `npm run check:deployment` 核验线上发行：用 `no-store` 拉取线上 `pwa-build.json`，与本地 `release/cloudflare/latest.json` 比对版本与文件清单；以 6 路并发逐字节比对全部发行文件（外加 `sw.js`、`update.html`、`update.js`），其中 HTML 因 Cloudflare 会注入 bot 管理标记，去掉注入内容并归一空白后再比较；校验 GLB 的 `immutable` 与更新入口的 `no-store` 缓存语义；请求一个不存在的路径，确认返回 404 而不是应用外壳。没有本地发行包时脚本会提示先运行 `npm run build:worker`。

回滚：先用 `npx wrangler deployments list` 找到上一次部署，再 `npx wrangler rollback [deployment-id]`；普通回滚需要重新构建同样的源码，因为发行包按内容定址，重新构建会得到相同的 `version` 与文件名。

## 档案内容

档案内容独立保存在 `content/archives.json`，页面与 TXT 导出共用，`npm run dev` 与 `npm run build` 构建前校验；保留五列、每列八份与稳定编号约束，字段与操作步骤见 `content/README.md`。

## 视觉与排字

视觉、相机、材质、字体与运动约束见 `docs/DESIGN.md`。

- 1920×1080 为布局基准，等比例适应窗口；支持桌面不同比例、手机横竖屏与触摸操作，16:9 为视觉基准。
- 界面使用系统 UI 字体栈。标定过的单行盒靠 `--font-base` + `--fit-width` + `--text-fit`（见 `src/text-fit.ts`）在更宽的平台字体下收缩字号，新增或改动这类盒子时必须补齐前两个变量，并保留开场授权环那种有意的大字距动画。

## 画质与声音

- 画质只调整渲染精度与可选效果，不重新制作模型；默认采用原始预设，预设与参数见 `docs/DESIGN.md`。
- 声音与音乐独立开关与音量；保留源谱与音色生成脚本，来源与处理记录见 `public/audio/README.md`。
