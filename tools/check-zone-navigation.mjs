// Native browser checks for direct zone navigation, room geometry and equipment-scoped controls.
import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {openPage} from './browser-session.mjs';
import {startIsolatedDev} from './isolated-dev.mjs';
const isolated=await startIsolatedDev(5184),page=await openPage(isolated.url),checks=[];
const run=fn=>page.evaluate(`(${fn.toString()})()`);
const check=async(name,fn)=>{await fn();checks.push({name,passed:true});console.log(`PASS ${name}`)};
const settled=()=>page.waitFor('!qv.simulation.isBusy && qv.simulation.status.output',30000);
const key=async(value)=>{await page.send('Input.dispatchKeyEvent',{type:'keyDown',key:value,code:value===' '?'Space':value,windowsVirtualKeyCode:value==='Escape'?27:value==='Enter'?13:32});await page.send('Input.dispatchKeyEvent',{type:'keyUp',key:value,code:value===' '?'Space':value});};
try{
 await page.waitFor('!!document.querySelector(".scene")');
 await run(async()=>{const m=await fetch('/src/main.ts').then(r=>r.text());globalThis.qa=await import(m.match(/from "([^"]*\/state\.ts[^"]*)"/)[1]);globalThis.qv=await import(m.match(/from "([^"]*\/runtime\/view\.ts[^"]*)"/)[1]);qa.store.update(s=>s.ui.paused=true);});await settled();
 await check('duplicate Readings popup and footer are removed; unique controls live in outdoor settings',async()=>{
  assert.equal(await run(()=>document.querySelectorAll('.ribbon,.drawer,.hd-readings,#readings-pop').length),0);
  await run(()=>document.querySelector('button[aria-label="Outdoor unit settings"]').click());
  assert.equal(await run(()=>document.querySelector('[data-pop=outdoor]').hidden),false);
  const controls=await run(()=>[...document.querySelectorAll('.pop-settings label')].map(e=>e.textContent));assert.ok(controls.includes('Simulation source'));
  await run(()=>document.querySelector('.model-diagnostics').open=true);
  await page.waitFor('document.querySelector(".model-diagnostics").innerText.includes("Whole-system energy residual")');
  assert.equal(await run(()=>document.querySelectorAll('.model-diagnostics .rp-card').length),0);await key('Escape');
 });
 await check('click and keyboard zoom do not reset the engine; Escape and Zoom out restore overview',async()=>{
  const before=await run(()=>qv.simulation.status.output);
  await run(()=>document.querySelector('.zone-out').dispatchEvent(new MouseEvent('click',{bubbles:true})));
  assert.equal(await run(()=>qa.store.state.ui.zoom),'outdoor');await page.waitFor('document.querySelector(".scene").dataset.zoom==="outdoor"');
  assert.equal(await run(()=>document.querySelector('.zoom-out').hidden),false);await key('Escape');assert.equal(await run(()=>qa.store.state.ui.zoom),'overview');
  const id=await run(()=>qa.store.state.cfg.rooms[0].id);
  await run(()=>document.querySelector('[data-id="indoor:0"]').focus());await key('Enter');assert.equal(await run(()=>qa.store.state.ui.zoom),`room:${id}`);
  await run(()=>document.querySelector('.zoom-out').click());assert.equal(await run(()=>qa.store.state.ui.zoom),'overview');
  await run(()=>document.querySelector('.zone-in').focus());await key(' ');assert.equal(await run(()=>qa.store.state.ui.zoom),'rooms');await key('Escape');
  assert.deepEqual(await run(()=>qv.simulation.status.output),before);
 });
 await check('floor area and height derive volume without replacing focused controls or zooming',async()=>{
  const r=await run(()=>{const panel=document.querySelectorAll('.room-env')[0];const a=panel.querySelector('input[type=range][aria-label^="Floor area"]');const h=panel.querySelector('input[type=range][aria-label^="Ceiling height"]');a.focus();a.value='31';a.dispatchEvent(new Event('input',{bubbles:true}));const focused=document.activeElement===a;h.value='3.2';h.dispatchEvent(new Event('input',{bubbles:true}));return {focused,min:h.min,max:h.max,volume:panel.querySelector('[data-field="room-volume"]').textContent,zoom:qa.store.state.ui.zoom};});
  assert.equal(r.focused,true);assert.equal(r.min,'2.2');assert.equal(r.max,'6');assert.equal(Number(r.volume),99.2);assert.equal(r.zoom,'overview');await settled();
 });
 await check('loss help remains readable in room zoom and closes locally with Escape',async()=>{
  await run(()=>document.querySelector('[data-id="indoor:0"]').dispatchEvent(new MouseEvent('click',{bubbles:true})));
  await new Promise(r=>setTimeout(r,400));
  await run(()=>document.querySelector('.room-env .hl-btn').click());
  const guide=await run(()=>{const e=document.querySelector('.hl-guide'),b=e.getBoundingClientRect();return {hidden:e.hidden,text:e.innerText,box:{x:b.x,y:b.y,right:b.right,bottom:b.bottom}}});
  assert.equal(guide.hidden,false);assert.match(guide.text,/650–850|650.*850/);assert.match(guide.text,/unknown|unspecified|reference/i);assert.ok(guide.box.x>=0&&guide.box.right<=1600&&guide.box.y>=0&&guide.box.bottom<=1000,JSON.stringify(guide));
  await key('Escape');assert.equal(await run(()=>document.querySelector('.hl-guide').hidden),true);assert.ok(await run(()=>qa.store.state.ui.zoom.startsWith('room:')));await key('Escape');
 });
 await check('materialized outdoor exhaust uses actual fan air; arrows are vector and point left/down',async()=>{
  await settled();assert.equal(await run(()=>qv.simulation.step(.25)),true);await settled();
  const r=await run(()=>({actual:qv.simulation.status.output.outdoor.airOutletC,probe:[...document.querySelectorAll('[data-probe]')].filter(e=>e.dataset.probe.includes('air')).map(e=>({id:e.dataset.probe,exact:e.dataset.exact,text:e.textContent})),plumes:document.querySelectorAll('.plume').length,streams:document.querySelectorAll('.air-stream').length,air:[...document.querySelectorAll('.supply path,.exhaust path')].map(e=>e.getAttribute('d')),ice:document.querySelectorAll('.coil-film').length}));
  assert.ok(r.probe.length===1,JSON.stringify(r));assert.equal(Number(r.probe[0].exact),r.actual);assert.equal(r.plumes,0);assert.equal(r.ice,1);assert.equal(await run(()=>document.querySelectorAll('.air-probe rect,.air-probe .a-pill').length),0);assert.ok(r.air.length>0);
  await run(()=>qa.store.update(s=>s.cfg.rooms.forEach(r=>r.enabled=false)));await settled();await run(()=>qv.simulation.step(.25));await settled();
  assert.equal(await run(()=>qv.simulation.status.output.outdoor.airOutletC),null);assert.match(await run(()=>document.querySelector('[data-probe="outdoor-exhaust-air"]').textContent),/—/);
 });
 await check('indoor coil, inlet/outlet flow readings and header symbols are spatial and match engine values',async()=>{
  await run(()=>qa.store.update(s=>s.cfg.rooms.forEach(r=>r.enabled=true)));await settled();await run(()=>qv.simulation.step(.25));await settled();
  const r=await run(()=>{const room=document.querySelector('.room'),unit=room.querySelector('.unit-shell'),coil=room.querySelector('.coil-bay');return {
   width:Number(unit.getAttribute('width')),end:Number(coil.getAttribute('x'))+Number(coil.getAttribute('width')),
   intake:room.querySelectorAll('.intake .stream').length,supply:room.querySelectorAll('.supply .stream').length,
   directions:[...room.querySelectorAll('.intake .stream,.supply .stream')].map(e=>{const a=e.getPointAtLength(0),b=e.getPointAtLength(e.getTotalLength());return b.y>a.y}),
   inlet:Number(document.querySelector('.flow-in .rp-v').textContent),outlet:Number(document.querySelector('.flow-out .rp-v').textContent),actual:qv.simulation.status.output.rooms[0],
   duplicated:document.querySelector('.room-rp').innerText.includes('Supply air'),cop:document.querySelector('.hm-cop').innerText,bold:Number(getComputedStyle(document.querySelector('.hm-cop .v')).fontWeight),
   plug:document.querySelectorAll('.hm-icon').length,sun:getComputedStyle(document.querySelector('.hm-sun')).display,snow:getComputedStyle(document.querySelector('.hm-snow')).display};});
  assert.ok(Math.abs(r.end/r.width-.95)<.005);assert.equal(r.intake,9);assert.equal(r.supply,9);assert.ok(r.directions.every(Boolean));assert.ok(Math.abs(r.inlet-r.actual.temperatureC)<.051);assert.ok(Math.abs(r.outlet-r.actual.airOutletC)<.051);assert.equal(r.duplicated,false);assert.match(r.cop,/COP/);assert.ok(r.bold>=800);assert.equal(r.plug,3);assert.notEqual(r.sun,'none');assert.equal(r.snow,'none');
  await run(()=>qa.store.setMode('cooling'));assert.equal(await run(()=>getComputedStyle(document.querySelector('.hm-sun')).display),'none');assert.notEqual(await run(()=>getComputedStyle(document.querySelector('.hm-snow')).display),'none');await settled();
 });
 await check('room removal preserves zoom by identity; removing the focused room returns to overview',async()=>{
  await run(()=>{qa.store.setExperience('examples');qa.store.setGenericPortCapacity(8);qa.store.setUnitCount(5);qa.store.update(s=>s.ui.zoom=`room:${s.cfg.rooms[2].id}`);});
  const zoom=await run(()=>qa.store.state.ui.zoom);await run(()=>qa.store.removeRoom(0));assert.equal(await run(()=>qa.store.state.ui.zoom),zoom);
  await run(()=>{const i=qa.store.state.cfg.rooms.findIndex(r=>`room:${r.id}`===qa.store.state.ui.zoom);qa.store.removeRoom(i)});assert.equal(await run(()=>qa.store.state.ui.zoom),'overview');
 });
 await check('room and equipment controls fit their foreignObjects at two desktop sizes and 1/3/5/8 rooms',async()=>{
  for(const [width,height] of [[1440,900],[1600,1000]]){
   await page.send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:false});
   for(const count of [1,3,5,8]){
    await page.evaluate(`qa.store.setUnitCount(${count});qa.store.update(s=>s.ui.zoom='overview');document.querySelector('.scene-scroll').scrollTop=0`);
    await new Promise(r=>setTimeout(r,350));
    const bad=await run(()=>[...document.querySelectorAll('.room-env,.room-rp,.flow-in,.flow-out,.ou')].flatMap(card=>{const fo=card.closest('foreignObject').getBoundingClientRect();return [...card.querySelectorAll('input,select,button')].filter(e=>e.getBoundingClientRect().width).flatMap(e=>{const b=e.getBoundingClientRect();return b.x<fo.x-.6||b.right>fo.right+.6||b.y<fo.y-.6||b.bottom>fo.bottom+.6?[{label:e.getAttribute('aria-label')||e.textContent,b:{x:b.x,y:b.y,right:b.right,bottom:b.bottom},fo:{x:fo.x,y:fo.y,right:fo.right,bottom:fo.bottom}}]:[]})}));assert.deepEqual(bad,[],JSON.stringify({width,count,bad}));
   }
  }
 });
 assert.equal(page.events.filter(e=>e.method==='Runtime.exceptionThrown').length,0);
 await run(()=>{qa.store.reset();qa.store.update(s=>{s.ui.paused=true;s.ui.experience='live';s.cfg.live.circuitModel='reference'})});await settled();await run(()=>qv.simulation.step(.25));await settled();await page.screenshot('design/interface-zones.png');
 await writeFile('reviews/zone-navigation-browser-results.json',JSON.stringify({checkedAt:new Date().toISOString(),checks},null,2)+'\n');
}finally{await page.close();await isolated.close()}
