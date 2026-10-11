// Exercise the reported house through the real browser worker, including retained-state target edits.
import assert from 'node:assert/strict';
import {readFile, writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {openPage} from './browser-session.mjs';
import {startIsolatedDev} from './isolated-dev.mjs';

const isolated=await startIsolatedDev(5205),page=await openPage(isolated.url),samples=[];
const run=fn=>page.evaluate(`(${fn.toString()})()`);
const settle=()=>page.waitFor('!qv.simulation.isBusy && qv.simulation.status.output',60000);
const snapshot=()=>run(()=>{const o=qv.simulation.status.output,r=o.rooms.find(r=>r.id==='ground'),v=document.querySelector(`.room[data-room="${qa.store.state.cfg.rooms.findIndex(r=>r.id==='ground')}"]`);return {time:o.simulatedSeconds,state:o.state,fault:o.diagnostics.fault,energyResidual:o.energy.residualJ,waterResidual:o.energy.waterResidualKg,ground:{temperatureC:r.temperatureC,calling:r.thermostatCalling,fan:r.fanSpeedFraction,watts:r.fanPowerW},ui:v?{fan:v.dataset.fan,fraction:Number(v.dataset.fanFraction),duration:v.style.getPropertyValue('--indoor-air-duration'),calling:v.dataset.thermostatCalling}:null,epoch:qa.store.resetEpoch}});
try{
 await page.waitFor('!!document.querySelector(".scene")');
 await run(async()=>{const text=await fetch('/src/main.ts').then(r=>r.text());globalThis.qa=await import(text.match(/from "([^"]*\/state\.ts[^"]*)"/)[1]);globalThis.qv=await import(text.match(/from "([^"]*\/runtime\/view\.ts[^"]*)"/)[1]);qa.store.reset();qa.store.update(s=>{s.ui.paused=true;s.ui.speed=50;s.cfg.outdoorC=-4;s.cfg.rooms.find(r=>r.id==='ground').setpointC=16});qa.store.restartSimulation()});await settle();
 const epoch=await run(()=>qa.store.resetEpoch);
 for(let i=0;i<120;i++){
  assert.equal(await run(()=>qv.simulation.step(5)),true);await settle();
  const s=await snapshot();
  assert.equal(s.fault,null);assert.equal(s.epoch,epoch);assert.equal(s.time,(i+1)*5);
  assert.ok(Math.abs(s.energyResidual)<1e-5&&Math.abs(s.waterResidual)<1e-9);
  assert.ok(s.ui,'ground room is visible');
  assert.equal(s.ui.fan,s.ground.watts>0?'1':'0');assert.equal(s.ui.calling,s.ground.calling?'1':'0');assert.equal(s.ui.fraction,s.ground.fan);
  if(s.ground.fan>0)assert.ok(Math.abs(parseFloat(s.ui.duration)-1.8/s.ground.fan)<1e-5);
  samples.push(s);
  if(i%12===11)console.log(`PASS accepted ${s.time}s; ground ${s.ground.temperatureC.toFixed(2)}°C, call ${s.ground.calling}, fan ${s.ground.fan}`);
 }
 // Starting above the 17°C stop boundary, ground must remain satisfied until it cools to the 15°C restart boundary.
 assert.ok(samples.every(s=>s.ground.temperatureC>15&&!s.ground.calling&&s.ground.fan===0));
 const modulation=[];
 for(const error of [1.1,.8,.2,-.2,-.8,-1.1]){
  const before=await snapshot();
  await run(()=>{const r=qa.store.state.cfg.rooms.find(r=>r.id==='ground');globalThis.groundRoomId=r.id});
  await page.evaluate(`qa.store.update(s=>s.cfg.rooms.find(r=>r.id===groundRoomId).setpointC=${before.ground.temperatureC+error})`);await settle();
  assert.equal((await snapshot()).time,before.time);
  assert.equal(await run(()=>qv.simulation.step(.25)),true);await settle();
  const s=await snapshot();assert.equal(s.fault,null);assert.equal(s.epoch,epoch);
  assert.equal(s.ground.calling,error>-1);assert.equal(s.ui.calling,error>-1?'1':'0');
  assert.equal(s.ui.fraction,s.ground.fan);assert.equal(s.ui.fan,error>-1?'1':'0');
  if(error>-1){assert.ok(s.ground.watts>0);assert.ok(Math.abs(parseFloat(s.ui.duration)-1.8/s.ground.fan)<1e-5)}
  modulation.push({error,...s});
 }
 assert.ok(modulation.slice(1).every((s,i)=>s.ground.fan<modulation[i].ground.fan));
 const before=await snapshot();
 await run(()=>qa.store.update(s=>s.cfg.rooms.forEach(r=>r.enabled=false)));await settle();
 assert.equal((await snapshot()).time,before.time);
 assert.equal(await run(()=>qv.simulation.step(1)),true);await settle();
 assert.equal(await run(()=>qv.simulation.status.output.electrical.compressorW),0);
 assert.ok(await run(()=>qv.simulation.status.output.rooms.every(r=>!r.thermostatCalling&&r.fanSpeedFraction===0)));
 assert.equal((await snapshot()).epoch,epoch);
 assert.deepEqual(page.events.filter(e=>e.method==='Runtime.exceptionThrown'),[]);
 const files=['src/engine/engine.ts','src/engine/demand.ts','src/engine/thermostat.ts','src/engine/types.ts','src/scene.ts','src/style.css'];
 const sourceHashes=Object.fromEntries(await Promise.all(files.map(async f=>[f,createHash('sha256').update(await readFile(`${isolated.sourceRoot}/${f}`)).digest('hex')])));
 await writeFile('reviews/indoor-comfort-browser-results.json',JSON.stringify({checkedAt:new Date().toISOString(),sourceHashes,scenario:'owner defaults except−4°C outdoors and16°C ground target; actual guarded worker,600s in5s batches; retained-state target sweep checks fan modulation within a call; explicit all-Off retains stores/time',samples,modulation,allOffStopsCompressor:true,resetEpochRetained:true},null,2)+'\n');
 console.log('PASS ground remains satisfied without fan/call flicker; all-Off stops outdoor compressor without reset');
}finally{await page.close();await isolated.close()}
