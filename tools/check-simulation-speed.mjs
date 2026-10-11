// Isolated actual-worker QA: requested rate, achieved rate, pause and fixed-step pacing.
import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {openPage} from './browser-session.mjs';
import {startIsolatedDev} from './isolated-dev.mjs';
const server=await startIsolatedDev(5191),page=await openPage(server.url),checks=[],records=[];
const backend=process.env.HEATPUMP_QA_BACKEND??'production';
assert.ok(['production','legacy','guarded'].includes(backend),'supported isolated QA backend');
const run=fn=>page.evaluate(`(${fn.toString()})()`);
const settled=()=>page.waitFor('!qv.simulation.isBusy&&qv.simulation.status.output',30000);
const check=async(name,fn)=>{await fn();checks.push({name,passed:true});console.log(`PASS ${name}`)};
try{
 await page.waitFor('!!document.querySelector(".scene")');
 await page.send('Page.bringToFront');
 await run(async()=>{
  const main=await fetch('/src/main.ts').then(r=>r.text());
  globalThis.qa=await import(main.match(/from "([^"]*\/state\.ts[^"]*)"/)[1]);
  globalThis.qv=await import(main.match(/from "([^"]*\/runtime\/view\.ts[^"]*)"/)[1]);
  globalThis.qp=await import(main.match(/from "([^"]*\/runtime\/pacing\.ts[^"]*)"/)[1]);
  qa.store.update(s=>s.ui.paused=true);
 });await settled();
 if(backend==='guarded')await run(()=>{globalThis.qaPropertyModulePath='/vendor/coolprop-safe/adapter.js'});
 if(backend==='legacy')await run(()=>{globalThis.qaPropertyModulePath='/vendor/coolprop/coolprop.js'});
 if(backend!=='production')await run(()=>{
  // Override only this disposable QA page's future worker initialization. The
  // application loader remains unchanged until candidate acceptance.
  const post=Worker.prototype.postMessage;
  Worker.prototype.postMessage=function(request,...args){
   if(request.kind==='initialize')request={...request,propertyModuleUrl:new URL(globalThis.qaPropertyModulePath,location.href).href};
   return post.call(this,request,...args);
  };
 });
 await check('all requested speeds schedule quarter-second physical steps without a frame-rate ceiling',async()=>{
  const records=await run(()=>[.5,1,2,5,10,50].map(speed=>{
   const p=new qp.SimulationPacer();let clock=0,maxBatch=0;
   for(let ms=0;ms<=10000;ms+=10){p.update(ms,clock,speed,false,1);const batch=p.nextBatch();if(batch){clock+=batch;p.submitted(batch);maxBatch=Math.max(maxBatch,batch)}}
   return {speed,clock,maxBatch,achieved:p.achievedSpeed};
  }));
  for(const r of records){assert.ok(Math.abs(r.clock-10*r.speed)<=.25);assert.ok(r.maxBatch<=1);assert.ok(Math.abs(r.clock/.25-Math.round(r.clock/.25))<1e-8)}
 });
 await check('pause and speed changes discard requested backlog; restarting never borrows old clock time',async()=>{
  const r=await run(()=>{
   const p=new qp.SimulationPacer();p.update(0,0,50,false,100);p.update(100,0,50,false,100);
   const before=p.nextBatch();p.update(110,0,50,true,100);const paused=p.nextBatch();
   p.update(120,0,1,false,100);const resumed=p.nextBatch();p.update(620,1,1,false,100);
   p.update(630,0,1,false,0);return {before,paused,resumed,reset:p.nextBatch()};
  });assert.deepEqual(r,{before:.25,paused:0,resumed:0,reset:0});
 });
 await check('actual owner-preset worker clock and room dynamics respond to speed changes',async()=>{
  for(const speed of [1,2,50]){
   await page.evaluate(`qa.store.reset();qa.store.update(s=>{s.ui.paused=true;s.ui.speed=${speed}})`);await settled();
   const before=await run(()=>qv.simulation.status.output),started=Date.now();
   await run(()=>qa.store.update(s=>s.ui.paused=false));await new Promise(r=>setTimeout(r,5000));
   const rateText=await run(()=>document.querySelector('.hd-speed-rate').textContent);
   await run(()=>qa.store.update(s=>s.ui.paused=true));await settled();
   const after=await run(()=>qv.simulation.status.output),wallSeconds=(Date.now()-started)/1000;
   const simulatedSeconds=after.simulatedSeconds-before.simulatedSeconds;
   records.push({requested:speed,wallSeconds,simulatedSeconds,actual:simulatedSeconds/wallSeconds,rateText,roomChangeC:after.rooms[0].temperatureC-before.rooms[0].temperatureC});
   assert.equal(after.diagnostics.fault,null);assert.ok(Math.abs(after.energy.residualJ)<.01);
   assert.ok(Math.abs(simulatedSeconds/.25-Math.round(simulatedSeconds/.25))<1e-8);
   assert.match(rateText,/×$/);
   const time=after.simulatedSeconds;await new Promise(r=>setTimeout(r,600));assert.equal(await run(()=>qv.simulation.status.output.simulatedSeconds),time);
  }
  assert.ok(records[0].actual>.8&&records[0].actual<1.2,JSON.stringify(records));
  assert.ok(records[1].actual>1.6*records[0].actual,JSON.stringify(records));
  assert.ok(records[2].actual>1.8*records[0].actual,JSON.stringify(records));
  assert.ok(Math.abs(records[2].roomChangeC)>Math.abs(records[0].roomChangeC));
 });
 await check('fast passive scenes can advance beyond the former 15× animation-frame ceiling',async()=>{
  await run(()=>qa.store.update(s=>{s.cfg.rooms.forEach(r=>r.enabled=false);s.ui.speed=50;s.ui.paused=true}));await settled();
  const before=await run(()=>qv.simulation.status.output.simulatedSeconds),started=Date.now();
  await run(()=>qa.store.update(s=>s.ui.paused=false));await new Promise(r=>setTimeout(r,3000));
  await run(()=>qa.store.update(s=>s.ui.paused=true));await settled();
  const after=await run(()=>qv.simulation.status.output),wallSeconds=(Date.now()-started)/1000;
  const actual=(after.simulatedSeconds-before)/wallSeconds;records.push({requested:50,scene:'all-off',wallSeconds,simulatedSeconds:after.simulatedSeconds-before,actual});
  assert.equal(after.state,'idle');assert.equal(after.diagnostics.fault,null);assert.ok(actual>15,JSON.stringify(records));
 });
 await check('header speed readout remains inside the desktop header',async()=>{
  for(const [width,height] of [[1440,900],[1600,1000]]){
   await page.send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:false});
   assert.equal(await run(()=>{const root=document.querySelector('.topbar').getBoundingClientRect();return [...document.querySelectorAll('.topbar button,.hd-select,.hd-speed-rate,.hd-metrics')].every(e=>{const b=e.getBoundingClientRect();return b.left>=root.left&&b.right<=root.right&&b.top>=root.top&&b.bottom<=root.bottom})}),true);
  }
 });
 assert.equal(page.events.filter(e=>e.method==='Runtime.exceptionThrown').length,0);
 const resultPath=backend==='production'?'reviews/simulation-speed-browser-results.json':`reviews/${backend}-simulation-speed-browser-results.json`;
 await writeFile(resultPath,JSON.stringify({checkedAt:new Date().toISOString(),backend,context:'Isolated local Chromium, Reference model; CPU throughput is hardware/workload dependent.',checks,records},null,2)+'\n');
 console.log(JSON.stringify(records,null,2));
}finally{await page.close();await server.close()}
