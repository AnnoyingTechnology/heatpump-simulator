import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {openPage} from './browser-session.mjs';
import {startIsolatedDev} from './isolated-dev.mjs';
const isolated=await startIsolatedDev(5215),page=await openPage(isolated.url),checks=[];
const run=fn=>page.evaluate(`(${fn.toString()})()`);
try{
  await page.waitFor('!!document.querySelector(".fan-shroud")');
  const g=await run(async()=>{const g=await import('/src/geometry.ts');return {fan:g.FAN_SIDE,center:g.A.fan,probe:g.PROBE_AT.compD,route:g.pipeSpecs(3).find(p=>p.id==='revO').pts.map(p=>[p[0]-g.OUT.x,p[1]-g.OUT.y])}});
  assert.ok(g.fan.h>=.9*219&&g.fan.h<=219);
  assert.ok(g.center[1]-g.fan.h/2>=8&&g.center[1]+g.fan.h/2<=227);
  for(let i=1;i<g.route.length;i++){
    const [a,b]=[g.route[i-1],g.route[i]],left=Math.min(a[0],b[0]),right=Math.max(a[0],b[0]),top=Math.min(a[1],b[1]),bottom=Math.max(a[1],b[1]);
    assert.ok(right<g.fan.x||left>g.fan.x+g.fan.w||bottom<g.center[1]-g.fan.h/2||top>g.center[1]+g.fan.h/2,'outlet tube clears tall fan');
  }
  assert.ok(g.probe.at[0]>g.fan.x+g.fan.w&&g.probe.at[1]+20<77,'discharge value clears fan and reverser label');
  checks.push({name:'fan spans fin height; outlet tube and materialized discharge sensor clear it',passed:true,geometry:g});
  await run(()=>document.querySelector('.zone-out').dispatchEvent(new MouseEvent('click',{bubbles:true})));
  await new Promise(r=>setTimeout(r,700));
  const box=await run(()=>{const f=document.querySelector('.fan-shroud').getBoundingClientRect(),s=document.querySelector('.scene-scroll').getBoundingClientRect(),legend=document.querySelector('.legend').getBoundingClientRect();return {fan:{top:f.top,bottom:f.bottom},stage:{top:s.top,bottom:s.bottom},legendBottom:legend.bottom,height:innerHeight}});
  assert.ok(box.fan.top>=box.stage.top&&box.fan.bottom<=box.stage.bottom);
  assert.ok(Math.abs(box.legendBottom-box.height)<1);
  assert.deepEqual(page.events.filter(e=>e.method==='Runtime.exceptionThrown'),[]);
  checks.push({name:'zoom keeps full tall fan and bottom legend visible',passed:true,box});
  const sourceHashes=Object.fromEntries(await Promise.all(['src/geometry.ts','src/scene.ts'].map(async f=>[f,createHash('sha256').update(await readFile(`${isolated.sourceRoot}/${f}`)).digest('hex')])));
  await writeFile('reviews/outdoor-fan-browser-results.json',JSON.stringify({checkedAt:new Date().toISOString(),sourceHashes,checks},null,2)+'\n');
  console.log(JSON.stringify(checks,null,2));
}finally{await page.close();await isolated.close()}
