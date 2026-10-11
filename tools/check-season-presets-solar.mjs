import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {openPage} from './browser-session.mjs';
import {startIsolatedDev} from './isolated-dev.mjs';
const isolated=await startIsolatedDev(5199),page=await openPage(isolated.url),checks=[];
const run=fn=>page.evaluate(`(${fn.toString()})()`);
const check=async(name,fn)=>{await fn();checks.push({name,passed:true});console.log(`PASS ${name}`)};
const settle=()=>page.waitFor('!qv.simulation.isBusy && qv.simulation.status.output',30000);
try{
 await page.waitFor('!!document.querySelector(".scene")');
 await run(async()=>{const text=await fetch('/src/main.ts').then(r=>r.text());globalThis.qa=await import(text.match(/from "([^"]*\/state\.ts[^"]*)"/)[1]);globalThis.qv=await import(text.match(/from "([^"]*\/runtime\/view\.ts[^"]*)"/)[1]);globalThis.qc=await import('/src/runtime/config.ts');qa.store.update(s=>s.ui.paused=true)});await settle();
 await check('summer and winter action presets apply exact conditions without resetting edited house or service history',async()=>{
  await run(()=>{qa.store.setRoomWindowSolarGain('ground',500);qa.store.setRoomInsulation('ground',.5);qa.store.update(s=>s.cfg.outdoorRh=48)});await settle();await run(()=>qv.simulation.step(5));await settle();
  const before=await run(()=>({clock:qv.simulation.status.output.simulatedSeconds,energy:qv.simulation.status.output.energy,rooms:qv.simulation.status.output.rooms.map(r=>r.temperatureC),cfg:structuredClone(qa.store.state.cfg),epoch:qa.store.resetEpoch}));
  const summer=await run(()=>{const p=document.querySelector('select[aria-label="Quick preset"]');p.value='summer';p.dispatchEvent(new Event('change',{bubbles:true}));return {mode:qa.store.state.cfg.mode,out:qa.store.state.cfg.outdoorC,targets:qa.store.state.cfg.rooms.slice(0,3).map(r=>r.setpointC),on:qa.store.state.cfg.rooms.slice(0,3).map(r=>r.enabled),select:p.value}});await settle();
  assert.deepEqual(summer,{mode:'cooling',out:39,targets:[24,24,24],on:[true,true,true],select:''});
  const after=await run(()=>({clock:qv.simulation.status.output.simulatedSeconds,energy:qv.simulation.status.output.energy,rooms:qv.simulation.status.output.rooms.map(r=>r.temperatureC),rh:qa.store.state.cfg.outdoorRh,ground:qa.store.state.cfg.rooms[2],kind:qa.store.state.cfg.outdoorKind,links:qa.store.state.cfg.interzoneLinks,epoch:qa.store.resetEpoch}));
  assert.equal(after.clock,before.clock);for(const key of Object.keys(before.energy)){const tolerance=key.endsWith('Kg')?1e-9:1e-5;if(['electricityJ','usefulServiceHeatJ','signedRoomHeatJ','drainedWaterKg'].includes(key))assert.equal(after.energy[key],before.energy[key],key);else assert.ok(Math.abs(after.energy[key]-before.energy[key])<=tolerance,key)}assert.equal(after.rooms.length,before.rooms.length);for(let i=0;i<after.rooms.length;i++)assert.ok(Math.abs(after.rooms[i]-before.rooms[i])<1e-9);assert.equal(after.rh,48);assert.equal(after.ground.windowSolarGainW,500);assert.equal(after.ground.envelopeQualityWPerM3K,.5);assert.equal(after.kind,before.cfg.outdoorKind);assert.deepEqual(after.links,before.cfg.interzoneLinks);assert.equal(after.epoch,before.epoch);
  await run(()=>{const p=document.querySelector('select[aria-label="Quick preset"]');p.value='winter';p.dispatchEvent(new Event('change',{bubbles:true}))});await settle();
  assert.deepEqual(await run(()=>({mode:qa.store.state.cfg.mode,out:qa.store.state.cfg.outdoorC,targets:qa.store.state.cfg.rooms.slice(0,3).map(r=>r.setpointC),on:qa.store.state.cfg.rooms.slice(0,3).map(r=>r.enabled),clock:qv.simulation.status.output.simulatedSeconds,sun:qa.store.state.cfg.rooms[2].windowSolarGainW})),{mode:'heating',out:1,targets:[21,21.5,17],on:[false,true,true],clock:before.clock,sun:500});
 });
 await check('room solar control stays focused, maps separately from appliances, and supplies only prescribed sensible gain',async()=>{
  await run(()=>document.querySelectorAll('.room-env button').forEach(b=>{if(b.textContent==='Thermal'&&b.closest('[data-block="environment"]').querySelector('.rp-name').textContent.includes('Ground'))b.click()}));
  const result=await run(()=>{const e=document.querySelector('[data-pop="thermal"] input[type="range"][aria-label="Sun from windows [W]"]');globalThis.solarInput=e;e.focus();e.value='750';e.dispatchEvent(new Event('input',{bubbles:true}));const r=qa.store.state.cfg.rooms[2];return {focus:document.activeElement===e,same:document.querySelector('[data-pop="thermal"] input[type="range"][aria-label="Sun from windows [W]"]')===e,solar:r.windowSolarGainW,background:r.internalGainW,mapped:qc.engineConfigFromUi(qa.store.state.cfg,qa.store.state.cfg.live).rooms[2].internalGainW}});await settle();
  assert.deepEqual(result,{focus:true,same:true,solar:750,background:200,mapped:950});await run(()=>qv.simulation.step(.25));await settle();
  assert.equal(await run(()=>document.activeElement===solarInput),true);assert.equal(await run(()=>qv.simulation.status.output.rooms[2].internalGainW),950);
  assert.ok(Math.abs(await run(()=>qv.simulation.status.output.energy.residualJ))<=1e-5);
 });
 await check('default solar is zero, negative/nonfinite values cannot mutate valid configuration, and later calibration is unclaimed',async()=>{
  const result=await run(()=>{const before=JSON.stringify(qa.store.state.cfg),errors=[];for(const v of [-1,Infinity,NaN]){try{qa.store.setRoomWindowSolarGain('ground',v)}catch(e){errors.push(e.name)}}return {unchanged:JSON.stringify(qa.store.state.cfg)===before,errors,defaults:qa.defaultConfig().rooms.slice(0,3).map(r=>r.windowSolarGainW??0),text:document.querySelector('[data-pop="thermal"]').textContent}});
  assert.equal(result.unchanged,true);assert.deepEqual(result.errors,['RangeError','RangeError','RangeError']);assert.deepEqual(result.defaults,[0,0,0]);assert.match(result.text,/uncalibrated/);
 });
 assert.deepEqual(page.events.filter(e=>e.method==='Runtime.exceptionThrown'),[]);
 await writeFile('reviews/season-presets-solar-browser-results.json',JSON.stringify({checkedAt:new Date().toISOString(),checks,scope:'Actual native preset actions, stable room solar binding and guarded worker gain/energy mapping'},null,2)+'\n');
}finally{await page.close();await isolated.close()}
