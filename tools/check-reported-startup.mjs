// Reproduce startup through the actual browser pacing loop, using unchanged default UI inputs.
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {openPage} from './browser-session.mjs';
import {startIsolatedDev} from './isolated-dev.mjs';
const isolated=await startIsolatedDev(5210),page=await openPage(isolated.url),samples=[];
const run=fn=>page.evaluate(`(${fn.toString()})()`);
try{
 await page.waitFor('!!document.querySelector(".scene")');
 await run(async()=>{const text=await fetch('/src/main.ts').then(r=>r.text());globalThis.qa=await import(text.match(/from "([^"]*\/state\.ts[^"]*)"/)[1]);globalThis.qv=await import(text.match(/from "([^"]*\/runtime\/view\.ts[^"]*)"/)[1]);qa.store.reset();qa.store.update(s=>{s.ui.speed=50;s.ui.paused=false});qa.store.restartSimulation()});
 const config=await run(()=>qa.store.state.cfg),deadline=Date.now()+180000;
 while(Date.now()<deadline){
  const s=await run(()=>{const o=qv.simulation.status.output;return {time:o?.simulatedSeconds,status:qv.simulation.status.state,error:qv.simulation.status.error,fault:o?.diagnostics.fault,state:o?.state,rooms:o?.rooms.map(r=>({id:r.id,t:r.temperatureC,target:qa.store.state.cfg.rooms.find(c=>c.id===r.id)?.setpointC,calling:r.thermostatCalling})),epoch:qa.store.resetEpoch}});samples.push(s);
  if(s.error||s.fault||s.state==='fault'||s.time>=300)break;
  await new Promise(r=>setTimeout(r,500));
 }
 await run(()=>qa.store.update(s=>s.ui.paused=true));
 const diagnostic=await run(()=>qv.simulation.diagnosticReport());
 const files=['src/engine/engine.ts','src/engine/cycle.ts','src/engine/types.ts','src/state.ts','src/runtime/config.ts','src/runtime/controller.ts','src/main.ts'];
 const sourceHashes=Object.fromEntries(await Promise.all(files.map(async f=>[f,createHash('sha256').update(await readFile(`${isolated.sourceRoot}/${f}`)).digest('hex')])));
 const last=samples.at(-1),passed=last.time>=300&&!last.error&&!last.fault&&last.state!=='fault';
 await writeFile('reviews/reported-startup-browser-results.json',JSON.stringify({checkedAt:new Date().toISOString(),sourceHashes,config,samples,diagnostic,passed,scope:'Unchanged actual defaultConfig reset/startup through50x requested browser pacer; stopped at first fault or300 accepted seconds'},null,2)+'\n');
 console.log(JSON.stringify({passed,last,sourceHashes},null,2));
 if(!passed)process.exitCode=1;
}finally{await page.close();await isolated.close()}
