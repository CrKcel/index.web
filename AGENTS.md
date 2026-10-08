## 范围

本仓库维护网页版本的 Rhine Lab 终端，域名为 `https://index.crkcel.com/`，部署在 Cloudflare Workers 的静态资源上，Worker 名称为 `index`，配置见 `wrangler.jsonc`。

## Cloudflare Workers

- 文档：https://developers.cloudflare.com/workers/ ，MCP：`https://docs.mcp.cloudflare.com/mcp`。所有限制与配额从产品的 `/platform/limits/` 页面获取。
- 命令：`npx wrangler dev` 本地开发，`npx wrangler deploy` 部署，`npx wrangler types` 生成类型；改动绑定后运行 `wrangler types`。
- `npm run deploy` 先执行 `npm run build:worker` 生成发行包到 `release/cloudflare/site`，校验授权 Novecento 字体并写入缓存标头与 `404.html`，再通过 Wrangler 上传；字体不进入 Git，构建时从运行的正式站点恢复并校验。未命中路径返回 404，`/index.html` 重定向到 `/`。部署记录见 `docs/CLOUDFLARE-DEPLOYMENT.md`。
- `npx wrangler dev` 运行时提供 Local Explorer API 用于检查本地 Worker、绑定与存储状态，API 基址在终端输出。常用端点：`/cdn-cgi/local/explorer/api/local/workers`、`/storage/kv/namespaces`、`/d1/database`、`/r2/buckets`、`/workers/durable_objects/namespaces`、`/workflows`，以及 `POST /local/observability/query`（只读 SQL）与 `POST /local/observability/clear`。

## 视觉与时序

视觉、相机、材质、字体与运动约束见 `docs/DESIGN.md`。界面采用 TypeScript、Three.js、Vite 的原生实现，`art/` 保留源工程与可复现脚本。

## 技术栈与资源

- 1920×1080 为布局基准，等比例适应窗口；支持桌面不同比例、手机横竖屏与触摸操作，16:9 为视觉基准。
- 档案内容独立保存在 `content/archives.json`，页面与 TXT 导出共用，构建前校验；保留五列、每列八份与稳定编号约束，步骤见 `content/README.md`。
- 字体分包 `misans-webfont@4.3.1` 随项目同源部署、按页面字符加载；Novecento 与 MiSans 的许可、来源与固定版本记录保存在 `public/fonts`。授权 Novecento 与 MiSans/Novecento 独立许可资源不进入 Git。
- 画质只调整渲染精度与可选效果，不重新制作模型；默认采用原始预设。
- 声音与音乐独立开关与音量；保留源谱与音色生成脚本。

## 开发与验证

- `npm run dev` 启动本地开发，`npm run build` 生成静态站点与带内容版本的 Service Worker 到 `dist`，`npm run build:worker` 生成 Cloudflare 发行包，`npm run deploy` 部署。开发模式不注册 Service Worker。
- `npm run build` 与 `npm run dev` 会先校验档案数据；档案下载由页面用同一份数据生成。`npm run check:content` 检查数据规则与下载文本。
- 行为与视觉回归脚本位于 `scripts/`。视觉效果需在浏览器中实际查看，尤其是快速切换、模型归位、文档揭示及查看器进出过渡。
- `reference/` 保存开发对照与逐帧审阅工具，仅用于本地核对，不作为产品内容。
