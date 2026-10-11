import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {openPage} from './browser-session.mjs';
import {startIsolatedDev} from './isolated-dev.mjs';
const isolated=await startIsolatedDev(5187),page=await openPage(isolated.url),checks=[];
const run=fn=>page.evaluate(`(${fn.toString()})()`);
const check=async(name,fn)=>{await fn();checks.push({name,passed:true});console.log(`PASS ${name}`)};
const settle=()=>page.waitFor('!qv.simulation.isBusy && qv.simulation.status.output',30000);
try {
 await page.waitFor('!!document.querySelector(".scene")');
 await run(async()=>{const src=await fetch('/src/main.ts').then(r=>r.text());globalThis.qa=await import(src.match(/from "([^"]*\/state\.ts[^"]*)"/)[1]);globalThis.qv=await import(src.match(/from "([^"]*\/runtime\/view\.ts[^"]*)"/)[1]);qa.store.update(s=>s.ui.paused=true)});await settle();
 await check('legend remains at viewport bottom through zoom, scroll and resize, including eight rooms',async()=>{
  await run(()=>{qa.store.setExperience('examples');qa.store.setGenericPortCapacity(8)});
  for(const [width,height] of [[1280,720],[1440,900],[1600,1000],[1920,1080]]){
   await page.send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:false});
   for(const count of [1,3,5,8]){
    await page.evaluate(`qa.store.setUnitCount(${count})`);
    for(const zoom of ['overview','outdoor','rooms',await run(()=>`room:${qa.store.state.cfg.rooms[qa.store.state.cfg.unitCount-1].id}`)]){
     await page.evaluate(`qa.store.update(s=>s.ui.zoom=${JSON.stringify(zoom)})`);
     await new Promise(r=>setTimeout(r,550));
     const box=await run(()=>{const rect=s=>{const r=document.querySelector(s).getBoundingClientRect();return {top:r.top,bottom:r.bottom,height:r.height,width:r.width}};return {stage:rect('.stage'),scroll:rect('.scene-scroll'),legend:rect('.legend'),ramp:rect('.lg-scale .ramp'),air:rect('.ramp.air'),page:document.documentElement.scrollHeight,header:[...document.querySelectorAll('.topbar button,.topbar select,.hd-metrics,.hd-status')].filter(e=>e.getClientRects().length).map(e=>{const r=e.getBoundingClientRect();return {left:r.left,right:r.right,bottom:r.bottom}})}});
     assert.ok(Math.abs(box.legend.bottom-height)<1,JSON.stringify({width,height,count,zoom,box}));
     assert.ok(box.scroll.bottom<=box.legend.top+.1&&box.scroll.height>0);
     assert.ok(box.ramp.height>=10&&box.ramp.width>300&&box.air.height>0);
     assert.ok(box.page<=height,JSON.stringify({width,height,count,zoom,box}));
     assert.ok(box.header.every(b=>b.left>=0&&b.right<=width&&b.bottom<=72),JSON.stringify({width,count,box}));
     await run(()=>{const e=document.querySelector('.scene-scroll');e.scrollTop=e.scrollHeight});
     assert.ok(Math.abs(await run(()=>document.querySelector('.legend').getBoundingClientRect().bottom)-height)<1);
    }
   }
  }
 });
 await check('all pressure readings are visible in default overview and metrics have separators without card borders',async()=>{
  await run(()=>{qa.store.reset();qa.store.update(s=>{s.ui.paused=true;s.ui.experience='live'})});await settle();
  const styles=await run(()=>({gauges:[...document.querySelectorAll('.taps .g-val')].map(e=>getComputedStyle(e).opacity),cards:[...document.querySelectorAll('.hm')].map(e=>{const s=getComputedStyle(e),r=e.getBoundingClientRect();return {top:s.borderTopWidth,right:s.borderRightWidth,bottom:s.borderBottomWidth,left:s.borderLeftWidth,radius:s.borderRadius,height:r.height}})}));
  assert.ok(styles.gauges.length>=3&&styles.gauges.every(v=>v==='1'));
  assert.ok(styles.cards.every(c=>c.top==='0px'&&c.right==='0px'&&c.bottom==='0px'&&c.radius==='0px'&&c.height>=70));
  assert.deepEqual(styles.cards.map(c=>c.left),['0px','1px','1px']);
 });
 await check('three vector plots consume actual worker readings; pause and settings do not add or reset history',async()=>{
  await run(()=>qv.simulation.step(5));await settle();
  const paths=await run(()=>[...document.querySelectorAll('.trend-line')].map(e=>e.getAttribute('d')));
  assert.equal(paths.length,3);assert.ok(paths.every(p=>p.includes('M')&&!/NaN/.test(p)));
  await run(()=>qa.store.update(s=>s.cfg.outdoorRh=36));await settle();
  assert.deepEqual(await run(()=>[...document.querySelectorAll('.trend-line')].map(e=>e.getAttribute('d'))),paths);
  assert.equal(await run(()=>document.querySelectorAll('img,image,canvas').length),0);
  assert.ok(await run(()=>[...document.querySelectorAll('.hm-trend title')].every(e=>e.textContent.includes('2 hours'))));
  await page.send('Emulation.setDeviceMetricsOverride',{width:1600,height:1000,deviceScaleFactor:1,mobile:false});
  await page.send('Page.bringToFront');
  await new Promise(r=>setTimeout(r,650));
  assert.ok(await run(()=>{const r=document.querySelector('.lg-scale .ramp').getBoundingClientRect();return !!document.elementFromPoint(r.x+r.width/2,r.y+r.height/2)?.closest('.legend')}));
  const shot=await page.send('Page.captureScreenshot',{format:'png',fromSurface:false,captureBeyondViewport:false});
  await writeFile('design/interface-trends.png',Buffer.from(shot.data,'base64'));
 });
 await check('reset clears previous trends; illustrative examples have no fabricated time history',async()=>{
  await run(()=>qa.store.restartSimulation());await settle();
  assert.equal(await run(()=>document.querySelector('.hm-cop .trend-line').getAttribute('d')),'');
  await run(()=>qa.store.setExperience('examples'));
  assert.ok(await run(()=>[...document.querySelectorAll('.trend-line')].every(e=>!e.getAttribute('d'))));
 });
 assert.equal(page.events.filter(e=>e.method==='Runtime.exceptionThrown').length,0);
 await writeFile('reviews/zoom-trends-browser-results.json',JSON.stringify({checkedAt:new Date().toISOString(),checks},null,2)+'\n');
}finally{await page.close();await isolated.close()}
