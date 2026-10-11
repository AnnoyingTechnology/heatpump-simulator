import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {openPage} from './browser-session.mjs';
import {startIsolatedDev} from './isolated-dev.mjs';
const isolated=await startIsolatedDev(5212),page=await openPage(isolated.url),checks=[];
const run=fn=>page.evaluate(`(${fn.toString()})()`);
const check=async(name,fn)=>{await fn();checks.push({name,passed:true});console.log(`PASS ${name}`)};
const settle=()=>page.waitFor('!qv.simulation.isBusy && qv.simulation.status.output',30000);
const traces=()=>run(()=>[...document.querySelectorAll('.room-chart')].filter(e=>!e.hidden).map(e=>({id:e.dataset.roomId,count:Number(e.dataset.count),seconds:Number(e.dataset.seconds),actual:e.querySelector('.room-chart-actual').getAttribute('d'),target:e.querySelector('.room-chart-target').getAttribute('d')})));
try{
 await page.waitFor('!!document.querySelector(".scene")');
 await run(async()=>{const m=await fetch('/src/main.ts').then(r=>r.text());globalThis.qa=await import(m.match(/from "([^"]*\/state\.ts[^"]*)"/)[1]);globalThis.qv=await import(m.match(/from "([^"]*\/runtime\/view\.ts[^"]*)"/)[1]);qa.store.update(s=>s.ui.paused=true)});await settle();
 await check('room graphs show accepted physical temperatures including the disabled head',async()=>{
  await run(()=>qv.simulation.step(10));await settle();
  const a=await traces();assert.equal(a.length,3);assert.ok(a.every(e=>e.count>=2&&e.actual.includes('M')&&e.target.includes('H')));
  assert.equal(await run(()=>qv.simulation.status.error),null);
 });
 await check('paused target and unit edits preserve clock and recorded history',async()=>{
  const before=await traces();await run(()=>qa.store.update(s=>{s.cfg.rooms[0].setpointC=23;s.cfg.rooms[0].enabled=true}));await settle();
  assert.deepEqual(await traces(),before);
  await run(()=>qv.simulation.step(10));await settle();
  const a=await traces();assert.ok(a[0].seconds>before[0].seconds);assert.ok(a[0].target.includes('H')&&a[0].target.includes('V'));
 });
 await check('histories follow persistent room IDs when a room is removed',async()=>{
  const before=await traces();await run(()=>qa.store.removeRoom(0));await settle();
  const after=await traces();assert.equal(after.length,2);
  for(const r of after)assert.deepEqual(r,before.find(b=>b.id===r.id));
 });
 await check('Examples hide real history; returning and restarting never fabricate or retain another session',async()=>{
  const before=await traces();await run(()=>qa.store.setExperience('examples'));assert.deepEqual(await traces(),[]);
  await run(()=>qa.store.setExperience('live'));await settle();assert.deepEqual(await traces(),before);
  await run(()=>qa.store.restartSimulation());await settle();const reset=await traces();assert.ok(reset.every(r=>r.seconds===0&&r.count<=1));
 });
 await check('charts fit unboxed room settings at four desktop widths',async()=>{
  await run(()=>{qa.store.reset();qa.store.update(s=>s.ui.paused=true)});await settle();
  for(const [width,height]of [[1280,720],[1440,900],[1600,1000],[1920,1080]]){
   await page.send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:false});
   const a=await run(()=>({overflow:document.documentElement.scrollWidth>innerWidth,rooms:[...document.querySelectorAll('.room-env')].filter(e=>e.getClientRects().length).map(e=>{const b=e.getBoundingClientRect(),c=e.querySelector('.room-chart').getBoundingClientRect();return {height:b.height,client:e.clientHeight,scrollHeight:e.scrollHeight,children:[...e.children].map(x=>({cl:x.className,h:x.getBoundingClientRect().height})),scroll:e.scrollHeight>e.clientHeight+1,inside:c.top>=b.top&&c.bottom<=b.bottom+1,right:c.right<=b.right+1}})}));
   assert.equal(a.overflow,false);assert.ok(a.rooms.every(r=>!r.scroll&&r.inside&&r.right),JSON.stringify({width,a}));
  }
 }
 );
 assert.deepEqual(page.events.filter(e=>e.method==='Runtime.exceptionThrown'),[]);
 await writeFile('reviews/room-history-browser-results.json',JSON.stringify({checkedAt:new Date().toISOString(),checks,source:'accepted engine room.temperatureC and target; ten-second bins, two-hour physical-time window'},null,2)+'\n');
}finally{await page.close();await isolated.close()}
