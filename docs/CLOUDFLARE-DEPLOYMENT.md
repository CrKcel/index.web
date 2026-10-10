# Cloudflare 发行包

配置见 [`wrangler.jsonc`](../wrangler.jsonc)：自定义域 + `not_found_handling: "404-page"`，静态资源目录为 `release/cloudflare/site`。

## 发行包内容

`scripts/package-cloudflare.mjs` 每次先清空 `release/cloudflare/site`，再按 PWA 清单复制文件，另外生成：

| 文件 | 作用 |
| --- | --- |
| `_headers` | 内容寻址的 GLB 为 `immutable`（一年）；`/`、`/index.html`、`/update*`、`/sw.js` 为 `no-store`；`/manifest.webmanifest`、`/pwa-build.json` 为 `no-cache` |
| `404.html` | 未命中路径返回发行包自己的 404 页面，而不是应用外壳 |
| `sw.js` | 由 `scripts/pwa-worker.js` 注入版本号与预缓存清单 |
| `pwa-build.json` | 本次发行的 `version`（Worker 源码与全部预缓存文件的 sha256 前 16 位）与文件清单 |
| `../latest.json` | `version`、文件数、总字节数与最大单文件字节数 |

打包时强制校验 Cloudflare 免费额度：单文件 ≤ 25 MiB、文件数 ≤ 20000。`release/` 已加入 `.gitignore`，因此 `latest.json` 是本地记录，不是历史档案；需要留档时请把 `version` 写进提交信息或发布说明。
