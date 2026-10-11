// Real browser preferences and presentation checks; physics is exercised separately.
import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {openPage} from './browser-session.mjs';
import {startIsolatedDev} from './isolated-dev.mjs';
const isolated=await startIsolatedDev(5188),page=await openPage(isolated.url),checks=[];
const run=fn=>page.evaluate(`(${fn.toString()})()`);
const check=async(name,fn)=>{await fn();checks.push({name,passed:true});console.log(`PASS ${name}`)};
const media=value=>page.send('Emulation.setEmulatedMedia',{features:[{name:'prefers-color-scheme',value}]});
const ready=()=>page.waitFor("!!document.querySelector('select[aria-label=\"Colour theme\"]')");
const select=async value=>{await page.evaluate(`(()=>{const e=document.querySelector('select[aria-label="Colour theme"]');e.value=${JSON.stringify(value)};e.dispatchEvent(new Event('change',{bubbles:true}))})()`)};
const reload=async()=>{await run(()=>window.__themeQaOldDocument=true);await page.send('Page.reload',{ignoreCache:true});await page.waitFor("!window.__themeQaOldDocument && !!document.querySelector('select[aria-label=\"Colour theme\"]')")};
try{
 await ready();await run(()=>localStorage.removeItem('heatpump-simulator.theme'));
 await media('dark');await reload();
 await check('System is the default and follows operating-system light/dark changes',async()=>{
  assert.equal(await run(()=>document.documentElement.dataset.themeChoice),'system');
  assert.equal(await run(()=>document.documentElement.dataset.theme),'dark');
  await media('light');await page.waitFor('document.documentElement.dataset.theme==="light"');
  assert.equal(await run(()=>getComputedStyle(document.documentElement).colorScheme),'light');
 });
 await check('explicit choices override system preference and are stored locally',async()=>{
  await select('dark');await media('light');
  assert.equal(await run(()=>document.documentElement.dataset.theme),'dark');
  assert.equal(await run(()=>localStorage.getItem('heatpump-simulator.theme')),'dark');
  assert.equal(await run(()=>getComputedStyle(document.documentElement).colorScheme),'dark');
 });
 await check('themes preserve the accepted physical state and fixed temperature colours',async()=>{
  await run(async()=>{const src=await fetch('/src/main.ts').then(r=>r.text());globalThis.qa=await import(src.match(/from "([^"]*\/state\.ts[^"]*)"/)[1]);globalThis.qv=await import(src.match(/from "([^"]*\/runtime\/view\.ts[^"]*)"/)[1]);qa.store.update(s=>s.ui.paused=true)});
  await page.waitFor('!qv.simulation.isBusy && qv.simulation.status.output',30000);
  const snapshot=()=>run(()=>({config:JSON.stringify(qa.store.state.cfg),paused:qa.store.state.ui.paused,clock:document.querySelector('.time').textContent,output:JSON.stringify(qv.simulation.status.output),ramps:[...document.querySelectorAll('.legend .ramp')].map(e=>getComputedStyle(e).backgroundImage)}));
  const before=await snapshot();
  for(const theme of ['light','dark']){
   await select(theme);await new Promise(r=>setTimeout(r,100));assert.deepEqual(await snapshot(),before);
   await page.send('Page.bringToFront');
   const shot=await page.send('Page.captureScreenshot',{format:'png',fromSurface:false,captureBeyondViewport:false});
   await writeFile(`design/interface-${theme}.png`,Buffer.from(shot.data,'base64'));
  }
  assert.equal(await run(()=>document.querySelectorAll('img,image,canvas').length),0);
 });
 await check('explicit preference survives reload and System removes the override',async()=>{
  await reload();assert.equal(await run(()=>document.documentElement.dataset.themeChoice),'dark');
  await select('system');assert.equal(await run(()=>localStorage.getItem('heatpump-simulator.theme')),null);
  await media('light');await reload();assert.equal(await run(()=>document.documentElement.dataset.theme),'light');
  assert.equal(await run(()=>document.querySelector('select[aria-label="Colour theme"]').value),'system');
 });
 await check('unavailable local storage keeps the interface usable with system default and page-local overrides',async()=>{
  const {identifier}=await page.send('Page.addScriptToEvaluateOnNewDocument',{source:'Object.defineProperty(window,"localStorage",{get(){throw new DOMException("Disabled for QA","SecurityError")}})'});
  try{
   await media('dark');await reload();assert.equal(await run(()=>document.documentElement.dataset.theme),'dark');
   await select('light');assert.equal(await run(()=>document.documentElement.dataset.theme),'light');
  }finally{await page.send('Page.removeScriptToEvaluateOnNewDocument',{identifier})}
 });
 assert.deepEqual(page.events.filter(e=>e.method==='Runtime.exceptionThrown'),[]);
 await writeFile('reviews/theme-browser-results.json',JSON.stringify({checkedAt:new Date().toISOString(),checks},null,2)+'\n');
}finally{await page.close();await isolated.close()}
