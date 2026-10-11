import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { openPage } from './browser-session.mjs';
import { startIsolatedDev } from './isolated-dev.mjs';
const dev=await startIsolatedDev(5215),page=await openPage(dev.url),checks=[];
const run=fn=>page.evaluate(`(${fn.toString()})()`);
const check=async(name,fn)=>{await fn();checks.push({name,passed:true});console.log('PASS '+name)};
const settle=()=>page.waitFor('!qv.simulation.isBusy && qv.simulation.status.output && qv.simulation.status.state!=="loading"',60000);
const choose=async(fluid)=>{await page.evaluate(`(()=>{const e=document.querySelector('.ou-fluid-select');e.value=${JSON.stringify(fluid)};e.dispatchEvent(new Event('change',{bubbles:true}))})()`);await settle()};
try{
 await page.waitFor('!!document.querySelector(".ou-fluid-select")');
 await run(async()=>{const m=await fetch('/src/main.ts').then(r=>r.text());globalThis.qa=await import(m.match(/from "([^"]*\/state\.ts[^"]*)"/)[1]);globalThis.qv=await import(m.match(/from "([^"]*\/runtime\/view\.ts[^"]*)"/)[1]);globalThis.qi=await import('/src/i18n.ts');qi.setLanguage('en');qa.store.update(s=>{s.ui.paused=true;s.cfg.outdoorC=2;s.cfg.rooms[1].setpointC=22})});await settle();
 await run(()=>qv.simulation.step(10));await settle();
 await check('factory R32 remains fixed and choosing generic equipment retains the current house and accepted history',async()=>{
  assert.equal(await run(()=>document.querySelector('.ou-fluid-select').disabled),true);
  const before=await run(()=>({rooms:JSON.stringify(qa.store.state.cfg.rooms),epoch:qa.store.resetEpoch,time:qv.simulation.status.output.simulatedSeconds}));
  await run(()=>{const e=document.querySelector('.ou-model-select');e.value='generic';e.dispatchEvent(new Event('change',{bubbles:true}))});await settle();
  assert.equal(await run(()=>document.querySelector('.ou-fluid-select').disabled),false);
  assert.deepEqual(await run(()=>({rooms:JSON.stringify(qa.store.state.cfg.rooms),epoch:qa.store.resetEpoch,time:qv.simulation.status.output.simulatedSeconds})),before);
 });
 await check('each qualified fluid starts a fresh real worker and room history without replacing house inputs',async()=>{
  const rooms=await run(()=>JSON.stringify(qa.store.state.cfg.rooms));
  for(const fluid of ['R22','R290','R134a','R1234yf','R410A','R407C','R32']){
   const epoch=await run(()=>qa.store.resetEpoch);await choose(fluid);
   assert.equal(await run(()=>qa.store.resetEpoch),epoch+1);
   assert.equal(await run(()=>qv.simulation.status.output.simulatedSeconds),0);
   assert.equal(await run(()=>JSON.stringify(qa.store.state.cfg.rooms)),rooms);
   assert.equal(await run(()=>qa.store.state.cfg.outdoorC),2);
   assert.equal(await run(()=>qa.store.state.cfg.live.refrigerant),fluid);
   assert.ok(await run(()=>[...document.querySelectorAll('.room-chart')].every(e=>Number(e.dataset.seconds)===0)));
   await run(()=>qv.simulation.step(2));await settle();
   const a=await run(()=>{const o=qv.simulation.status.output;return {time:o.simulatedSeconds,fault:o.diagnostics.fault,error:qv.simulation.status.error,rps:o.diagnostics.actualSpeedRps,work:o.cycle?.compressorWorkW,residual:o.energy.residualJ}});
   assert.equal(a.time,2);assert.equal(a.fault,null);assert.equal(a.error,null);assert.ok(a.work>0);assert.ok(Math.abs(a.residual)<.001);
   if(fluid==='R407C') assert.ok(await run(()=>{const c=qv.simulation.status.output.cycle;return [c.suction,c.discharge,c.condenserOutlet,c.expansionOutlet,...c.branchInlets,...c.branchOutlets].every(s=>s.qualityMass===null)}));
  }
 });
 await check('unqualified physical-line combinations cannot be selected or silently substituted',async()=>{
  assert.equal(await run(()=>document.querySelector('.ou-fluid-select option[value="R407C"]').disabled),false);
  await choose('R290');
  assert.equal(await run(()=>document.querySelector('[data-block="line-model"] button:last-child').disabled),true);
  await choose('R32');
  await run(()=>document.querySelector('[data-block="line-model"] button:last-child').click());await settle();
  assert.equal(await run(()=>qa.store.state.cfg.live.fieldLines),'physical');
  assert.ok(await run(()=>[...document.querySelectorAll('.ou-fluid-select option')].every(e=>e.value==='R32'||e.disabled)));
  await choose('R22');assert.equal(await run(()=>qa.store.state.cfg.live.refrigerant),'R32');
  await run(()=>document.querySelector('[data-block="line-model"] button:first-child').click());await settle();
 });
 await check('fixed Examples stay R32 while preserving the selected Live fluid and accepted session',async()=>{
  await choose('R290');await run(()=>qv.simulation.step(2));await settle();
  const before=await run(()=>({epoch:qa.store.resetEpoch,cfg:JSON.stringify(qa.store.state.cfg),out:JSON.stringify(qv.simulation.status.output)}));
  await run(()=>{document.querySelector('button[aria-label="Outdoor unit settings"]').click();globalThis.sourceSelect=document.getElementById([...document.querySelectorAll('label')].find(e=>e.textContent==='Simulation source').htmlFor);sourceSelect.value='examples';sourceSelect.dispatchEvent(new Event('change',{bubbles:true}))});
  assert.equal(await run(()=>document.querySelector('.ou-fluid-select').value),'R32');
  assert.equal(await run(()=>document.querySelector('.ou-fluid-select').disabled),true);
  assert.ok(await run(()=>[...document.querySelectorAll('.room-chart')].every(e=>e.hidden)));
  await run(()=>{sourceSelect.value='live';sourceSelect.dispatchEvent(new Event('change',{bubbles:true}));document.querySelector('[data-pop=outdoor] .pop-close').click()});await settle();
  assert.equal(await run(()=>document.querySelector('.ou-fluid-select').value),'R290');
  assert.deepEqual(await run(()=>({epoch:qa.store.resetEpoch,cfg:JSON.stringify(qa.store.state.cfg),out:JSON.stringify(qv.simulation.status.output)})),before);
 });
 await check('French fluid controls fit the outdoor card in both themes and factory selection restores R32 explicitly',async()=>{
  await choose('R290');await run(()=>qi.setLanguage('fr'));
  assert.equal(await run(()=>document.querySelector('.ou-fluid-select').getAttribute('aria-label')),'Frigorigène');
  for(const [width,height]of [[1280,720],[1600,1000],[1920,1080]]){
   await page.send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:false});
   for(const theme of ['light','dark']){
    await page.evaluate(`(()=>{const e=document.querySelector('.th-select');e.value=${JSON.stringify(theme)};e.dispatchEvent(new Event('change',{bubbles:true}))})()`);
    assert.ok(await run(()=>{const e=document.querySelector('.ou');return e.scrollHeight<=e.clientHeight+1}));
    assert.ok(await run(()=>{const e=document.querySelector('.scene-scroll');return e.scrollHeight<=e.clientHeight+1}));
   }
  }
  const epoch=await run(()=>qa.store.resetEpoch);
  await run(()=>{const e=document.querySelector('.ou-model-select');e.value='owner';e.dispatchEvent(new Event('change',{bubbles:true}))});await settle();
  assert.equal(await run(()=>qa.store.state.cfg.live.refrigerant),'R32');assert.equal(await run(()=>qa.store.resetEpoch),epoch+1);
  assert.equal(await run(()=>document.querySelector('.ou-fluid-select').disabled),true);
  await run(()=>qi.setLanguage('en'));
 });
 assert.deepEqual(page.events.filter(e=>e.method==='Runtime.exceptionThrown'),[]);
 await writeFile('reviews/refrigerant-selection-browser-results.json',JSON.stringify({checkedAt:new Date().toISOString(),checks,fluids:['R32','R22','R290','R134a','R1234yf','R410A','R407C'],chargeRelease:false},null,2)+'\n');
}finally{await page.close();await dev.close()}
