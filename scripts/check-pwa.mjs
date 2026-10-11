// Uses a disposable HTTP server to exercise real service-worker updates/failures.
import { loadPlaywright } from './playwright.mjs';
import { launchChromium } from './browser-launch.mjs';
import { installSnapshot } from './page-snapshot.mjs';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve, extname } from 'node:path';
const {chromium} = await loadPlaywright();
const metadata=JSON.parse(await readFile('dist/pwa-build.json','utf8'));
let revision=1,fail=false;
const root=resolve('dist');
const mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.webmanifest':'application/manifest+json','.svg':'image/svg+xml','.png':'image/png','.txt':'text/plain','.glb':'model/gltf-binary','.ogg':'audio/ogg'};
const server=createServer(async(req,res)=>{try{
  const url=new URL(req.url,'http://localhost');const path=decodeURIComponent(url.pathname==='/'?'/index.html':url.pathname);const file=resolve(root,`.${path}`);
  if(!file.startsWith(root+ '/'.replace('/',process.platform==='win32'?'\\':'/')))throw Error();
  if(fail&&path==='/icons/icon-192.png'){res.writeHead(503).end();return}
  let body=await readFile(file);
  if(path==='/sw.js'&&revision>1)body=Buffer.from(body.toString().replace(metadata.version,`${metadata.version}-test-${revision}`));
  res.writeHead(200,{'Content-Type':mime[extname(file)]||'application/octet-stream','Cache-Control':'no-cache'}).end(body);
}catch{res.writeHead(404).end()}});
await new Promise(resolve=>server.listen(5191,'127.0.0.1',resolve));
const browser=await launchChromium(chromium);
const context=await browser.newContext({viewport:{width:390,height:844},hasTouch:true,isMobile:true});
await context.addInitScript(()=>{if(!localStorage.getItem('rhine-settings'))localStorage.setItem('rhine-settings',JSON.stringify({sound:false,music:false}))});
await installSnapshot(context);
// The check owns the visibility it needs: a background tab is reported as
// visible in some channels, while this flips `document.hidden` the way a
// backgrounded tab does, render loop included.
await context.addInitScript(()=>{
  let hidden=false;
  Object.defineProperty(Document.prototype,'hidden',{configurable:true,get:()=>hidden});
  Object.defineProperty(Document.prototype,'visibilityState',{configurable:true,get:()=>hidden?'hidden':'visible'});
  window.hideTerminal=()=>{hidden=true;document.dispatchEvent(new Event('visibilitychange'))};
});
const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
const ready=()=>page.waitForFunction(()=>window.readSnapshot().ready&&document.documentElement.dataset.offlineReady==='true'&&navigator.serviceWorker.controller,null,{timeout:90000});
const report={version:metadata.version,bytes:metadata.bytes,files:metadata.files.length,checks:[],errors};
try{
 await page.goto('http://127.0.0.1:5191/?scene=archive');await ready();
 const manifest=await page.evaluate(async()=>await(await fetch(document.querySelector('link[rel="manifest"]').href)).json());
 // Installability: a standalone display, the scope it was precached for, both
 // required icon sizes and a maskable icon for Android.
 assert.equal(manifest.display,'standalone');assert.equal(manifest.scope,'./');
 const sizes=manifest.icons.map(icon=>icon.sizes);
 assert.ok(sizes.includes('192x192')&&sizes.includes('512x512'),'Both install icon sizes');
 assert.ok(manifest.icons.some(icon=>String(icon.purpose).includes('maskable')),'A maskable icon ships');
 await page.evaluate(async()=>{await caches.open('unrelated-app');localStorage.setItem('rhine-saved','["X-001"]')});
 report.checks.push('manifest, installation, atomic full-resource cache');
 await context.setOffline(true);await page.reload();await ready();
 await page.locator('.read-file').click();await page.waitForFunction(()=>window.readSnapshot().decryption.clarity===1);
 // Exporting offline must still hand the record to the browser as a download.
 const [download]=await Promise.all([page.waitForEvent('download'),page.locator('.export-button').click()]);
 const chunks=[];for await(const chunk of await download.createReadStream())chunks.push(chunk);
 const exported=Buffer.concat(chunks).toString('utf8');
 assert.ok(exported.includes('X-001'),'Offline export writes the saved record');
 await page.locator('.viewer-open').click();await page.waitForFunction(()=>JSON.parse(document.querySelector('.model-viewer')?.dataset.stats||'{}').ready);
 await page.locator('[data-viewer="explode"]').click();await page.waitForFunction(()=>JSON.parse(document.querySelector('.model-viewer').dataset.stats).spread===1);
 await mkdir('.tools/responsive',{recursive:true});await page.screenshot({path:'.tools/responsive/pwa-offline.png'});
 assert.equal(await page.evaluate(async()=>{const r=await fetch('/audio/motif.ogg');if(!r.ok)return 0;return (await r.arrayBuffer()).byteLength}),(await readFile(resolve(root,'audio/motif.ogg'))).length,'The score is served whole from the cache');
 report.checks.push('offline reload, document export, model viewer, explosion and audio resource');
 const releases=async()=>(await page.evaluate(()=>caches.keys())).filter(key=>key.startsWith('rhine-lab:')).map(key=>key.split(':').pop());
 // A downloaded release never restarts a session that is in use, and the
 // terminal offers no update action of its own.
 await context.setOffline(false);
 await page.evaluate(()=>{window.__session='kept'});
 revision=2;
 await page.evaluate(async()=>{const r=await navigator.serviceWorker.getRegistration();await r.update()});
 await page.waitForFunction(async()=>Boolean((await navigator.serviceWorker.getRegistration())?.waiting),null,{timeout:90000});
 await page.waitForTimeout(2000);
 assert.equal(await page.evaluate(()=>window.__session),'kept','A visible session keeps running its own release');
 assert.equal(await page.locator('#pwa-update-notice').count(),0,'The terminal has no update notice');
 assert.equal(await page.locator('[data-pwa-action="update"]').count(),0,'Settings keep no update action');
 assert.deepEqual((await releases()).sort(),[metadata.version,`${metadata.version}-test-2`].sort(),'The waiting release is complete but not the running one');
 report.checks.push('a downloaded release waits while the terminal is in use and offers no manual action');
 // Hiding the terminal is the first apply moment.
 await page.locator('[data-viewer="close"]').click();
 const hiddenApply=page.waitForNavigation({waitUntil:'load',timeout:90000});
 await page.evaluate(()=>window.hideTerminal());
 await hiddenApply;await ready();
 assert.equal(await page.evaluate(()=>localStorage.getItem('rhine-saved')),'["X-001"]');
 const keys=await page.evaluate(()=>caches.keys());
 assert.ok(keys.includes('unrelated-app'),'Unrelated caches survive the update');
 assert.equal(keys.filter(k=>k.startsWith('rhine-lab:')).length,1);
 assert.ok(keys.some(k=>k.endsWith('-test-2')));
 report.checks.push('a hidden terminal applies the waiting release, cleans the old cache and keeps preferences/bookmarks');
 // Replaying the opening is the second apply moment.
 await page.waitForFunction(()=>window.readSnapshot().mode==='archive',null,{timeout:90000});
 revision=3;
 await page.evaluate(async()=>{const r=await navigator.serviceWorker.getRegistration();await r.update()});
 await page.waitForFunction(async()=>Boolean((await navigator.serviceWorker.getRegistration())?.waiting),null,{timeout:90000});
 const openingApply=page.waitForNavigation({waitUntil:'load',timeout:90000});
 await page.locator('[data-action="replay"]').click();
 await openingApply;await ready();
 assert.ok((await releases()).includes(`${metadata.version}-test-3`),'The opening applies the waiting release');
 report.checks.push('replaying the opening applies the waiting release without a manual restart');
 revision=4;fail=true;
 await page.evaluate(async()=>{const r=await navigator.serviceWorker.getRegistration();await r.update()});
 await page.waitForFunction(async()=>{const r=await navigator.serviceWorker.getRegistration();return !r.installing&&!r.waiting},null,{timeout:90000});
 await context.setOffline(true);await page.reload();await ready();
 assert.ok((await releases()).includes(`${metadata.version}-test-3`));
 assert.ok(!(await releases()).includes(`${metadata.version}-test-4`));
 report.checks.push('failed update leaves the previous complete offline release usable');
 assert.deepEqual(errors,[]);console.log(JSON.stringify(report,null,2));
}finally{await writeFile('.tools/responsive/pwa-report.json',JSON.stringify(report,null,2));await browser.close();await new Promise(r=>server.close(r))}
