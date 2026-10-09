import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const base = new URL(process.argv[2] ?? 'https://index.crkcel.com/');
if (base.protocol !== 'https:' && base.hostname !== '127.0.0.1') throw Error(`Use HTTPS for remote verification: ${base.href}`);
const latest = JSON.parse(await readFile('release/cloudflare/latest.json', 'utf8').catch(() => {
  throw Error('No release manifest. Run `npm run build:worker` before verifying a deployment.');
}));
const directory = resolve(latest.directory);
const expected = JSON.parse(await readFile(resolve(directory, 'pwa-build.json'), 'utf8'));
const response = await fetch(new URL('pwa-build.json', base), { cache: 'no-store', signal: AbortSignal.timeout(30000) });
if (!response.ok) throw Error(`Manifest HTTP ${response.status}`);
const actual = await response.json();
if (actual.version !== expected.version || JSON.stringify(actual.files) !== JSON.stringify(expected.files))
  throw Error(`Release mismatch: expected ${expected.version}, got ${actual.version}`);
let next = 0;
let checked = 0;
const files = [...expected.files, 'sw.js', 'update.html', 'update.js'];
// The edge injects bot-management markup into every HTML response, so pages are
// compared after removing that injection instead of byte for byte.
const edgeInjection = [
  /<script>window\.__CF\$cv\$params[\s\S]*?<\/script>/g,
  /<a href="[^"]*\/cdn-cgi\/content[^"]*"[^>]*><\/a>/g,
];
const normalizeHtml = (html) => {
  let value = html;
  for (const pattern of edgeInjection) value = value.replace(pattern, '');
  return value.replace(/\s+/g, ' ').trim();
};
await Promise.all(Array.from({ length: 6 }, async () => {
  while (next < files.length) {
    const path = files[next++];
    const response = await fetch(new URL(path, base), { signal: AbortSignal.timeout(30000) });
    if (!response.ok) throw Error(`${path}: HTTP ${response.status}`);
    const local = await readFile(resolve(directory, path));
    const served = Buffer.from(await response.arrayBuffer());
    if (path.endsWith('.html')) {
      if (normalizeHtml(served.toString('utf8')) !== normalizeHtml(local.toString('utf8')))
        throw Error(`${path}: serves a different document than the local release`);
    } else if (!served.equals(local)) {
      throw Error(`${path}: content mismatch`);
    }
    const cache = response.headers.get('cache-control') ?? '';
    if (/^assets\/archive-(cassette|assembly)\.[a-f0-9]{16}\.glb$/.test(path) && !cache.includes('immutable'))
      throw Error(`${path}: missing immutable cache policy`);
    if (['sw.js', 'update.html', 'update.js'].includes(path) && !cache.includes('no-store'))
      throw Error(`${path}: update resource must not be stored by intermediary caches`);
    checked++;
  }
}));
// Any unmatched path must return the release's 404 page, never the application shell.
const missing = await fetch(new URL('missing-cloudflare-verification.bin', base), { signal: AbortSignal.timeout(30000) });
if (missing.status !== 404) throw Error(`Missing file returns ${missing.status}, expected 404`);
console.log(JSON.stringify({ url: base.href, version: actual.version, verifiedFiles: checked, assetsMatch: true, missingFileStatus: missing.status }, null, 2));
