import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {openPage} from './browser-session.mjs';
import {startIsolatedDev} from './isolated-dev.mjs';
const isolated=await startIsolatedDev(5202),page=await openPage(isolated.url),checkpoints=[];
const run=fn=>page.evaluate(`(${fn.toString()})()`);
const settle=()=>page.waitFor('!qv.simulation.isBusy && qv.simulation.status.output',60000);
const sha=async file=>createHash('sha256').update(await readFile(`${isolated.sourceRoot}/${file}`)).digest('hex');
try{
 await page.waitFor('!!document.querySelector(".scene")');
 await run(async()=>{const text=await fetch('/src/main.ts').then(r=>r.text());globalThis.qa=await import(text.match(/from "([^"]*\/state\.ts[^"]*)"/)[1]);globalThis.qv=await import(text.match(/from "([^"]*\/runtime\/view\.ts[^"]*)"/)[1]);qa.store.update(s=>{s.ui.paused=true;s.ui.speed=50;s.cfg.mode='heating';s.cfg.outdoorC=-.5;s.cfg.outdoorRh=90;for(const r of s.cfg.rooms.slice(0,3)){r.enabled=true;r.airC=18;r.setpointC=26}});qa.store.restartSimulation()});await settle();
 const epoch=await run(()=>qa.store.resetEpoch);
 for(let i=0;i<24;i++){
  if(i===4){await run(()=>qa.store.update(s=>{s.cfg.mode='cooling';s.cfg.outdoorC=42;s.cfg.outdoorRh=50;for(const r of s.cfg.rooms.slice(0,3))r.setpointC=17}));await settle();assert.equal(await run(()=>qv.simulation.status.output.simulatedSeconds),240)}
  assert.equal(await run(()=>qv.simulation.step(60)),true);await settle();
  const checkpoint=await run(()=>({time:qv.simulation.status.output.simulatedSeconds,state:qv.simulation.status.output.state,fault:qv.simulation.status.output.diagnostics.fault,energyResidual:qv.simulation.status.output.energy.residualJ,waterResidual:qv.simulation.status.output.energy.waterResidualKg,roomC:qv.simulation.status.output.rooms.map(r=>r.temperatureC),ice:qv.simulation.status.output.outdoor.frostMassKg??null,speed:qa.store.state.ui.speed,epoch:qa.store.resetEpoch,uiFault:document.querySelector('.fault-banner')?.hidden===false}));
  assert.equal(checkpoint.fault,null);assert.notEqual(checkpoint.state,'fault');assert.ok(Math.abs(checkpoint.energyResidual)<=1e-5);assert.ok(Math.abs(checkpoint.waterResidual)<=1e-9);assert.ok(checkpoint.roomC.every(Number.isFinite));assert.equal(checkpoint.time,(i+1)*60);assert.equal(checkpoint.speed,50);assert.equal(checkpoint.epoch,epoch);checkpoints.push(checkpoint);console.log(`PASS accepted ${checkpoint.time}s ${checkpoint.state}`);
 }
 assert.deepEqual(page.events.filter(e=>e.method==='Runtime.exceptionThrown'),[]);
 const files=['src/engine/cycle.ts','src/engine/engine.ts','src/engine/envelope.ts','src/engine/drive.ts','src/engine/types.ts'];
 await writeFile('reviews/hot-cooling-continuation-browser-results.json',JSON.stringify({checkedAt:new Date().toISOString(),checks:24,checkpoints,sourceHashes:Object.fromEntries(await Promise.all(files.map(async f=>[f,await sha(f)]))),scope:'Actual guarded browser worker, 240s strong heating then1200s cooling at42°C; requested50× remains selected, deterministic60s batches at unchanged physical timestep; not an achieved-rate benchmark'},null,2)+'\n');
}finally{await page.close();await isolated.close()}
