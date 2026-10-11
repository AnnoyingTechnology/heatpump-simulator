import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {openPage} from './browser-session.mjs';
import {startIsolatedDev} from './isolated-dev.mjs';
const isolated=await startIsolatedDev(5189),page=await openPage(isolated.url),checks=[];
const run=fn=>page.evaluate(`(${fn.toString()})()`);
const check=async(name,fn)=>{await fn();checks.push({name,passed:true});console.log(`PASS ${name}`)};
try{
 await page.waitFor('!!document.querySelector(".scene")');
 await run(async()=>{const m=await fetch('/src/main.ts').then(r=>r.text());globalThis.qa=await import(m.match(/from "([^"]*\/state\.ts[^"]*)"/)[1]);globalThis.qv=await import(m.match(/from "([^"]*\/runtime\/view\.ts[^"]*)"/)[1]);qa.store.update(s=>s.ui.paused=true)});
 await page.waitFor('!qv.simulation.isBusy && qv.simulation.status.output',30000);
 await check('each room shows eight labelled reference midpoints aligned to the slider, without a separate legend',async()=>{
  const scales=await run(()=>[...document.querySelectorAll('.room-env')].map(e=>({
   marks:[...e.querySelectorAll('.ls-m')].map(m=>({era:m.dataset.era,value:Number(m.dataset.midpoint),left:parseFloat(m.style.left),label:m.querySelector('.ls-lab').textContent})),
   ticks:[...e.querySelectorAll('.ls-tick')].map(t=>t.textContent),
   below:e.querySelector('.ls').getBoundingClientRect().top>=e.querySelector('input[aria-label^="Envelope heat-loss coefficient"][type="range"]').getBoundingClientRect().bottom,
   legends:e.querySelectorAll('.ls-key').length,
  })));
  for(const room of scales){
   assert.deepEqual(room.marks.map(m=>[m.era,m.value]),[['RE2020',115],['RT2012',145],['RT2005',250],['RT2000',290],['RT1988',350],['RT1982',415],['RT1974',500],['Pre-1974',750]]);
   for(const mark of room.marks){assert.equal(mark.label,mark.era);assert.ok(Math.abs(mark.left-mark.value/10)<.001)}
   assert.deepEqual(room.ticks,['0','250','500','750','1000']);assert.equal(room.below,true);assert.equal(room.legends,0);
  }
 });
 await check('reference scales fit the room bounds in both themes at desktop sizes and 1/3/5/8 rooms',async()=>{
  await run(()=>{qa.store.setExperience('examples');qa.store.setGenericPortCapacity(8)});
  for(const [width,height] of [[1280,720],[1440,900],[1600,1000],[1920,1080]]){
   await page.send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:false});
   for(const count of [1,3,5,8])for(const theme of ['light','dark']){
    await page.evaluate(`qa.store.setUnitCount(${count});qa.store.update(s=>s.ui.zoom='overview');(()=>{const t=document.querySelector('select[aria-label="Colour theme"]');t.value=${JSON.stringify(theme)};t.dispatchEvent(new Event('change',{bubbles:true}))})()`);
    await new Promise(r=>setTimeout(r,300));
    const failures=await run(()=>[...document.querySelectorAll('.room-env')].flatMap(e=>{const fo=e.closest('foreignObject').getBoundingClientRect();return [...e.querySelectorAll('.ls-lab,.ls-n')].flatMap(li=>{const r=li.getBoundingClientRect();return r.left<fo.left-.6||r.right>fo.right+.6||r.bottom>fo.bottom+.6?[{text:li.textContent,rect:{left:r.left,right:r.right,bottom:r.bottom},fo:{left:fo.left,right:fo.right,bottom:fo.bottom}}]:[]})}));
    assert.deepEqual(failures,[],JSON.stringify({width,height,count,theme,failures}));
    const overlaps=await run(()=>[...document.querySelectorAll('.ls')].flatMap(scale=>{
     const labels=[...scale.querySelectorAll('.ls-lab')].map(e=>({text:e.textContent,r:e.getBoundingClientRect()}));
     const stems=[...scale.querySelectorAll('.ls-m')].map(m=>({era:m.dataset.era,r:m.querySelector('.ls-stem').getBoundingClientRect()}));
     const bad=[];
     for(let i=0;i<labels.length;i++)for(let j=i+1;j<labels.length;j++){
      const a=labels[i],b=labels[j];if(Math.min(a.r.right,b.r.right)-Math.max(a.r.left,b.r.left)>.5&&Math.min(a.r.bottom,b.r.bottom)-Math.max(a.r.top,b.r.top)>.5)bad.push({a:a.text,b:b.text});
     }
     for(const stem of stems)for(const label of labels){if(stem.era===label.text)continue;const a=stem.r,b=label.r;if(Math.min(a.right,b.right)-Math.max(a.left,b.left)>.3&&Math.min(a.bottom,b.bottom)-Math.max(a.top,b.top)>.5)bad.push({leader:stem.era,label:label.text})}
     return bad;
    }));
    assert.deepEqual(overlaps,[],JSON.stringify({width,height,count,theme,overlaps}));
    if(count<=3)assert.ok(await run(()=>{const e=document.querySelector('.scene-scroll');return e.scrollHeight<=e.clientHeight+1}),'default overview has no unnecessary scrolling');
   }
  }
 });
 await check('loss edits retain focused controls, room zoom, reference elements and accepted physical state',async()=>{
  await run(()=>{qa.store.reset();qa.store.update(s=>{s.ui.paused=true;s.ui.zoom=`room:${s.cfg.rooms[0].id}`})});
  await page.waitFor('!qv.simulation.isBusy && qv.simulation.status.output',30000);
  const result=await run(()=>{const range=document.querySelector('.room-env input[aria-label^="Envelope heat-loss coefficient"][type="range"]'),scale=document.querySelector('.room-env .ls'),before=JSON.stringify(qv.simulation.status.output),zoom=qa.store.state.ui.zoom;range.focus();range.value='650';range.dispatchEvent(new Event('input',{bubbles:true}));return {focused:document.activeElement===range,same:document.querySelector('.room-env .ls')===scale,zoom:qa.store.state.ui.zoom===zoom,physical:JSON.stringify(qv.simulation.status.output)===before,value:qa.store.state.cfg.rooms[0].heatLossWPerK}});
  assert.deepEqual(result,{focused:true,same:true,zoom:true,physical:true,value:650});
 });
 assert.deepEqual(page.events.filter(e=>e.method==='Runtime.exceptionThrown'),[]);
 await writeFile('reviews/loss-scale-browser-results.json',JSON.stringify({checkedAt:new Date().toISOString(),checks,layoutCombinations:32,representation:'labelled midpoints'},null,2)+'\n');
}finally{await page.close();await isolated.close()}
