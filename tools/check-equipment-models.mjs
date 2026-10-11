import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {openPage} from './browser-session.mjs';
import {startIsolatedDev} from './isolated-dev.mjs';
const isolated=await startIsolatedDev(5195),page=await openPage(isolated.url),checks=[];
const run=fn=>page.evaluate(`(${fn.toString()})()`);
const check=async(name,fn)=>{await fn();checks.push({name,passed:true});console.log(`PASS ${name}`)};
try{
 await page.waitFor('!!document.querySelector(".scene")');
 await run(async()=>{
  const m=await fetch('/src/main.ts').then(r=>r.text());
  globalThis.qa=await import(m.match(/from "([^"]*\/state\.ts[^"]*)"/)[1]);
  globalThis.qc=await import(m.match(/from "([^"]*\/runtime\/config\.ts[^"]*)"/)[1]);
  const t=await fetch('/src/types.ts').then(r=>r.text());
  globalThis.qe=await import(t.match(/from "([^"]*\/equipment\.ts[^"]*)"/)[1]);
  qa.store.update(s=>s.ui.paused=true);qa.store.setExperience('examples');
 });
 await check('all reviewed outdoor profiles map to a genuine single matched head without OEM map inference',async()=>{
  const results=await run(()=>qe.OUTDOOR_MODELS.filter(m=>m.acceptance==='reviewed-fields').map(model=>{
   qa.store.setOutdoorKind(model.id);
   const cfg=qa.store.state.cfg,c=qc.engineConfigFromUi(cfg,cfg.live),profile=qe.indoorModelProfile(cfg.rooms[0].indoorClass);
   return {id:model.id,count:cfg.unitCount,ports:c.indoorPortCapacity,paired:model.compatibleIndoorClasses.includes(cfg.rooms[0].indoorClass),volume:c.outdoor.volumetricAirFlowM3s??null,expected:model.coolingHighFanFlowM3h===undefined?null:model.coolingHighFanFlowM3h/3600,mass:c.outdoor.airMassFlowKgs,configuredMass:cfg.live.outdoorAirMassFlowKgs,note:model.profileNote,indoorVolume:c.rooms[0].volumetricAirFlowM3s,expectedIndoor:profile.coolingHighFanFlowM3h/3600,displacement:c.compressor.displacementM3rev,configured:cfg.live.compressorDisplacementCm3*1e-6};
  }));
  assert.equal(results.length,29);
  for(const r of results){assert.equal(r.count,1);assert.equal(r.ports,1);assert.equal(r.paired,true);assert.equal(r.volume,r.expected);if(r.expected===null){assert.equal(r.mass,r.configuredMass);assert.match(r.note,/unpublished/)}assert.equal(r.indoorVolume,r.expectedIndoor);assert.equal(r.displacement,r.configured)}
 });
 await check('model changes retain room pool, thermal edits, pipes and user generic airflow overrides',async()=>{
  const result=await run(()=>{
   qa.store.reset();qa.store.setExperience('examples');
   qa.store.update(s=>{s.cfg.rooms[1].heatLossWPerK=123;s.cfg.rooms[1].setpointC=22.5;s.cfg.pipes[1].lengthM=12;s.cfg.live.outdoorAirMassFlowKgs=.73});
   const ids=qa.store.state.cfg.rooms.map(r=>r.id),reset=qa.store.resetEpoch;
   qa.store.setOutdoorKind('MUZ-AY25VG2');
   const reduced=qa.store.state.cfg.unitCount,profile=qa.store.state.cfg.outdoorVolumetricAirFlowM3s;
   qa.store.setIndoorClass(0,'MSZ-HR25VFK2');const rejected=qa.store.state.cfg.rooms[0].indoorClass==='MSZ-AY25VGK2';
   qa.store.update(s=>{delete s.cfg.outdoorVolumetricAirFlowM3s;delete s.cfg.rooms[0].volumetricAirFlowM3s});
   const manual=qc.engineConfigFromUi(qa.store.state.cfg,qa.store.state.cfg.live);
   qa.store.setOutdoorKind('owner');qa.store.setUnitCount(3);
   return {ids:qa.store.state.cfg.rooms.map(r=>r.id),beforeIds:ids,reduced,profile,rejected,manualVolume:manual.outdoor.volumetricAirFlowM3s??null,manualMass:manual.outdoor.airMassFlowKgs,reset:qa.store.resetEpoch===reset,room:qa.store.state.cfg.rooms[1].heatLossWPerK,target:qa.store.state.cfg.rooms[1].setpointC,line:qa.store.state.cfg.pipes[1].lengthM,count:qa.store.state.cfg.unitCount};
  });
  assert.deepEqual(result.ids,result.beforeIds);assert.equal(result.reduced,1);assert.ok(result.profile>0);assert.equal(result.rejected,true);assert.equal(result.manualVolume,null);assert.equal(result.manualMass,.73);assert.equal(result.reset,true);assert.equal(result.room,123);assert.equal(result.target,22.5);assert.equal(result.line,12);assert.equal(result.count,3);
 });
 await check('EF matched colour variants are explicit and generic capacity does not assert manufacturer pairing',async()=>{
  const r=await run(()=>{qa.store.setOutdoorKind('MUZ-EF35VG2');const options=qe.indoorOptionsForOutdoor('MUZ-EF35VG2');qa.store.setIndoorClass(0,'MSZ-EF35VGK2W');const selected=qa.store.state.cfg.rooms[0].indoorClass;qa.store.setOutdoorKind('generic');qa.store.setGenericPortCapacity(8);qa.store.setUnitCount(8);return {options:options.map(o=>o.value),selected,genericRetains:qa.store.state.cfg.rooms[0].indoorClass===selected,ports:qc.engineConfigFromUi(qa.store.state.cfg,qa.store.state.cfg.live).indoorPortCapacity,count:qa.store.state.cfg.unitCount}});
  assert.deepEqual(r.options,['MSZ-EF35VGK2B','MSZ-EF35VGK2W','MSZ-EF35VGK2S']);assert.equal(r.selected,'MSZ-EF35VGK2W');assert.equal(r.genericRetains,true);assert.equal(r.ports,8);assert.equal(r.count,8);
 });
 await check('native model selection applies matching choices without replacing controls and keeps exhaust straight',async()=>{
  const r=await run(()=>{
   const sel=document.querySelector('select[aria-label="Outdoor model"]');
   globalThis.outdoorSelect=sel;
   sel.focus();sel.value='MUZ-EF35VG2';sel.dispatchEvent(new Event('change',{bubbles:true}));
   const indoor=document.querySelector('.room-panel select[aria-label^="Indoor model"]');
   const options=[...indoor.options].map(o=>o.value);
   indoor.value='MSZ-EF35VGK2S';indoor.dispatchEvent(new Event('change',{bubbles:true}));
   return {outdoor:qa.store.state.cfg.outdoorKind,indoor:qa.store.state.cfg.rooms[0].indoorClass,options,
    same:sel===document.querySelector('select[aria-label="Outdoor model"]'),outdoorOptions:sel.options.length,
    streams:[...document.querySelectorAll('.airflow.exhaust .stream')].map(e=>e.getAttribute('d')),
    border:getComputedStyle(document.querySelector('.chip-ice')).borderWidth};
  });
  assert.equal(r.outdoor,'MUZ-EF35VG2');assert.equal(r.indoor,'MSZ-EF35VGK2S');assert.equal(r.same,true);assert.equal(r.outdoorOptions,31);
  assert.deepEqual(r.options,['MSZ-EF35VGK2B','MSZ-EF35VGK2W','MSZ-EF35VGK2S']);
  assert.equal(r.streams.length,4);assert.ok(r.streams.every(d=>!/[CQSA]/i.test(d)));assert.equal(r.border,'0px');
 });
 await check('the minimum hardware ceiling also bounds inherited fixed-speed and defrost commands',async()=>{
  const r=await run(()=>{
   qa.store.reset();qa.store.setExperience('examples');
   qa.store.update(s=>s.cfg.live.compressorMaxSpeedRps=18);
   const low=qc.engineConfigFromUi(qa.store.state.cfg,qa.store.state.cfg.live);
   qa.store.update(s=>s.cfg.live.compressorMaxSpeedRps=120);
   const high=qc.engineConfigFromUi(qa.store.state.cfg,qa.store.state.cfg.live);
   return {low:[low.compressor.speedMinRps,low.compressor.speedMaxRps,low.control.fixedSpeedRps,low.control.defrostSpeedRps],high:[high.control.fixedSpeedRps,high.control.defrostSpeedRps]};
  });
  assert.deepEqual(r,{low:[18,18,18,18],high:[40,35]});
  // The actual worker construction must accept the mapped lower bound, too.
  await run(()=>{qa.store.update(s=>{s.ui.paused=true;s.cfg.live.compressorMaxSpeedRps=18});qa.store.setExperience('live')});
  await page.waitFor('!globalThis.qv?.simulation?.isBusy',30000);
  const accepted=await run(async()=>{
   if(!globalThis.qv){const m=await fetch('/src/main.ts').then(r=>r.text());globalThis.qv=await import(m.match(/from "([^"]*\/runtime\/view\.ts[^"]*)"/)[1])}
   return qv.simulation.status;
  });
  await page.waitFor('!qv.simulation.isBusy && qv.simulation.status.output',30000);
  assert.notEqual((await run(()=>qv.simulation.status)).state,'error');
 });
 assert.deepEqual(page.events.filter(e=>e.method==='Runtime.exceptionThrown'),[]);
 await writeFile('reviews/equipment-catalogue-browser-results.json',JSON.stringify({checkedAt:new Date().toISOString(),checks,outdoorProfiles:25,matchedIndoorProfiles:45,scope:'Reviewed topology/flow profiles; generic compressor/coil performance retained.'},null,2)+'\n');
}finally{await page.close();await isolated.close()}
