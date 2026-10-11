import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {openPage} from './browser-session.mjs';
import {startIsolatedDev} from './isolated-dev.mjs';
const isolated=await startIsolatedDev(5192),page=await openPage(isolated.url),checks=[];
const run=fn=>page.evaluate(`(${fn.toString()})()`);
const check=async(name,fn)=>{await fn();checks.push({name,passed:true});console.log(`PASS ${name}`)};
const settle=()=>page.waitFor('!qv.simulation.isBusy && qv.simulation.status.output',30000);
try{
 await page.waitFor('!!document.querySelector(".scene")');
 await run(async()=>{const m=await fetch('/src/main.ts').then(r=>r.text());globalThis.qa=await import(m.match(/from "([^"]*\/state\.ts[^"]*)"/)[1]);globalThis.qv=await import(m.match(/from "([^"]*\/runtime\/view\.ts[^"]*)"/)[1]);qa.store.update(s=>{s.ui.paused=true;s.ui.experience='live'})});await settle();
 await check('junction kW and arrows use accepted engine heat transfers, including the Off attic',async()=>{
  const actual=await run(()=>({transfers:qv.simulation.status.output.interzoneTransfers,links:[...document.querySelectorAll('.room-link')].map(e=>({a:e.dataset.roomA,b:e.dataset.roomB,q:Number(e.dataset.heatW),text:e.querySelector('.lk-val').textContent,arrow:e.querySelector('.lk-arrow').getAttribute('transform')}))}));
  assert.equal(actual.links.length,2);
  for(const l of actual.links){const t=actual.transfers.find(t=>t.roomA===l.a&&t.roomB===l.b);assert.equal(l.q,t.heatFromAToBW);assert.equal(l.text,`${(Math.abs(l.q)/1000).toFixed(2)} kW`)}
  assert.ok(actual.links.find(l=>l.a==='first'&&l.b==='attic').arrow.endsWith('rotate(180)'));
  assert.equal(await run(()=>qa.store.state.cfg.rooms[0].enabled),false);
 });
 await check('visual two-room placement creates one symmetric link without zooming or resetting; Escape cancels',async()=>{
  const before=await run(()=>qv.simulation.status.output.simulatedSeconds);
  await run(()=>{document.querySelector('.in-link').click();document.querySelector('[data-id="indoor:2"] .room-bg').dispatchEvent(new MouseEvent('click',{bubbles:true}))});
  assert.equal(await run(()=>document.querySelector('.scene').dataset.linking),'target');
  await run(()=>document.querySelector('[data-id="indoor:0"] .room-bg').dispatchEvent(new MouseEvent('click',{bubbles:true})));await settle();
  assert.equal(await run(()=>document.querySelector('.scene').dataset.linking),'off');
  assert.equal(await run(()=>qa.store.state.ui.zoom),'overview');
  assert.equal(await run(()=>qv.simulation.status.output.simulatedSeconds),before);
  assert.equal(await run(()=>document.querySelectorAll('.room-link').length),3);
  assert.equal(await run(()=>document.querySelector('[data-pop="link"]').hidden),false);
  await run(()=>{document.querySelector('[data-pop="link"] .pop-close').click();document.querySelector('.in-link').click();window.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}))});
  assert.equal(await run(()=>document.querySelector('.scene').dataset.linking),'off');
  assert.equal(await run(()=>qa.store.state.cfg.interzoneLinks.length),3);
 });
 await check('drawn-link editor combines opening and insulated contact; zero areas and explicit overrides stay editable',async()=>{
  await run(()=>document.querySelector('.room-link[data-room-a="ground"][data-room-b="attic"]').dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true})));
  const result=await run(()=>{const pop=document.querySelector('[data-pop="link"]');pop.querySelector('[aria-label="Connection direction"]').firstElementChild.click();const input=pop.querySelector('input[type="range"][aria-label="Opening area [m²]"]');globalThis.linkAreaInput=input;input.focus();input.value='2';input.dispatchEvent(new Event('input',{bubbles:true}));for(const [label,value] of [['Solid contact area [m²]','45'],['Glass wool [mm]','120']]){const e=pop.querySelector(`input[type="range"][aria-label="${label}"]`);e.value=value;e.dispatchEvent(new Event('input',{bubbles:true}))}return {focused:document.activeElement===input,same:input===pop.querySelector('input[type="range"][aria-label="Opening area [m²]"]'),link:qa.store.state.cfg.interzoneLinks.find(l=>l.roomA==='ground'&&l.roomB==='attic'),exclusive:pop.querySelector('[aria-label="Link type"]')!==null}});
  assert.equal(result.focused,true);assert.equal(result.same,true);assert.equal(result.exclusive,false);assert.equal(result.link.orientation,'horizontal');assert.equal(result.link.openingAreaM2,2);assert.equal(result.link.contactAreaM2,45);assert.equal(result.link.insulationMm,120);assert.ok(Math.abs(result.link.conductanceWK-(80+45/3.26))<1e-9);
  await settle();await run(()=>qv.simulation.step(.25));await settle();
  assert.equal(await run(()=>document.activeElement===linkAreaInput),true);
  assert.ok(Math.abs(Number(await run(()=>document.querySelector('.room-link[data-room-a="ground"][data-room-b="attic"]').dataset.conductance))-(80+45/3.26))<1e-9);
  await run(()=>{const pop=document.querySelector('[data-pop="link"]');for(const label of ['Opening area [m²]','Solid contact area [m²]']){const input=pop.querySelector(`input[type="range"][aria-label="${label}"]`);input.value='0';input.dispatchEvent(new Event('input',{bubbles:true}))}});await settle();
  assert.equal(await run(()=>document.querySelector('[data-pop="link"]').hidden),false);assert.equal(await run(()=>document.querySelectorAll('.room-link').length),3);assert.equal(await run(()=>qa.store.state.cfg.interzoneLinks.find(l=>l.roomA==='ground'&&l.roomB==='attic').conductanceWK),0);
  await run(()=>qa.store.setInterzoneConductance('ground','attic',90));await settle();
  assert.ok(await run(()=>[...document.querySelector('[data-pop="link"]').querySelectorAll('button')].some(b=>b.textContent==='Use geometry')));
  await run(()=>[...document.querySelector('[data-pop="link"]').querySelectorAll('button')].find(b=>b.textContent==='Use geometry').click());await settle();
  assert.equal(await run(()=>qa.store.state.cfg.interzoneLinks.find(l=>l.roomA==='ground'&&l.roomB==='attic').conductanceOverrideWK??null),null);assert.equal(await run(()=>qa.store.state.cfg.interzoneLinks.find(l=>l.roomA==='ground'&&l.roomB==='attic').conductanceWK),0);
  await run(()=>[...document.querySelector('[data-pop="link"]').querySelectorAll('button')].find(b=>b.textContent==='Remove link').click());await settle();
  assert.equal(await run(()=>document.querySelector('[data-pop="link"]').hidden),true);
  assert.equal(await run(()=>document.querySelectorAll('.room-link').length),2);
 });
 await check('session COP is the cumulative energy ratio, plotted beside its value and retained on edits',async()=>{
  await run(()=>qv.simulation.step(5));await settle();
  const snapshot=await run(()=>({energy:qv.simulation.status.output.energy,value:document.querySelector('.hm-session-cop .v').textContent,path:document.querySelector('.session-line').getAttribute('d')}));
  assert.equal(snapshot.value,(snapshot.energy.usefulServiceHeatJ/snapshot.energy.electricityJ).toFixed(2));assert.ok(snapshot.path.includes('M'));
  await run(()=>qa.store.update(s=>{s.cfg.outdoorRh=36;s.cfg.rooms[0].enabled=true}));await settle();
  assert.deepEqual(await run(()=>({value:document.querySelector('.hm-session-cop .v').textContent,path:document.querySelector('.session-line').getAttribute('d')})),{value:snapshot.value,path:snapshot.path});
  await run(()=>qa.store.update(s=>s.cfg.mode='cooling'));await settle();
  assert.equal(await run(()=>qv.simulation.status.output.energy.electricityJ),snapshot.energy.electricityJ);
  assert.equal(await run(()=>document.querySelector('.session-line').getAttribute('d')),snapshot.path);
  assert.equal(await run(()=>document.querySelector('.hm-session-cop .v').textContent),snapshot.value);
 });
 await check('cooling water total follows actual whole-system drainage and persists on mode edits',async()=>{
  await run(()=>{qa.store.setUnitCount(1);qa.store.update(s=>{s.cfg.mode='cooling';s.cfg.outdoorC=32;s.cfg.outdoorRh=35;Object.assign(s.cfg.rooms[0],{enabled:true,airC:27,setpointC:22,ventilationACH:0,internalGainW:0})});qa.store.restartSimulation()});await settle();
  await run(()=>qv.simulation.step(60));await settle();
  const wet=await run(()=>({out:qv.simulation.status.output,text:document.querySelector('.ice-head').textContent}));
  assert.equal(wet.out.diagnostics.fault,null);assert.ok(wet.out.energy.drainedWaterKg>0);assert.ok(wet.text.includes(`Water total ${wet.out.energy.drainedWaterKg.toFixed(3)} kg`));
  await run(()=>qa.store.update(s=>s.cfg.mode='heating'));await settle();assert.equal(await run(()=>qv.simulation.status.output.energy.drainedWaterKg),wet.out.energy.drainedWaterKg);
  assert.ok(await run(()=>document.querySelector('.ice-head').textContent.includes(`Water total ${qv.simulation.status.output.energy.drainedWaterKg.toFixed(3)} kg`)));
  await run(()=>qa.store.restartSimulation());await settle();
  assert.equal(await run(()=>qv.simulation.status.output.energy.drainedWaterKg),0);assert.equal(await run(()=>document.querySelector('.hm-session-cop .v').textContent),'—');assert.equal(await run(()=>document.querySelector('.session-line').getAttribute('d')),'');
  await run(()=>qa.store.setExperience('examples'));await page.waitFor('document.querySelector(".coil-film").dataset.source === "examples"');assert.equal(await run(()=>document.querySelector('.hm-session-cop .v').textContent),'—');assert.equal(await run(()=>document.querySelector('.session-line').getAttribute('d')),'');assert.ok(await run(()=>document.querySelector('.ice-head').textContent.includes('Water total —')));
 });
 await check('outdoor dashed baseline is gone and the field-line switch has a visible upper margin',async()=>{
  assert.equal(await run(()=>document.querySelectorAll('.zone-base').length),0);
  assert.ok(await run(()=>Number(document.querySelector('[data-block="line-model"]').closest('foreignObject').getAttribute('y'))>=10));
  assert.equal(await run(()=>document.querySelectorAll('img,image,canvas').length),0);
 });
 assert.deepEqual(page.events.filter(e=>e.method==='Runtime.exceptionThrown'),[]);
 await writeFile('reviews/links-session-water-browser-results.json',JSON.stringify({checkedAt:new Date().toISOString(),checks,scope:'Actual worker energies/drainage, visual link placement and stable characterized connection controls'},null,2)+'\n');
}finally{await page.close();await isolated.close()}
