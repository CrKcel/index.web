> [!IMPORTANT]
> 项目 Fork 并修改自 [RhineLabUI](https://github.com/LBEILC/RhineLabUI) 。
> 在线预览：[https://index.crkcel.com](https://index.crkcel.com)

# RHINE LAB · ANALYSIS OS

![莱茵生命终端：由透明档案盒构成的三维阵列](docs/archive.jpg)

界面采用 **TypeScript + Three.js + Vite**，运行时实时渲染三维模型，开场由 DOM / SVG 与场景时间轴驱动；模型源工程与可复现脚本保存在 [`art/`](art/)。

## 文档

| 文档 | 内容 |
| --- | --- |
| [`AGENTS.md`](AGENTS.md) | 命令、检查与浏览器回归、部署与验收、档案与字体约束 |
| [`docs/DESIGN.md`](docs/DESIGN.md) | 视觉、相机、材质与运动基准 |
| [`docs/CLOUDFLARE-DEPLOYMENT.md`](docs/CLOUDFLARE-DEPLOYMENT.md) | Cloudflare 发行包内容、缓存语义与额度 |
| [`content/README.md`](content/README.md) | 档案字段与修改步骤 |
| [`public/audio/README.md`](public/audio/README.md) | 配乐与音效来源 |

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

## Blender 工程

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
