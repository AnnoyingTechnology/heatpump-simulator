import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {openPage} from './browser-session.mjs';
import {startIsolatedDev} from './isolated-dev.mjs';
const isolated=await startIsolatedDev(5203),page=await openPage(isolated.url),checks=[];
const run=fn=>page.evaluate(`(${fn.toString()})()`);
const check=async(name,fn)=>{await fn();checks.push({name,passed:true});console.log(`PASS ${name}`)};
const settle=()=>page.waitFor('!qv.simulation.isBusy && qv.simulation.status.output',30000);
try{
 await page.waitFor('!!document.querySelector(".scene")');
 await run(async()=>{const m=await fetch('/src/main.ts').then(r=>r.text());globalThis.qa=await import(m.match(/from "([^"]*\/state\.ts[^"]*)"/)[1]);globalThis.qv=await import(m.match(/from "([^"]*\/runtime\/view\.ts[^"]*)"/)[1]);globalThis.qc=await import('/src/runtime/config.ts');qa.store.update(s=>s.ui.paused=true)});await settle();
 await check('requested speed precedes Pause; actual speed sits with status and the enlarged clock',async()=>{
  const a=await run(()=>{const speed=document.querySelector('[aria-label="Requested speed"]'),pause=document.querySelector('.hd-pause'),rate=document.querySelector('.hd-speed-rate'),clock=document.querySelector('.time');return {before:!!(speed.compareDocumentPosition(pause)&Node.DOCUMENT_POSITION_FOLLOWING),count:document.querySelectorAll('.hd-speed-rate').length,withStatus:!!rate.closest('.hd-badges'),withClock:rate.closest('.hd-run')===clock.closest('.hd-run'),clockFont:parseFloat(getComputedStyle(clock).fontSize)}});
  assert.deepEqual(a,{before:true,count:1,withStatus:true,withClock:true,clockFont:19});
 });
 await check('five readings and taller plots fit the single header at four desktop widths',async()=>{
  for(const [width,height]of [[1280,720],[1440,900],[1600,1000],[1920,1080]]){
   await page.send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:false});
   const a=await run(()=>{const h=document.querySelector('.topbar').getBoundingClientRect();return {cards:document.querySelectorAll('.hm').length,plots:[...document.querySelectorAll('.hm-trend')].map(e=>{const r=e.getBoundingClientRect();return {height:r.height,top:r.top,bottom:r.bottom}}),overflow:[...document.querySelectorAll('.topbar button,.topbar select,.time,.hd-speed-rate,.hm')].filter(e=>e.getClientRects().length).filter(e=>{const r=e.getBoundingClientRect();return r.left<h.left-.5||r.right>h.right+.5||r.top<h.top-.5||r.bottom>h.bottom+.5}).map(e=>e.className),height:h.height}});
   assert.equal(a.cards,5);assert.deepEqual(a.overflow,[],JSON.stringify({width,a}));assert.ok(a.plots.every(p=>p.height>=58&&p.top>=0&&p.bottom<=a.height));
  }
 });
 await check('electricity since start equals the accepted engine ledger, survives edits and clears on Reset',async()=>{
  await run(()=>qv.simulation.step(5));await settle();
  const before=await run(()=>({value:Number(document.querySelector('.hm-energy').dataset.exactKwh),expected:qv.simulation.status.output.energy.electricityJ/3600000,time:qv.simulation.status.output.simulatedSeconds,path:document.querySelector('.energy-line').getAttribute('d')}));
  assert.ok(before.value>0);assert.equal(before.value,before.expected);assert.ok(before.path.includes('M'));
  await run(()=>{qa.store.update(s=>s.cfg.outdoorRh=48);qa.store.applyOwnerSeason('summer')});await settle();
  const after=await run(()=>({value:Number(document.querySelector('.hm-energy').dataset.exactKwh),time:qv.simulation.status.output.simulatedSeconds,path:document.querySelector('.energy-line').getAttribute('d')}));
  assert.deepEqual(after,{value:before.value,time:before.time,path:before.path});
  await run(()=>qa.store.restartSimulation());await settle();
  assert.equal(await run(()=>Number(document.querySelector('.hm-energy').dataset.exactKwh)),0);
  const resetPlot=await run(()=>document.querySelector('.energy-line').getAttribute('d'));
  assert.ok(resetPlot==='' || /^M([\d.]+ [\d.]+)L\1$/.test(resetPlot),'Reset clears previous samples; only its accepted zero point may remain');
  await run(()=>qa.store.setExperience('examples'));
  assert.equal(await run(()=>document.querySelector('.hm-energy .v').textContent),'—');
  assert.equal(await run(()=>document.querySelector('.energy-line').getAttribute('d')),'');
 });
 await check('cleanliness stays permanently shared at95%; compressor efficiency is only in Outdoor Settings',async()=>{
  await run(()=>{qa.store.reset();qa.store.update(s=>s.ui.paused=true)});await settle();
  const a=await run(()=>{const cfg=qa.store.state.cfg,c=qc.engineConfigFromUi(cfg,cfg.live);return {clean:[c.outdoor.cleanFraction,...c.rooms.map(r=>r.cleanFraction)],recovery:c.rooms.map(r=>r.ventilationRecoveryEfficiency),overrides:document.querySelectorAll('.clean-override').length,mainEta:document.querySelectorAll('.ou [aria-label^="Compressor efficiency"]').length}});
  assert.deepEqual(a,{clean:[.95,.95,.95,.95],recovery:[.75,.75,.75],overrides:0,mainEta:0});
  await run(()=>document.querySelector('button[aria-label="Outdoor unit settings"]').click());
  assert.equal(await run(()=>document.querySelectorAll('[aria-label^="Compressor efficiency"][type="range"]').length),1);
 });
 assert.deepEqual(page.events.filter(e=>e.method==='Runtime.exceptionThrown'),[]);
 await writeFile('reviews/header-energy-browser-results.json',JSON.stringify({checkedAt:new Date().toISOString(),checks,desktopWidths:[1280,1440,1600,1920],energySource:'accepted engine electricityJ / 3600000'},null,2)+'\n');
}finally{await page.close();await isolated.close()}
