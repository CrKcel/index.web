## 范围

本仓库维护网页版本的 Rhine Lab 终端，域名为 `https://index.crkcel.com/`，部署在 Cloudflare Workers 的静态资源上，Worker 名称为 `index`，配置见 `wrangler.jsonc`。

## Cloudflare Workers

- 文档：https://developers.cloudflare.com/workers/ ，MCP：`https://docs.mcp.cloudflare.com/mcp`。所有限制与配额从产品的 `/platform/limits/` 页面获取。
- 命令：`npx wrangler dev` 本地开发，`npx wrangler deploy` 部署，`npx wrangler types` 生成类型；改动绑定后运行 `wrangler types`。
- `npm run deploy` 先执行 `npm run build:worker` 生成发行包到 `release/cloudflare/site`，写入缓存标头与 `404.html`，再通过 Wrangler 上传。未命中路径返回 404，`/index.html` 重定向到 `/`。部署后用 `npm run check:deployment`（默认核验 `https://index.crkcel.com/`，可传其他基址）比对线上文件、缓存标头与 404：非 HTML 逐字节比对，HTML 因 Cloudflare 会注入 bot 管理标记而去掉注入后再比较。本地发行清单为 `release/cloudflare/latest.json`（`release/` 不入库）。流程见 `docs/CLOUDFLARE-DEPLOYMENT.md`。
- `npx wrangler dev` 运行时提供 Local Explorer API 用于检查本地 Worker、绑定与存储状态，API 基址在终端输出。常用端点：`/cdn-cgi/local/explorer/api/local/workers`、`/storage/kv/namespaces`、`/d1/database`、`/r2/buckets`、`/workers/durable_objects/namespaces`、`/workflows`，以及 `POST /local/observability/query`（只读 SQL）与 `POST /local/observability/clear`。

## 视觉与时序

视觉、相机、材质、字体与运动约束见 `docs/DESIGN.md`。界面采用 TypeScript、Three.js、Vite 的原生实现，`art/` 保留源工程与可复现脚本。

## 技术栈与资源

- 1920×1080 为布局基准，等比例适应窗口；支持桌面不同比例、手机横竖屏与触摸操作，16:9 为视觉基准。
- 档案内容独立保存在 `content/archives.json`，页面与 TXT 导出共用，构建前校验；保留五列、每列八份与稳定编号约束，步骤见 `content/README.md`。
- 界面不加载任何自定义字体，统一使用系统 UI 字体栈，顺序为「`MiSans`（排字标定基准）→ 各平台具名 UI 无衬线（含 CJK）→ `system-ui` / `Arial` / `sans-serif` 兜底」，具名族名必须留在 `system-ui` 之前；列表定义在 `src/style.css` 的 `--font-system` 与 `src/fonts.ts`，`public/update.html` 内联同一份，二维画布与内联 SVG 复用同一份列表，因此没有字体分包、许可文件与字体缓存标头。标定过的单行盒靠 `--font-base` + `--fit-width` + `--text-fit`（见 `src/text-fit.ts`）在更宽的平台字体下收缩字号，新增或改动这类盒子时必须补齐前两个变量，并保留开场授权环那种有意的大字距动画。
- 画质只调整渲染精度与可选效果，不重新制作模型；默认采用原始预设。
- 声音与音乐独立开关与音量；保留源谱与音色生成脚本。

## 开发与验证

- 需要 Node 24 或更高版本（`package.json` 的 `engines`）：检查脚本直接以类型剥离方式运行 `src/` 的 TypeScript。
- `npm run dev` 启动本地开发，`npm run build` 生成静态站点与带内容版本的 Service Worker 到 `dist`，`npm run build:worker` 生成 Cloudflare 发行包，`npm run deploy` 部署。开发模式不注册 Service Worker。
- `npm run build` 与 `npm run dev` 会先校验档案数据；档案下载由页面用同一份数据生成。`npm run check:content` 检查数据规则与下载文本。
- `npm run check` 运行全部免浏览器的检查，清单在 `scripts/check.mjs`：内容规则、视口与取景、字体栈一致性、运动与循环、拖拽与惯性、可见性覆盖、外观与解密、模型外壳与装配、画质上限、渲染去重、主题波、PWA 重定向。清单外的 `scripts/check-*.mjs` 会让运行器直接报错，新增检查必须登记。`npm run check:browser` 追加真实浏览器回归（PWA 更新、响应式、开场入口、输入与惯性），需要 Playwright：`npm i -D playwright && npx playwright install chromium`，或把 `PLAYWRIGHT_MODULE` 指向已有的安装；没有系统 Chrome 时回退到自带 Chromium 并有窗口运行（无头构建是软件渲染，跑不到实时），`REVIEW_CHANNEL`、`REVIEW_HEADED`、`REVIEW_URL`、`PWA_PREVIOUS_DIST` 控制浏览器与目标地址。
- 这些脚本直接导入 `src/` 的 TypeScript 源码，而源码沿用 Vite 与 tsc 接受的无扩展名相对导入，因此需要预先加载 `scripts/type-import-loader.mjs` 才能在 Node 下解析（`scripts/check.mjs` 已代为加载）。视觉效果仍需在浏览器中实际查看，尤其是快速切换、模型归位、文档揭示及查看器进出过渡。
- `.github/workflows/checks.yml` 在推送与合并请求上运行 `npm run check` 与 `npm run build:worker`；浏览器回归不进入该流程，需手动运行。
