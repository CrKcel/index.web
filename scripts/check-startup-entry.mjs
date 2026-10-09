// Real browser checks for the self-starting opening.
//
// There is no entry screen any more: the page plays its own opening from the
// first frame while the archive model and the score stream in behind it. If the
// archive is late the opening holds its composed welcome card, and the entry
// button stays inert until it exists. These checks drive that window in a real
// browser, including the failure notice.
import { loadPlaywright } from './playwright.mjs';
import { launchChromium } from './browser-launch.mjs';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
const { chromium, webkit } = await loadPlaywright();
const base = process.env.REVIEW_URL || 'http://127.0.0.1:5190/';
const engine = process.env.REVIEW_ENGINE || 'chromium';
const browser = engine === 'webkit' ? await webkit.launch({headless:true}) : await launchChromium(chromium);
const report = {engine,version:browser.version(),checks:[],errors:[]};
const output = resolve('.tools/issues');await mkdir(output,{recursive:true});
/** The app-time seconds of the composed welcome card the opening holds on. */
const HOLD = 20.6, HOLD_BOOT_TIME = HOLD + 5;
const stats = page => page.evaluate(() => window.rhine.stats());
async function fresh(options={},prefs) {
  const context=await browser.newContext({viewport:{width:1440,height:900},serviceWorkers:'block',reducedMotion:'no-preference',...options});
  if(prefs)await context.addInitScript(prefs=>localStorage.setItem('rhine-settings',JSON.stringify(prefs)),prefs);
  const page=await context.newPage();page.on('pageerror',e=>report.errors.push(e.message));return {context,page};
}
/** Withholds the archive model until `open()` is called, so the hold is observable. */
async function gateArchive(page) {
  let open;const gate=new Promise(resolve=>open=resolve);
  await page.route('**/*.glb',async route=>{await gate;await route.continue().catch(()=>{});});
  return open;
}
const silent = {sound:false,music:false};
try {
  {
    const {context,page}=await fresh({},silent);
    const open=await gateArchive(page);
    await page.goto(base,{waitUntil:'domcontentloaded'});
    await page.waitForFunction(()=>window.rhine?.stats(),null,{timeout:60000});
    assert.equal(await page.locator('#loading').count(),0,'The entry screen is gone');
    assert.equal(await page.locator('.entry-start').count(),0,'The entry button is gone');
    const first=await stats(page);
    assert.equal(first.mode,'boot','The opening starts itself');
    assert.equal(first.ready,false,'The archive is still streaming in');
    assert.equal(first.audio.state,'locked','No gesture created the audio device yet');
    // The opening must not wait for audio: its clock runs with the device locked.
    await page.waitForTimeout(700);
    const second=await stats(page);
    assert.ok(second.bootTime>first.bootTime+0.4,'The opening advances while the archive loads and audio is locked');
    // The interface must rely on platform fonts: no webfont request at all.
    const fonts=await page.evaluate(()=>performance.getEntriesByType('resource').filter(e=>e.name.endsWith('.woff2')).map(e=>new URL(e.name).pathname));
    assert.equal(fonts.length,0,'The site must not download webfonts');
    await page.screenshot({path:resolve(output,'opening-desktop.png')});

    // Reach the welcome card without waiting out the whole opening.
    await page.evaluate(()=>window.rhine.seek(20.2));
    await page.waitForFunction(()=>window.rhine.stats().hold,null,{timeout:20000});
    const held=await stats(page);
    assert.ok(Math.abs(held.bootTime-HOLD_BOOT_TIME)<0.3,`The opening holds on the welcome card (${held.bootTime})`);
    assert.equal(await page.locator('#stage').getAttribute('data-boot'),'welcome');
    assert.equal(await page.locator('#skip').getAttribute('aria-disabled'),'true');
    assert.equal(await page.locator('.mobile-entry').getAttribute('aria-disabled'),'true');
    assert.equal(await page.locator('.welcome-status').evaluate(el=>getComputedStyle(el).opacity),'1','The loading status is on screen');
    await page.screenshot({path:resolve(output,'opening-hold.png')});
    // Entering the array early is refused by pointer and by keyboard.
    await page.locator('#skip').click({force:true});
    await page.waitForTimeout(300);
    assert.equal((await stats(page)).mode,'boot','The entry button stays inert while loading');
    await page.keyboard.press('Enter');
    await page.waitForTimeout(200);
    assert.equal((await stats(page)).mode,'boot','Enter stays inert while loading');
    const pinned=await stats(page);
    assert.ok(Math.abs(pinned.bootTime-held.bootTime)<0.4,'The held clock does not advance');

    // Once the archive exists the opening resumes from the hold and hands over.
    open();
    await page.waitForFunction(()=>window.rhine.stats().ready,null,{timeout:120000});
    await page.waitForFunction(()=>!window.rhine.stats().hold,null,{timeout:20000});
    assert.equal(await page.locator('#skip').getAttribute('aria-disabled'),'false');
    const resumed=await stats(page);
    assert.ok(resumed.bootTime>=HOLD_BOOT_TIME&&resumed.bootTime<HOLD_BOOT_TIME+2,`The opening resumes from the hold (${resumed.bootTime})`);
    await page.locator('#skip').click();
    await page.waitForTimeout(400);
    assert.equal((await stats(page)).mode,'archive','The entry button enters the array once the archive exists');
    report.checks.push({name:'Self-starting opening holds its welcome card until the archive exists',fontRequests:fonts.length});
    await context.close();
  }
  {
    const {context,page}=await fresh({viewport:{width:390,height:844},hasTouch:true,isMobile:true},silent);
    const open=await gateArchive(page);
    await page.goto(base,{waitUntil:'domcontentloaded'});
    await page.waitForFunction(()=>window.rhine?.stats()?.hold,null,{timeout:60000});
    assert.equal(await page.locator('.mobile-entry').getAttribute('aria-disabled'),'true');
    await page.locator('.mobile-entry').click({force:true});
    await page.waitForTimeout(300);
    assert.equal((await stats(page)).mode,'boot','The phone entry button waits for the archive');
    await page.screenshot({path:resolve(output,'opening-hold-portrait.png')});
    open();
    await page.waitForFunction(()=>window.rhine.stats().ready,null,{timeout:120000});
    await page.locator('.mobile-entry').click();
    await page.waitForTimeout(400);
    assert.equal((await stats(page)).mode,'archive','The phone entry button enters the array');
    report.checks.push({name:'Portrait entry is gated the same way'});await context.close();
  }
  {
    const {context,page}=await fresh({}, {sound:false,music:false,motion:{preset:'reduced'}});
    const open=await gateArchive(page);
    await page.goto(base,{waitUntil:'domcontentloaded'});
    await page.waitForFunction(()=>window.rhine?.stats()?.hold,null,{timeout:60000});
    const still=await stats(page);
    assert.equal(still.mode,'boot','A switched-off opening still covers the load');
    assert.ok(Math.abs(still.bootTime-HOLD_BOOT_TIME)<0.3,'The still card is the composed welcome frame');
    assert.equal(await page.locator('#stage').getAttribute('data-boot'),'welcome');
    await page.waitForTimeout(500);
    assert.ok(Math.abs((await stats(page)).bootTime-still.bootTime)<0.05,'The still card does not advance');
    open();
    await page.waitForFunction(()=>window.rhine.stats().mode==='archive',null,{timeout:120000});
    report.checks.push({name:'A switched-off opening uses the still card and enters the array'});await context.close();
  }
  if(engine!=='webkit') {
    const {context,page}=await fresh();
    const open=await gateArchive(page);
    const stems=[];
    page.on('response',response=>{if(/\/audio\/.*\.ogg$/.test(response.url()))stems.push(response.url());});
    await page.goto(base,{waitUntil:'domcontentloaded'});
    await page.waitForFunction(()=>window.rhine?.stats(),null,{timeout:60000});
    assert.equal((await stats(page)).audio.state,'locked','Nothing unlocks audio before a gesture');
    // Any pointer gesture unlocks the device; the opening keeps playing.
    await page.locator('#viewport').click({position:{x:20,y:400}});
    await page.waitForFunction(()=>window.rhine.stats().audio.tracks===3,null,{timeout:90000});
    const playing=await stats(page);
    assert.equal(playing.audio.state,'running');
    assert.equal(playing.mode,'boot','Unlocking audio never skips the opening');
    assert.equal(playing.ready,false,'The archive is still loading');
    assert.equal(stems.length,3,'The opening fetches all three score stems');
    report.checks.push({name:'The opening prepares the score and a gesture starts it mid-flight'});await context.close();

    const quiet=await fresh({},silent);
    await quiet.page.goto(base,{waitUntil:'domcontentloaded'});
    await quiet.page.waitForFunction(()=>window.rhine?.stats(),null,{timeout:60000});
    await quiet.page.locator('#viewport').click({position:{x:20,y:400}});
    await quiet.page.waitForTimeout(700);
    assert.equal((await stats(quiet.page)).audio.state,'locked','A silent preference never opens an audio device');
    report.checks.push({name:'Existing silent preference keeps the device closed'});await quiet.context.close();
  }
  {
    const {context,page}=await fresh();
    await page.goto(`${base}?time=6.2&freeze=1`,{waitUntil:'domcontentloaded'});
    await page.waitForFunction(()=>window.rhine?.stats()?.ready,null,{timeout:120000});
    const frozen=await stats(page);
    assert.equal(frozen.hold,false,'The reference freeze never waits on the archive');
    await page.waitForTimeout(500);
    assert.equal((await stats(page)).bootTime,frozen.bootTime,'The frozen reference time holds');
    report.checks.push({name:'Frame review bypasses the hold and preserves reference time'});await context.close();
  }
  {
    const {context,page}=await fresh({},silent);
    await page.route('**/*.glb',route=>route.fulfill({status:503,body:'Unavailable'}));
    await page.goto(base,{waitUntil:'domcontentloaded'});
    await page.waitForSelector('#boot-error:not([hidden])',{timeout:60000});
    assert.equal(await page.locator('#boot-error [data-action="reconnect"]').count(),1,'The failure notice offers a reconnect');
    assert.equal((await stats(page)).ready,false);
    await page.screenshot({path:resolve(output,'opening-error.png')});
    report.checks.push({name:'A failed archive load reports itself instead of holding forever'});await context.close();
  }
  assert.deepEqual(report.errors,[]);console.log(JSON.stringify(report,null,2));
} finally {await writeFile(resolve(output,`startup-${engine}-${process.env.REVIEW_CHANNEL||'chrome'}.json`),JSON.stringify(report,null,2));await browser.close();}
