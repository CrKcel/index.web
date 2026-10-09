import { mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { dirname, resolve, sep } from 'node:path';

// Package only the public application, using the same release list as the PWA.
const source = resolve('dist');
const metadata = JSON.parse(await readFile(resolve(source, 'pwa-build.json'), 'utf8'));
if (!/^[a-f0-9]{16}$/.test(metadata.version)) throw Error('Invalid PWA release version.');
// Wrangler serves this directory, so the path stays stable between releases.
const output = resolve('release/cloudflare/site');
const files = [...new Set([...metadata.files, 'sw.js', 'pwa-build.json', 'update.html', 'update.js'])].sort();
const entries = [];
for (const path of files) {
  const from = resolve(source, path);
  if (!from.startsWith(source + sep)) throw Error(`Invalid release path: ${path}`);
  const bytes = await readFile(from);
  if (bytes.length > 25 * 1024 * 1024) throw Error(`Cloudflare file exceeds 25 MiB: ${path}`);
  entries.push({ path, bytes });
}
if (files.length + 2 > 20000) throw Error('Cloudflare free plan file count exceeded.');
// Wrangler uploads whatever sits in the served directory, so each release
// starts from an empty one instead of leaving files from the previous build.
await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });
for (const { path, bytes } of entries) {
  const target = resolve(output, path);
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, bytes);
}
const immutable = files.filter(path => /^assets\/archive-(cassette|assembly)\.[a-f0-9]{16}\.glb$/.test(path));
const headers = [
  ...immutable.map(path => `/${path}\n  Cache-Control: public, max-age=31536000, immutable`),
  ...['/', '/index.html', '/update*', '/sw.js'].map(path => `${path}\n  Cache-Control: no-cache, no-store, must-revalidate`),
  ...['/manifest.webmanifest', '/pwa-build.json'].map(path => `${path}\n  Cache-Control: no-cache, must-revalidate`),
];
await writeFile(resolve(output, '_headers'), headers.join('\n\n') + '\n');
// Missing assets must return 404 instead of being mistaken for successful HTML.
await writeFile(resolve(output, '404.html'), '<!doctype html><html lang="zh-CN"><meta charset="utf-8"><title>页面不存在 · Rhine Lab</title><h1>页面不存在</h1><p><a href="/">返回首页</a></p></html>');
await writeFile('release/cloudflare/latest.json', JSON.stringify({
  version: metadata.version, directory: output, files: files.length + 2,
  bytes: entries.reduce((total, entry) => total + entry.bytes.length, 0),
  largestFileBytes: Math.max(...entries.map(entry => entry.bytes.length)),
}, null, 2));
console.log(`Cloudflare package ready: ${output}\n${files.length + 2} files.`);
