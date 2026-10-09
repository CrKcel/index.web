> [!IMPORTANT]
> 项目 Fork 并修改自 [RhineLabUI](https://github.com/LBEILC/RhineLabUI) 。
> 在线预览：[https://index.crkcel.com](https://index.crkcel.com)

# RHINE LAB · ANALYSIS OS

![莱茵生命终端：由透明档案盒构成的三维阵列](docs/archive.jpg)

界面采用 **TypeScript + Three.js + Vite**，运行时实时渲染三维模型，开场由 DOM / SVG 与场景时间轴驱动；模型通过 Blender MCP 制作，源工程与可复现脚本保存在 [`art/`](art/)。

## 工程结构

| 目录或文件 | 内容 |
| --- | --- |
| [`src/main.ts`](src/main.ts) | 页面状态、档案阅读、检索、收藏与快捷键 |
| [`src/boot.ts`](src/boot.ts)、[`src/boot-motion.ts`](src/boot-motion.ts) | 开场界面与逐帧时间轴 |
| [`src/scene.ts`](src/scene.ts)、[`src/archive-loop.ts`](src/archive-loop.ts) | Three.js 场景、循环阵列、抽取与归位 |
| [`src/model-viewer.ts`](src/model-viewer.ts) | 独立模型查看器与拆解动画 |
| [`src/decryption.ts`](src/decryption.ts)、[`src/document-decryption.ts`](src/document-decryption.ts) | 模型解密轨迹与正文同步揭示 |
| [`src/audio.ts`](src/audio.ts)、[`public/audio/`](public/audio/) | 交互音效、三轨配乐与音源记录 |
| [`src/render-quality.ts`](src/render-quality.ts)、[`src/quality-renderer.ts`](src/quality-renderer.ts) | 画质预设与渲染管线 |
| [`content/archives.json`](content/archives.json) | 页面与下载共用的五类、40 份档案数据 |
| [`src/data.ts`](src/data.ts) | 档案类型与阵列位置映射 |
| [`public/assets/`](public/assets/) | 运行所需的 GLB 模型 |
| [`art/`](art/) | Blender 源文件、建模与审阅脚本 |
| [`scripts/`](scripts/) | 构建、部署、内容校验与行为检查 |
| [`docs/`](docs/) | 设计约束、部署与验收说明、README 截图 |
| [`docs/DESIGN.md`](docs/DESIGN.md) | 视觉、相机、材质与运动约束 |

原片时间轴使用 160 个阵列位置；交互模式按当前镜头与视口计算候选范围并裁剪屏幕外档案，让有限的档案内容可以持续循环。

### 修改与复核

修改档案内容从 [`content/archives.json`](content/archives.json) 入手，字段与操作步骤见 [档案修改说明](content/README.md)。`npm run dev` 与 `npm run build` 会先校验数据；档案下载由页面用同一份数据生成。`npm run check:content` 检查数据规则与下载文本。

```sh
npm run check          # 免浏览器的全部检查，清单见 scripts/check.mjs
npm run check:browser  # 追加真实浏览器回归，需要 Playwright
```

`npm run check` 覆盖内容规则、视口与取景、字体栈一致性、运动与循环、拖拽与惯性、可见性覆盖、外观与解密轨迹、外壳与装配、画质上限、渲染去重、主题波与 PWA 重定向。检查脚本直接运行 `src/` 的 TypeScript 源码，需要 Node 24 或更高版本；清单外的 `scripts/check-*.mjs` 会让运行器直接报错。

浏览器回归（PWA 更新与失败恢复、响应式布局、开场入口、拖拽与惯性）需要先 `npm i -D playwright && npx playwright install chromium`，或把 `PLAYWRIGHT_MODULE` 指向已有的安装；`check-responsive`、`check-startup-entry` 等脚本用 `REVIEW_URL` 指向正在运行的 `npm run dev` 或 `npm run preview` 地址，`check-pwa-recovery` 需要 `PWA_PREVIOUS_DIST` 指向上一份构建产物。脚本优先用系统中的 Chrome 无头运行；找不到时回退到 Playwright 自带的 Chromium，并改为有窗口运行，因为它的无头构建是软件渲染、跑不到实时，动画等待会超时。`REVIEW_CHANNEL` 可指定浏览器（`chromium` 表示强制使用自带构建），`REVIEW_HEADED=1` 强制有窗口运行。视觉效果仍需在浏览器中实际查看，尤其是快速切换、模型归位、文档揭示及查看器进出过渡。

### 交付与验收

`npm run build` 生成 `dist` 与带内容版本的 Service Worker，`npm run build:worker` 生成 `release/cloudflare/site` 发行包，`npm run deploy` 由 Wrangler 上传；上线后用 `npm run check:deployment` 逐字节比对线上文件、缓存标头与 404 页面。推送与合并请求由 `.github/workflows/checks.yml` 运行 `npm run check` 与 `npm run build:worker`。流程与回滚方式见 [Cloudflare 部署与验收](docs/CLOUDFLARE-DEPLOYMENT.md)。

| 本地调试路径 | 用途 |
| --- | --- |
| `/?scene=archive` | 直接进入档案阵列 |
| `/?scene=detail` | 直接进入档案详情 |
| `/?time=28&freeze=1` | 固定在参考时间轴的指定时刻 |

### Blender 工程

| 文件 | 用途 |
| --- | --- |
| [`art/rhine-archive.blend`](art/rhine-archive.blend) | 档案盒基础模型与审阅灯光 |
| [`art/archive-assembly.blend`](art/archive-assembly.blend) | 可按六组结构拆解的模型 |
| [`art/build_archive.py`](art/build_archive.py) | 生成基础模型与 GLB |
| [`art/build_assembly.py`](art/build_assembly.py) | 生成拆解模型与 GLB |
| [`art/internal_architecture.py`](art/internal_architecture.py) | 双环内构与连接带 |
| [`art/shell_reference_details.py`](art/shell_reference_details.py) | 顶边方块、螺丝及盖板后刻线 |
| [`art/setup_studio.py`](art/setup_studio.py) | 配置资产审阅灯光与相机 |

重新建模时，可在 Blender 的脚本环境中通过 `runpy.run_path()` 执行对应脚本，或通过 Blender MCP 调用。脚本根据自身位置确定项目目录，重新生成会更新对应模型输出。

## LIENSE

保留上游 [MIT License](LICENSE)，《明日方舟》相关内容及其他第三方资源不在本项目的 MIT 授权范围内。
