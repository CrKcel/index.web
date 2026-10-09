# Cloudflare 部署与验收

线上地址 `https://index.crkcel.com/`，Worker 名称 `index`，配置见 [`wrangler.jsonc`](../wrangler.jsonc)：自定义域 + `not_found_handling: "404-page"`，静态资源目录为 `release/cloudflare/site`。

## 命令

```sh
npm run build:worker      # tsc + vite build + Service Worker 清单 + Cloudflare 发行包
npm run deploy            # build:worker 之后由 Wrangler 上传
npm run check:deployment  # 默认核验 https://index.crkcel.com/，可传其他基址
```

`npm run check:deployment -- https://preview.example.com/` 只接受 HTTPS 基址或 `127.0.0.1`（本地 `npx wrangler dev` 的地址）。没有本地发行包时脚本会提示先运行 `npm run build:worker`。

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

## 上线后的验收

`scripts/check-cloudflare-deployment.mjs` 会：

1. 用 `no-store` 拉取线上 `pwa-build.json`，与本地 `latest.json` 的 `version` 和文件清单比对；
2. 以 6 路并发逐字节比对全部发行文件（加上 `sw.js`、`update.html`、`update.js`）。HTML 例外：Cloudflare 会向 HTML 响应注入 bot 管理标记，因此 `index.html` 与 `update.html` 在去掉注入内容并归一空白后比较；
3. 校验 GLB 的 `immutable` 与更新入口的 `no-store` 缓存语义；
4. 请求一个不存在的路径，确认返回 404 而不是应用外壳。

回滚：先用 `npx wrangler deployments list` 找到上一次部署，再 `npx wrangler rollback [deployment-id]`；普通回滚需要重新构建同样的源码，因为发行包按内容定址，重新构建会得到相同的 `version` 与文件名。
