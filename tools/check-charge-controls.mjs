import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {openPage} from './browser-session.mjs';
import {startIsolatedDev} from './isolated-dev.mjs';
const isolated=await startIsolatedDev(5186),page=await openPage(isolated.url),checks=[];
const run=fn=>page.evaluate(`(${fn.toString()})()`);
const check=async(name,fn)=>{await fn();checks.push({name,passed:true});console.log(`PASS ${name}`)};
const settled=()=>page.waitFor('!qv.simulation.isBusy && qv.simulation.status.output');
const step=async()=>{await settled();assert.equal(await run(()=>qv.simulation.step(.25)),true);await settled();assert.notEqual(await run(()=>qv.simulation.status.output.state),'fault',await run(()=>qv.simulation.status.output.diagnostics.fault));};
try {
 await page.waitFor('!!document.querySelector(".scene")');
 await run(async()=>{const m=await fetch('/src/main.ts').then(r=>r.text());globalThis.qa=await import(m.match(/from "([^"]*\/state\.ts[^"]*)"/)[1]);globalThis.qv=await import(m.match(/from "([^"]*\/runtime\/view\.ts[^"]*)"/)[1]);qa.store.update(s=>{s.ui.paused=true;s.cfg.live.circuitModel='inventory';});});
 await settled();
 await check('real cold-start charge, static coil sensors and physical service pressures are present',async()=>{
  const r=await run(()=>({mass:qv.simulation.status.output.inventory.massKg,
   shown:document.querySelector('.ou-rem .rp-v').textContent,
   probes:[...document.querySelectorAll('[data-probe]')].filter(e=>!e.dataset.probe.startsWith('compressor') && e.dataset.probe!=='outdoor-exhaust-air').map(e=>e.querySelector('.s-val').textContent),
   gauges:[...document.querySelectorAll('.gauge')].map(e=>e.querySelector('.g-val').textContent+' '+(e.querySelector('.branch-unit')?.textContent??''))}));
  assert.ok(Math.abs(r.mass-1.8)<1e-9);assert.equal(Number(r.shown),1.8);assert.ok(r.probes.every(v=>v!=='—'));assert.ok(r.gauges.every(v=>v.includes('bar')));
  for(let i=0;i<4;i++)await step();
 });
 await check('charge and length drafts preserve the active circuit and focused slider until Restart',async()=>{
  const before=await run(()=>({time:qv.simulation.status.output.simulatedSeconds,cells:qv.simulation.status.output.inventory.cells}));
  const r=await run(()=>{
   const initial=document.querySelector('.ou-charge input[type=range]');initial.focus();initial.value='1.7';initial.dispatchEvent(new Event('input',{bubbles:true}));
   const length=document.querySelector('[data-block="line-length"] input[type=range]');length.value='13';length.dispatchEvent(new Event('input',{bubbles:true}));
   return {draft:qa.store.state.cfg.live.initialChargeKg,time:qv.simulation.status.output.simulatedSeconds,cells:qv.simulation.status.output.inventory.cells,
    note:document.querySelector('.ou-rnote').textContent,line:document.querySelector('.ln-note').textContent,focus:document.activeElement===initial,busy:qv.simulation.isBusy};
  });assert.equal(r.draft,1.7);assert.equal(r.time,before.time);assert.deepEqual(r.cells,before.cells);assert.equal(r.focus,true);assert.equal(r.busy,false);assert.match(r.note,/charge/);assert.match(r.line,/Restart/);
  await run(()=>{[...document.querySelectorAll('.ou-charge button')].find(e=>e.textContent==='Restart').click();});await settled();
  assert.ok(Math.abs(await run(()=>qv.simulation.status.output.inventory.massKg)-1.7)<1e-9);
  assert.equal(await run(()=>qv.simulation.status.output.inventory.geometry.rooms[0].lineLengthM),13);
  assert.equal(await run(()=>qv.simulation.status.output.simulatedSeconds),0);
 });
 await check('charge-only scenarios expose no leak controls and individual Off preserves inventory time',async()=>{
  const ui=await run(()=>({controls:document.querySelectorAll('.ou-charge input[type=range]').length,text:document.querySelector('.ou-charge').innerText,config:qa.store.state.cfg.live}));
  assert.equal(ui.controls,1);assert.doesNotMatch(ui.text,/leak/i);assert.ok(!('leakCellId' in ui.config));assert.ok(!('leakGramsPerDay' in ui.config));
  const before=await run(()=>({time:qv.simulation.status.output.simulatedSeconds,mass:qv.simulation.status.output.inventory.massKg}));
  for(let i=0;i<4;i++)await step();
  const out=await run(()=>qv.simulation.status.output);assert.equal(out.simulatedSeconds,before.time+1);assert.ok(Math.abs(out.inventory.massKg-before.mass)<1e-9);assert.ok(Math.abs(out.energy.residualJ)<.005);
  await run(()=>qa.store.update(s=>s.cfg.rooms.forEach(r=>r.enabled=false)));await settled();await step();
  const r=await run(()=>({out:qv.simulation.status.output,probes:[...document.querySelectorAll('.indoor-probes .s-val')].map(e=>e.textContent),gauges:[...document.querySelectorAll('[data-branch-pressure]')].map(e=>({id:e.dataset.roomId,side:e.dataset.branchPressure,p:Number(e.dataset.pressureAbsolute)}))}));
  assert.equal(r.out.simulatedSeconds,out.simulatedSeconds+.25);assert.equal(r.out.electrical.compressorW,0);assert.ok(r.out.rooms.every(room=>room.airOutletC===null));assert.ok(r.probes.every(v=>v!=='—'));
  for(const gauge of r.gauges)assert.equal(gauge.p,r.out.inventory.coilPorts[gauge.id][gauge.side].pBarAbs);
 });
 await check('new topology explicitly starts a new circuit from the charge draft',async()=>{
  await run(()=>{qa.store.setOutdoorKind('generic');qa.store.addRoom();});await settled();
  assert.equal(await run(()=>qv.simulation.status.output.simulatedSeconds),0);
  assert.ok(Math.abs(await run(()=>qv.simulation.status.output.inventory.massKg)-1.7)<1e-9);
  await run(()=>qa.store.removeRoom(0));await settled();assert.match(await run(()=>qa.store.state.ui.notice),/new refrigerant circuit/);
 });
 await check('real liquid-filled initialization shows compressor protection separately from simulator Pause and indoor Off',async()=>{
  await run(()=>{qa.store.reset();qa.store.setUnitCount(1);qa.store.update(s=>{s.ui.paused=true;s.ui.experience='live';s.cfg.live.circuitModel='inventory';s.cfg.live.initialFluidTemperatureC=20;s.cfg.outdoorC=20;s.cfg.rooms[0].airC=20;s.cfg.rooms[0].setpointC=21;});});await settled();
  const mass=await run(async()=>{
   const module=await (await import('/vendor/coolprop/coolprop.js')).default();
   const volume=qv.simulation.status.output.inventory.cells.reduce((sum,cell)=>sum+cell.volumeM3,0);
   return volume*(.99*module.PropsSI('D','T',293.15,'Q',0,'R32')+.01*module.PropsSI('D','T',293.15,'Q',1,'R32'));
  });assert.ok(mass>.2&&mass<3);
  await page.evaluate(`const initial=document.querySelector('.ou-charge input[type=range]');initial.value=${JSON.stringify(mass)};initial.dispatchEvent(new Event('input',{bubbles:true}));[...document.querySelectorAll('.ou-charge button')].find(e=>e.textContent==='Restart').click()`);await settled();await step();
  const held=await run(()=>({out:qv.simulation.status.output,status:document.querySelector('.ou-slot').textContent,readings:qv.readingsFor(qa.store.state,'live')}));
  assert.equal(held.out.inventory.compressorAdmitted,false);assert.equal(held.out.electrical.compressorW,0);assert.equal(held.out.heatingCOP,null);
  assert.match(held.status,/Compressor stopped.*liquid carryover protection/);assert.match(held.readings.copLabel,/protection hold/);
  await run(()=>qa.store.update(s=>s.cfg.rooms[0].enabled=false));await settled();await step();
  assert.equal(await run(()=>qv.simulation.status.output.diagnostics.speedRps),0);
  assert.doesNotMatch(await run(()=>document.querySelector('.ou-slot').textContent),/liquid carryover protection/);
 });
 await check('charge controls fit the desktop outdoor card with the override expanded',async()=>{
  await run(()=>{qa.store.setExperience('examples');qa.store.update(s=>{s.cfg.live.outdoorCleanlinessOverridePct=80;s.cfg.live.circuitModel='reference';});});
  for(const [width,height] of [[1440,900],[1600,1000]]){
   await page.send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:false});
   for(const count of [1,3,5,8]){
    await page.evaluate(`qa.store.setGenericPortCapacity(8);qa.store.setUnitCount(${count});document.querySelector('.scene-scroll').scrollTop=0`);
    const r=await run(()=>{const card=document.querySelector('.ou'),fo=card.closest('foreignObject').getBoundingClientRect(),bounds=[...card.querySelectorAll('input,select,button')].filter(e=>e.getBoundingClientRect().width).map(e=>{const b=e.getBoundingClientRect();return {x:b.x,y:b.y,right:b.right,bottom:b.bottom}});return {fo:{x:fo.x,y:fo.y,right:fo.right,bottom:fo.bottom},bounds};});
    assert.ok(r.bounds.every(b=>b.x>=r.fo.x-.5&&b.right<=r.fo.right+.5&&b.y>=r.fo.y-.5&&b.bottom<=r.fo.bottom+.5),JSON.stringify({width,count,r}));
   }
  }
 });
 assert.equal(page.events.filter(e=>e.method==='Runtime.exceptionThrown').length,0);
 await run(()=>{qa.store.reset();qa.store.update(s=>{s.ui.paused=true;s.ui.experience='live';s.cfg.live.circuitModel='inventory';});document.activeElement?.blur();});await settled();await step();
 const shot=await page.send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false,fromSurface:false});await writeFile('design/interface-charge-controls.png',Buffer.from(shot.data,'base64'));
 await writeFile('reviews/charge-controls-browser-results.json',JSON.stringify({checkedAt:new Date().toISOString(),checks},null,2)+'\n');
}finally{await page.close();await isolated.close()}
