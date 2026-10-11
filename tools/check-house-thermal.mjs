import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {openPage} from './browser-session.mjs';
import {startIsolatedDev} from './isolated-dev.mjs';
const isolated=await startIsolatedDev(5191),page=await openPage(isolated.url),checks=[];
const run=fn=>page.evaluate(`(${fn.toString()})()`);
const check=async(name,fn)=>{await fn();checks.push({name,passed:true});console.log(`PASS ${name}`)};
const settle=()=>page.waitFor('!qv.simulation.isBusy && qv.simulation.status.output',30000);
try{
 await page.waitFor('!!document.querySelector(".scene")');
 await run(async()=>{const m=await fetch('/src/main.ts').then(r=>r.text());globalThis.qa=await import(m.match(/from "([^"]*\/state\.ts[^"]*)"/)[1]);globalThis.qv=await import(m.match(/from "([^"]*\/runtime\/view\.ts[^"]*)"/)[1]);globalThis.qc=await import(m.match(/from "([^"]*\/runtime\/config\.ts[^"]*)"/)[1]);qa.store.update(s=>s.ui.paused=true)});await settle();
 await check('winter preset preserves actual floor volumes, targets, Off attic and provisional thermal parameters',async()=>{
  const c=await run(()=>qc.engineConfigFromUi(qa.store.state.cfg,qa.store.state.cfg.live));
  assert.equal(c.outdoorTemperatureC,1);assert.equal(c.outdoorRelativeHumidity,.35);
  assert.deepEqual(c.rooms.map(r=>[r.id,r.enabled,r.setpointC,r.envelopeWK,r.internalGainW,r.ventilationACH]),[['attic',false,21,15,0,.25],['first',true,21.5,25,0,.25],['ground',true,17,45,200,.25]]);
  for(const [i,v] of [84,155,100].entries())assert.ok(Math.abs(c.rooms[i].volumeM3-v)<1e-10);
  assert.deepEqual(c.interzoneLinks,[{roomA:'ground',roomB:'first',conductanceWK:200},{roomA:'first',roomB:'attic',conductanceWK:120}]);
 });
 await check('room thermal controls preserve focus, clock, accepted state and symmetric connection widgets',async()=>{
  await run(()=>document.querySelector('button[aria-label="Thermal settings of Ground (L0)"]').click());
  const edit=await run(()=>{const pop=document.querySelector('[data-pop="thermal"]'),gain=pop.querySelector('input[type="number"][aria-label^="Background sensible gains"]'),link=pop.querySelector('input[type="range"][aria-label*="Upstairs (L1)"]'),before=JSON.stringify(qv.simulation.status.output);gain.focus();gain.value='150';gain.dispatchEvent(new Event('input',{bubbles:true}));return {gain:qa.store.state.cfg.rooms[2].internalGainW,focused:document.activeElement===gain,sameLink:link===pop.querySelector('input[type="range"][aria-label*="Upstairs (L1)"]'),sameOutput:before===JSON.stringify(qv.simulation.status.output)}});
  assert.deepEqual(edit,{gain:150,focused:true,sameLink:true,sameOutput:true});await settle();
  const edited=await run(()=>{const link=document.querySelector('[data-pop="thermal"] input[type="range"][aria-label*="Upstairs (L1)"]');link.focus();link.value='180';link.dispatchEvent(new Event('input',{bubbles:true}));return {focused:document.activeElement===link,same:link===document.querySelector('[data-pop="thermal"] input[type="range"][aria-label*="Upstairs (L1)"]'),value:qa.store.state.cfg.interzoneLinks.find(l=>l.roomA==='ground').conductanceWK}});
  assert.deepEqual(edited,{focused:true,same:true,value:180});await settle();
  await run(()=>document.querySelector('button[aria-label="Thermal settings of Upstairs (L1)"]').click());
  assert.equal(await run(()=>document.querySelector('[data-pop="thermal"] input[type="number"][aria-label*="Ground (L0)"]').value),'180');
  const clock=await run(()=>qv.simulation.status.output.simulatedSeconds);await run(()=>qv.simulation.step(.25));await settle();
  const out=await run(()=>qv.simulation.status.output);assert.equal(out.simulatedSeconds,clock+.25);assert.equal(out.rooms[2].internalGainW,150);assert.ok(out.rooms[0].interzoneHeatW>0);assert.equal(out.rooms[0].active,false);
  assert.ok(Math.abs(out.rooms.reduce((s,r)=>s+r.interzoneHeatW,0))<1e-8);assert.ok(Math.abs(out.energy.residualJ)<.01);
 });
 await check('link geometry, indoor Off and room removal use stable identities and valid engine endpoints',async()=>{
  await run(()=>{qa.store.setInterzoneLink('ground','first',{kind:'partition',orientation:'horizontal',areaM2:10,transferWm2K:1.5});qa.store.update(s=>s.cfg.rooms[2].enabled=false)});await settle();
  const links=await run(()=>qc.engineConfigFromUi(qa.store.state.cfg,qa.store.state.cfg.live).interzoneLinks);assert.equal(links.find(l=>l.roomA==='ground').conductanceWK,15);
  await run(()=>qa.store.removeRoom(0));await settle();
  const c=await run(()=>qc.engineConfigFromUi(qa.store.state.cfg,qa.store.state.cfg.live));assert.deepEqual(c.rooms.map(r=>r.id),['first','ground']);assert.deepEqual(c.interzoneLinks,[{roomA:'ground',roomB:'first',conductanceWK:15}]);
  assert.equal(await run(()=>document.querySelector('[data-pop="thermal"]').hidden),true);
  await run(()=>qa.store.addRoom());await settle();assert.equal(await run(()=>qc.engineConfigFromUi(qa.store.state.cfg,qa.store.state.cfg.live).interzoneLinks.length),2);
 });
 assert.deepEqual(page.events.filter(e=>e.method==='Runtime.exceptionThrown'),[]);
 await writeFile('reviews/house-thermal-browser-results.json',JSON.stringify({checkedAt:new Date().toISOString(),checks,scope:'Provisional winter defaults, room parameter edits and conservative runtime links'},null,2)+'\n');
}finally{await page.close();await isolated.close()}
