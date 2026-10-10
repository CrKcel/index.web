## 范围

界面采用 **TypeScript + Three.js + Vite**，运行时实时渲染三维模型，开场由 DOM / SVG 与场景时间轴驱动；

文档分工：命令、检查、部署与运行约束以本文件为准；视觉、相机、材质、字体与运动基准见 `docs/DESIGN.md`；发行包内容、缓存语义与额度见 `docs/CLOUDFLARE-DEPLOYMENT.md`；档案数据规则见 `content/README.md`；

## 工程结构

| 目录或文件 | 内容 |
| --- | --- |
| [`src/main.ts`](src/main.ts) | 页面状态、模式切换与动作实现 |
| [`src/controls.ts`](src/controls.ts) | 事件委托：设置控件、目录按钮、快捷键与模态焦点陷阱 |
| [`src/boot-frame.ts`](src/boot-frame.ts) | 开场时间轴的纯函数：步进阈值、淡入与运镜通道 |
| [`src/stage-markup.ts`](src/stage-markup.ts)、[`src/detail-markup.ts`](src/detail-markup.ts)、[`src/directory-markup.ts`](src/directory-markup.ts)、[`src/settings-markup.ts`](src/settings-markup.ts) | 舞台、档案正文、检索目录与设置面板的标记 |
| [`src/prefs-store.ts`](src/prefs-store.ts)、[`src/layout-fit.ts`](src/layout-fit.ts)、[`src/rolling-widgets.ts`](src/rolling-widgets.ts) | 偏好持久化、舞台标定与滚动数字/文字组件 |
| [`src/boot.ts`](src/boot.ts)、[`src/boot-motion.ts`](src/boot-motion.ts) | 开场界面与逐帧时间轴 |
| [`src/scene.ts`](src/scene.ts)、[`src/archive-loop.ts`](src/archive-loop.ts) | Three.js 场景、循环阵列、抽取与归位 |
| [`src/archive-camera.ts`](src/archive-camera.ts) | 相机取景与开场运镜（纯函数，标定端点见 `docs/DESIGN.md`） |
| [`src/archive-field.ts`](src/archive-field.ts) | 阵列表面波场：驻波、呼吸、选中涟漪与配乐位移 |
| [`src/archive-pointer.ts`](src/archive-pointer.ts) | 指针、滚轮与拖拽手势、惯性交接与悬停采样 |
| [`src/archive-render.ts`](src/archive-render.ts) | 合成通道链、画质开关与帧去重 |
| [`src/archive-cassette.ts`](src/archive-cassette.ts) | 模型装配、烘焙代理、标签画布与实例打包 |
| [`src/model-viewer.ts`](src/model-viewer.ts) | 独立模型查看器与拆解动画 |
| [`src/decryption.ts`](src/decryption.ts)、[`src/document-decryption.ts`](src/document-decryption.ts) | 模型解密轨迹与正文同步揭示 |
| [`src/audio.ts`](src/audio.ts) | 音频设备生命周期、手势解锁、音效节流与开场提示调度 |
| [`src/audio-synth.ts`](src/audio-synth.ts)、[`src/audio-music.ts`](src/audio-music.ts)、[`src/audio-types.ts`](src/audio-types.ts)、[`public/audio/`](public/audio/) | 交互音效合成、三轨配乐循环与声部比例、音效清单与音源记录 |
| [`src/render-quality.ts`](src/render-quality.ts)、[`src/quality-renderer.ts`](src/quality-renderer.ts) | 画质预设与渲染管线 |
| [`content/archives.json`](content/archives.json) | 页面与下载共用的五类、40 份档案数据 |
| [`src/data.ts`](src/data.ts) | 档案类型与阵列位置映射 |
| [`public/assets/`](public/assets/) | 运行所需的 GLB 模型 |
| [`art/`](art/) | Blender 源文件、建模与审阅脚本 |
| [`scripts/`](scripts/) | 构建、部署、内容校验与行为检查 |
| [`docs/`](docs/) | 本文档的截图与设计、部署说明 |

## 命令

| 命令 | 作用 |
| --- | --- |
| `npm run dev` | 本地开发，启动前校验档案数据；开发模式不注册 Service Worker |
| `npm run build` | `tsc` + Vite 构建到 `dist`，并生成带内容版本的 Service Worker；构建前校验档案数据 |
| `npm run build:worker` | 在 `build` 之后打包 Cloudflare 发行包到 `release/cloudflare/site` |
| `npm run deploy` | `build:worker` 之后由 Wrangler 上传发行包 |
| `npm run check:content` | 校验档案数据规则与下载文本 |
| `npm run check` | 全部免浏览器检查，与 CI 相同 |
| `npm run check:browser` | 真实浏览器回归，默认不跑 |
| `npm run check:deployment` | 核验线上发行，默认 `https://index.crkcel.com/`，可传其他基址，只接受 HTTPS 基址或 `127.0.0.1` |

Wrangler：`npx wrangler dev` 本地开发，`npx wrangler deploy` 部署，`npx wrangler types` 生成类型，改动绑定后运行 `wrangler types`。Cloudflare Workers 文档 https://developers.cloudflare.com/workers/。

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

档案内容独立保存在 `content/archives.json`，`npm run dev` 与 `npm run build` 构建前校验；保留五列、每列八份与稳定编号约束，字段与操作步骤见 `content/README.md`。

## 视觉与排字

视觉、相机、材质、字体与运动约束见 `docs/DESIGN.md`。

- 1920×1080 为布局基准，等比例适应窗口；支持桌面不同比例、手机横竖屏与触摸操作，16:9 为视觉基准。
- 界面使用系统 UI 字体栈。标定过的单行盒靠 `--font-base` + `--fit-width` + `--text-fit`（见 `src/text-fit.ts`）在更宽的平台字体下收缩字号，新增或改动这类盒子时必须补齐前两个变量，并保留开场授权环那种有意的大字距动画。

## 画质与声音

- 画质调整渲染精度与可选效果，默认采用原始预设，预设与参数见 `docs/DESIGN.md`。
- 声音与音乐独立开关与音量；保留源谱与音色生成脚本，来源与处理记录见 `public/audio/README.md`。
