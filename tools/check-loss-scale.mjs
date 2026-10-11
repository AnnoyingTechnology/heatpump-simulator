import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {openPage} from './browser-session.mjs';
import {startIsolatedDev} from './isolated-dev.mjs';
const isolated=await startIsolatedDev(5189),page=await openPage(isolated.url),checks=[];
const run=fn=>page.evaluate(`(${fn.toString()})()`);
const check=async(name,fn)=>{await fn();checks.push({name,passed:true});console.log(`PASS ${name}`)};
const settle=()=>page.waitFor('!qv.simulation.isBusy && qv.simulation.status.output',30000);
try{
 await page.waitFor('!!document.querySelector(".scene")');
 await run(async()=>{const m=await fetch('/src/main.ts').then(r=>r.text());globalThis.qa=await import(m.match(/from "([^"]*\/state\.ts[^"]*)"/)[1]);globalThis.qv=await import(m.match(/from "([^"]*\/runtime\/view\.ts[^"]*)"/)[1]);qa.store.update(s=>s.ui.paused=true)});await settle();
 await check('one whole-house RT ruler keeps eight direct midpoint labels and sums Off rooms',async()=>{
  const a=await run(()=>{const e=document.querySelector('[data-block="house-loss"]');return {count:document.querySelectorAll('.ls').length,marks:[...e.querySelectorAll('.ls-m')].map(m=>({era:m.dataset.era,value:Number(m.dataset.midpoint),left:parseFloat(m.style.left),label:m.querySelector('.ls-lab').textContent})),ticks:[...e.querySelectorAll('.ls-tick')].map(t=>t.textContent),envelope:Number(e.dataset.envelopeWk),air:Number(e.dataset.ventilationWk),total:Number(e.dataset.totalWk),needle:parseFloat(e.querySelector('.ls-needle').style.left),roomScales:document.querySelectorAll('.room-env .ls').length}});
  assert.equal(a.count,1);assert.equal(a.roomScales,0);
  assert.deepEqual(a.marks.map(m=>[m.era,m.value]),[['RE2020',115],['RT2012',145],['RT2005',250],['RT2000',290],['RT1988',350],['RT1982',415],['RT1974',500],['Pre-1974',750]]);
  for(const m of a.marks){assert.equal(m.label,m.era);assert.ok(Math.abs(m.left-m.value/750*100)<.001)}
  assert.deepEqual(a.ticks,['0','250','500','750']);assert.equal(a.envelope,85);assert.ok(Math.abs(a.air-14.4075)<1e-9);assert.ok(Math.abs(a.total-99.4075)<1e-9);assert.ok(Math.abs(a.needle-a.total/750*100)<.001);
  assert.equal(await run(()=>qa.store.state.cfg.rooms[0].enabled),false);
 });
 await check('reference labels and insulation controls fit 32 desktop/theme/topology layouts',async()=>{
  await run(()=>{qa.store.setExperience('examples');qa.store.setGenericPortCapacity(8)});
  for(const [width,height] of [[1280,720],[1440,900],[1600,1000],[1920,1080]]){
   await page.send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:false});
   for(const count of [1,3,5,8])for(const theme of ['light','dark']){
    await page.evaluate(`qa.store.setUnitCount(${count});qa.store.update(s=>s.ui.zoom='overview');(()=>{const t=document.querySelector('select[aria-label="Colour theme"]');t.value=${JSON.stringify(theme)};t.dispatchEvent(new Event('change',{bubbles:true}))})()`);
    await new Promise(r=>setTimeout(r,150));
    const failures=await run(()=>[...document.querySelectorAll('[data-block="house-loss"],.room-env')].flatMap(e=>{const fo=e.closest('foreignObject').getBoundingClientRect();return [...e.querySelectorAll('.ls-lab,.ls-n,input,button')].flatMap(li=>{const r=li.getBoundingClientRect();return r.width&&(r.left<fo.left-.6||r.right>fo.right+.6||r.top<fo.top-.6||r.bottom>fo.bottom+.6)?[{text:li.textContent||li.getAttribute('aria-label'),rect:{left:r.left,right:r.right,top:r.top,bottom:r.bottom},fo:{left:fo.left,right:fo.right,top:fo.top,bottom:fo.bottom}}]:[]})}));
    assert.deepEqual(failures,[],JSON.stringify({width,height,count,theme,failures}));
    const overlaps=await run(()=>{const labels=[...document.querySelectorAll('.ls-lab')].map(e=>({text:e.textContent,r:e.getBoundingClientRect()})),bad=[];for(let i=0;i<labels.length;i++)for(let j=i+1;j<labels.length;j++){const a=labels[i],b=labels[j];if(Math.min(a.r.right,b.r.right)-Math.max(a.r.left,b.r.left)>.5&&Math.min(a.r.bottom,b.r.bottom)-Math.max(a.r.top,b.r.top)>.5)bad.push([a.text,b.text])}return bad});
    assert.deepEqual(overlaps,[],JSON.stringify({width,height,count,theme,overlaps}));
    if(count<=3)assert.ok(await run(()=>{const e=document.querySelector('.scene-scroll');return e.scrollHeight<=e.clientHeight+1}),'default overview has no unnecessary scrolling');
   }
  }
 });
 await check('insulation retains focus; size edits derive H while conserving time and service history',async()=>{
  await run(()=>{qa.store.reset();qa.store.setExperience('live');qa.store.update(s=>{s.ui.paused=true;s.ui.zoom=`room:${s.cfg.rooms[0].id}`})});await settle();
  const a=await run(()=>{const input=document.querySelector('.room-env input[aria-label^="Average U"][type="range"]'),ruler=document.querySelector('.ls'),before=JSON.stringify(qv.simulation.status.output),zoom=qa.store.state.ui.zoom;input.focus();input.value='.8';input.dispatchEvent(new Event('input',{bubbles:true}));return {focused:document.activeElement===input,same:document.querySelector('.ls')===ruler,zoom:qa.store.state.ui.zoom===zoom,physical:JSON.stringify(qv.simulation.status.output)===before,u:qa.store.state.cfg.rooms[0].averageUValueWm2K,h:qa.store.state.cfg.rooms[0].heatLossWPerK,area:qa.store.state.cfg.rooms[0].heatLossWPerK/.8}});
  assert.equal(a.focused,true);assert.equal(a.same,true);assert.equal(a.zoom,true);assert.equal(a.physical,true);assert.equal(a.u,.8);assert.ok(a.area>0);assert.ok(Math.abs(a.h-.8*a.area)<1e-9);await settle();
  const before=await run(()=>({time:qv.simulation.status.output.simulatedSeconds,service:[qv.simulation.status.output.energy.electricityJ,qv.simulation.status.output.energy.usefulServiceHeatJ,qv.simulation.status.output.energy.drainedWaterKg]}));
  await run(()=>qa.store.update(s=>s.cfg.rooms[0].surfaceM2=52));await settle();
  const b=await run(()=>{const r=qa.store.state.cfg.rooms[0],e=qv.simulation.status.output.energy;return {u:r.averageUValueWm2K,h:r.heatLossWPerK,volume:r.surfaceM2*r.ceilingHeightM,envelope:Number(document.querySelector('[data-block="house-loss"]').dataset.envelopeWk),time:qv.simulation.status.output.simulatedSeconds,service:[e.electricityJ,e.usefulServiceHeatJ,e.drainedWaterKg]}});
  assert.equal(b.u,.8);assert.equal(b.volume,168);assert.ok(b.h>a.h);assert.ok(Math.abs(b.envelope-b.h-70)<1e-9);assert.equal(b.time,before.time);assert.deepEqual(b.service,before.service);
 });
 await check('advanced H retains values beyond the reference scale and marks overflow without physics clamping',async()=>{
  const a=await run(()=>{const ruler=document.querySelector('.ls'),before=JSON.stringify(qv.simulation.status.output);qa.store.setRoomEnvelopeConductance('attic',1000);const e=document.querySelector('[data-block="house-loss"]');return {h:qa.store.state.cfg.rooms[0].heatLossWPerK,total:Number(e.dataset.totalWk),off:e.dataset.offScale,needle:parseFloat(e.querySelector('.ls-needle').style.left),overflow:e.querySelector('.ls-over').hidden,same:document.querySelector('.ls')===ruler,physical:JSON.stringify(qv.simulation.status.output)===before}});
  assert.equal(a.h,1000);assert.ok(a.total>1000);assert.equal(a.off,'1');assert.equal(a.needle,100);assert.equal(a.overflow,false);assert.equal(a.same,true);assert.equal(a.physical,true);
 });
 assert.deepEqual(page.events.filter(e=>e.method==='Runtime.exceptionThrown'),[]);
 await writeFile('reviews/loss-scale-browser-results.json',JSON.stringify({checkedAt:new Date().toISOString(),checks,layoutCombinations:32,representation:'one calculated whole-house RT ruler; per-room average U and automatic exposed area',referenceDomainWK:[0,750]},null,2)+'\n');
}finally{await page.close();await isolated.close()}
