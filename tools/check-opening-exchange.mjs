// Actual worker and local room-link editor: preserve geometry, accepted time and stores.
import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {openPage} from './browser-session.mjs';
import {startIsolatedDev} from './isolated-dev.mjs';
const isolated=await startIsolatedDev(5206),page=await openPage(isolated.url),checks=[];
const run=fn=>page.evaluate(`(${fn.toString()})()`);
const settle=()=>page.waitFor('!qv.simulation.isBusy && qv.simulation.status.output',60000);
const check=async(name,fn)=>{await fn();checks.push({name,passed:true});console.log('PASS',name)};
const tick=async()=>{assert.equal(await run(()=>qv.simulation.step(.25)),true);await settle();assert.equal(await run(()=>qv.simulation.status.output.diagnostics.fault),null)};
try{
 await page.waitFor('!!document.querySelector(".scene")');
 await run(async()=>{const text=await fetch('/src/main.ts').then(r=>r.text());globalThis.qa=await import(text.match(/from "([^"]*\/state\.ts[^"]*)"/)[1]);globalThis.qv=await import(text.match(/from "([^"]*\/runtime\/view\.ts[^"]*)"/)[1]);globalThis.qc=await import(text.match(/from "([^"]*\/runtime\/config\.ts[^"]*)"/)[1]);qa.store.reset();qa.store.update(s=>{s.ui.paused=true;s.cfg.outdoorC=0;for(const r of s.cfg.rooms){r.enabled=false;r.airC=r.id==='ground'?16:r.id==='first'?21.5:18.5}});qa.store.restartSimulation()});await settle();await tick();
 const initial=await run(()=>({out:qv.simulation.status.output,epoch:qa.store.resetEpoch}));
 await check('owner floor opening strongly favours L1→L2, while L1→L0 retains solid conduction',async()=>{
  const [lower,upper]=initial.out.interzoneTransfers;
  assert.equal(lower.buoyancyState,'stable');assert.equal(lower.buoyancyHeatFromAToBW,0);assert.equal(lower.backgroundHeatFromAToBW,0);assert.ok(lower.heatFromAToBW<0);
  assert.equal(upper.buoyancyState,'unstable');assert.ok(upper.buoyancyHeatFromAToBW>0);
  assert.ok(upper.heatFromAToBW>Math.abs(lower.heatFromAToBW)*3);
  assert.ok(Math.abs(initial.out.rooms.reduce((s,r)=>s+r.interzoneHeatW,0))<1e-8);
  assert.ok(Math.abs(initial.out.energy.residualJ)<1e-5);
 });
 await check('boundary chip and local editor show accepted dynamic conductance and stability',async()=>{
  await run(()=>document.querySelector('.room-link[data-link="first|ground"]').dispatchEvent(new MouseEvent('click',{bubbles:true})));
  const result=await run(()=>{const chip=document.querySelector('.room-link[data-link="first|ground"]'),pop=document.querySelector('[data-pop="link"]');return {state:chip.dataset.buoyancyState,h:Number(chip.dataset.conductance),pop:pop&&!pop.hidden,text:pop?.textContent}});
  assert.equal(result.state,'stable');assert.ok(Math.abs(result.h-45/3.26)<1e-8);assert.equal(result.pop,true);assert.match(result.text,/Stable: warm air above/);assert.match(result.text,/Solid contact area/);
 });
 await check('wall orientation exposes assumed opening height and conserves accepted time/stores',async()=>{
  const before=await run(()=>JSON.stringify(qv.simulation.status.output));
  await run(()=>{const p=document.querySelector('[data-pop="link"]');[...p.querySelectorAll('button')].find(b=>b.textContent==='Horizontal').click()});await settle();
  assert.equal(await run(()=>JSON.stringify(qv.simulation.status.output)),before);
  const actual=await run(()=>{const p=document.querySelector('[data-pop="link"]');const input=[...p.querySelectorAll('input[type="number"]')].find(x=>x.getAttribute('aria-label')?.startsWith('Opening height'));return {height:qa.store.state.cfg.interzoneLinks[0].openingHeightM,c:qc.engineConfigFromUi(qa.store.state.cfg,qa.store.state.cfg.live).interzoneLinks[0]}});
  assert.equal(actual.height,2);assert.equal(actual.c.openingExchange.heightM,2);assert.equal(actual.c.openingExchange.orientation,'horizontal');
  // Check computed visibility without relying on layout class names.
  assert.equal(await run(()=>{const input=[...document.querySelector('[data-pop="link"]').querySelectorAll('input[type="number"]')].find(x=>x.getAttribute('aria-label')?.startsWith('Opening height'));return !!input&&input.getBoundingClientRect().height>0}),true);
  await tick();const out=await run(()=>qv.simulation.status.output);assert.equal(out.interzoneTransfers[0].buoyancyState,'wall-exchange');assert.ok(out.interzoneTransfers[0].equivalentExchangeM3s>0);assert.equal(out.simulatedSeconds,initial.out.simulatedSeconds+.25);
 });
 await check('closed aperture disables background mixing; reopening retains explicit background input',async()=>{
  await run(()=>qa.store.setInterzoneLink('ground','first',{orientation:'vertical',backgroundConductanceWK:20,openingAreaM2:0}));await settle();await tick();
  let out=await run(()=>qv.simulation.status.output.interzoneTransfers[0]);assert.equal(out.equivalentExchangeM3s,0);assert.equal(out.backgroundHeatFromAToBW,0);assert.equal(out.buoyancyHeatFromAToBW,0);
  await run(()=>qa.store.setInterzoneLink('ground','first',{openingAreaM2:4}));await settle();await tick();out=await run(()=>qv.simulation.status.output.interzoneTransfers[0]);assert.ok(out.backgroundHeatFromAToBW<0);assert.equal(out.buoyancyHeatFromAToBW,0);
 });
 await check('lower-room identity survives room reorder; explicit H override remains legacy and geometry clears it',async()=>{
  const beforeEnvelope=await run(()=>Object.fromEntries(qc.engineConfigFromUi(qa.store.state.cfg,qa.store.state.cfg.live).rooms.map(r=>[r.id,r.envelopeWK])));
  await run(()=>qa.store.update(s=>{const [r]=s.cfg.rooms.splice(2,1);s.cfg.rooms.unshift(r);const [p]=s.cfg.pipes.splice(2,1);s.cfg.pipes.unshift(p)}));await settle();assert.equal(await run(()=>qc.engineConfigFromUi(qa.store.state.cfg,qa.store.state.cfg.live).interzoneLinks[0].openingExchange.lowerRoomId),'ground');assert.deepEqual(await run(()=>Object.fromEntries(qc.engineConfigFromUi(qa.store.state.cfg,qa.store.state.cfg.live).rooms.map(r=>[r.id,r.envelopeWK]))),beforeEnvelope);await tick();assert.equal(await run(()=>qv.simulation.status.output.interzoneTransfers[0].buoyancyState),'stable');
  await run(()=>qa.store.setInterzoneConductance('ground','first',90));await settle();assert.equal(await run(()=>qc.engineConfigFromUi(qa.store.state.cfg,qa.store.state.cfg.live).interzoneLinks[0].openingExchange),undefined);await tick();
  await run(()=>qa.store.setInterzoneLink('ground','first',{insulationMm:125}));await settle();assert.equal(await run(()=>qa.store.state.cfg.interzoneLinks[0].conductanceOverrideWK),undefined);assert.ok(await run(()=>!!qc.engineConfigFromUi(qa.store.state.cfg,qa.store.state.cfg.live).interzoneLinks[0].openingExchange));
  assert.equal(await run(()=>qa.store.resetEpoch),initial.epoch);
 });
 assert.deepEqual(page.events.filter(e=>e.method==='Runtime.exceptionThrown'),[]);
 const files=['src/engine/interzone.ts','src/engine/engine.ts','src/engine/types.ts','src/types.ts','src/state.ts','src/settings.ts','src/scene.ts','src/runtime/config.ts'];
 const sourceHashes=Object.fromEntries(await Promise.all(files.map(async f=>[f,createHash('sha256').update(await readFile(`${isolated.sourceRoot}/${f}`)).digest('hex')])));
 await writeFile('reviews/opening-exchange-browser-results.json',JSON.stringify({checkedAt:new Date().toISOString(),sourceHashes,checks,initialTransfers:initial.out.interzoneTransfers,scope:'Actual guarded browser worker; declared owner geometry and equal/opposite sensible-only transfers; controls preserve accepted stores/time and lower-room identity; not a whole-house calibration'},null,2)+'\n');
 await page.screenshot('design/opening-exchange-controls.png');
}finally{await page.close();await isolated.close()}
