// Run against a built preview; optionally set REVIEW_CHANNEL=msedge.
import { loadPlaywright } from './playwright.mjs';
import { launchChromium, browserChannel } from './browser-launch.mjs';
import { installSnapshot, snapshot as stats } from './page-snapshot.mjs';
import assert from 'node:assert/strict';
import {mkdir, writeFile} from 'node:fs/promises';
const {chromium} = await loadPlaywright();
const channel=browserChannel();
const browser=await launchChromium(chromium);
const base=process.env.REVIEW_URL || 'http://127.0.0.1:5190/';
const report={channel,version:browser.version(),checks:[]};
try {for(const browserMotion of ['no-preference','reduce']) {
 const context=await browser.newContext({viewport:{width:1440,height:900},reducedMotion:browserMotion,serviceWorkers:'block'});
 await installSnapshot(context);
 const page=await context.newPage(),errors=[];page.on('pageerror',error=>errors.push(error.message));
 const loaded=async()=>{
   await page.waitForFunction(()=>window.readSnapshot().ready);
 };
 await page.goto(base);await loaded();
 let state=await stats(page);
 const reduced=browserMotion==='reduce';
 assert.equal(state.mode,reduced?'archive':'boot');
 assert.equal(state.motion.reduced,reduced);
 assert.equal(state.motion.preset,reduced?'reduced':'full');
 // The archive entry shortcut replaces the old review call; every visit asks
 // for the array explicitly, including the one after the reload.
 if(!reduced){await page.goto(`${base}?scene=archive`);await loaded();}
 await page.getByRole('button',{name:'系统设置',exact:true}).click();
 assert.ok(await page.locator('#motion-settings').isVisible(),'Motion settings are on screen');
 assert.equal(await page.locator(`[data-action="motion-preset"][data-preset="${reduced?'reduced':'full'}"]`).getAttribute('aria-pressed'),'true');
 await page.locator('[data-action="motion-preset"][data-preset="full"]').click();
 await page.locator('.motion-advanced summary').click();
 // The switch rebuilds its own section, so re-resolve it instead of holding
 // the replaced input node.
 await page.locator('[data-motion="modelDecryption"]').click();
 await page.waitForFunction(()=>!document.querySelector('[data-motion="modelDecryption"]').checked,null,{timeout:10000});
 assert.ok(await page.locator('.motion-advanced').evaluate(el=>el.open),'Toggling a switch does not collapse the advanced section');
 assert.equal(await page.locator('[data-action="motion-preset"][data-preset="custom"]').getAttribute('aria-pressed'),'true','Tuning one switch selects the custom preset');
 await page.goto(`${base}?scene=archive`);await loaded();
 await page.getByRole('button',{name:'系统设置',exact:true}).click();
 assert.equal(await page.locator('[data-motion="modelDecryption"]').isChecked(),false,'The switch survives a reload');
 assert.deepEqual(errors,[]);report.checks.push({browserMotion,passed:true});await context.close();
}}finally{await browser.close()}
await mkdir('.tools/responsive',{recursive:true});await writeFile(`.tools/responsive/startup-${channel}.json`,JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
