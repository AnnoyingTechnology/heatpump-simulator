// Verify the deployed static site using only its visible controls and sensors.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile, readdir, writeFile} from 'node:fs/promises';
import {openPage} from './browser-session.mjs';
import {activateControl} from './browser-controls.mjs';

const url=process.argv[2]??'https://annoyingtechnology.github.io/heatpump-simulator/';
const wasmUrl=new URL('vendor/coolprop-safe/coolprop.wasm',url);
const response=await fetch(wasmUrl);
assert.equal(response.status,200,'hosted WASM response');
assert.match(response.headers.get('content-type'),/application\/wasm/);
const digest=data=>createHash('sha256').update(data).digest('hex');
const wasmHash=digest(new Uint8Array(await response.arrayBuffer()));
assert.equal(wasmHash,digest(await readFile('public/vendor/coolprop-safe/coolprop.wasm')),'deployed backend matches verified local artifact');

const page=await openPage(url),checks=[];
const expectedBundles=(await readdir('dist/assets')).filter(name=>name.endsWith('.js')||name.endsWith('.css'));
const bundleHashes={};
const run=fn=>page.evaluate(`(${fn.toString()})()`);
const check=async(name,fn)=>{await fn();checks.push({name,passed:true});console.log(`PASS ${name}`)};
try{
 await page.send('Page.bringToFront');
 await check('hosted site starts a real running worker with physical sensor readings',async()=>{
  await page.waitFor(`document.querySelector('.opstate')?.dataset.kind==='running'&&document.querySelector('.time')?.textContent!=='00:00:00'`,60000);
  assert.equal(await run(()=>document.querySelector('[data-probe="compressor-discharge"]').dataset.source),'live');
  assert.ok(Number.isFinite(Number(await run(()=>document.querySelector('[data-probe="compressor-discharge"]').dataset.exact))));
  assert.ok(await run(()=>document.querySelectorAll('.indoor-probes .probe:not(.na)').length>=2),'running indoor branch has materialized sensors');
  assert.equal(await run(()=>document.querySelectorAll('img,image,canvas').length),0);
  const loaded=new Set(page.events.filter(e=>e.method==='Network.responseReceived'&&e.params.response.status===200)
    .map(e=>new URL(e.params.response.url).pathname.split('/').at(-1)));
  assert.ok(expectedBundles.length>=2);
  for(const name of expectedBundles) {
    const asset=await fetch(new URL(`assets/${name}`,url));
    assert.equal(asset.status,200,`current production bundle ${name}`);
    bundleHashes[name]=digest(new Uint8Array(await asset.arrayBuffer()));
    assert.equal(bundleHashes[name],digest(await readFile(`dist/assets/${name}`)),`deployed bundle content ${name}`);
    // Worker network events belong to its own CDP target. Main scripts and styles must be observed in this tab.
    if(name.startsWith('index-')) assert.ok(loaded.has(name),`browser entry ${name}`);
  }
 });
 await activateControl(page,'Pause');
 await new Promise(resolve=>setTimeout(resolve,1200));
 const paused=await run(()=>document.querySelector('.time').textContent);
 await check('hosted whole-house ruler keeps RT markers beside average U and estimated exposed area',async()=>{
  const a=await run(()=>{const e=document.querySelector('[data-block="house-loss"]');return {count:document.querySelectorAll('.ls').length,markers:[...e.querySelectorAll('.ls-m')].map(m=>[m.querySelector('.ls-lab').textContent,Number(m.dataset.midpoint)]),ticks:[...e.querySelectorAll('.ls-tick')].map(t=>t.textContent),total:Number(e.dataset.totalWk),envelope:Number(e.dataset.envelopeWk),bounds:[...document.querySelectorAll('.room-env input[type="range"][aria-label^="Average U"]')].map(i=>[i.min,i.max])}});
  assert.equal(a.count,1);assert.deepEqual(a.markers,[['RE2020',115],['RT2012',145],['RT2005',250],['RT2000',290],['RT1988',350],['RT1982',415],['RT1974',500],['Pre-1974',750]]);assert.deepEqual(a.ticks,['0','250','500','750']);assert.equal(a.envelope,85);assert.ok(Math.abs(a.total-99.4075)<1e-9);assert.deepEqual(a.bounds,[['0','3'],['0','3'],['0','3']]);
  assert.ok(await run(()=>!!document.querySelector('select[aria-label="Quick preset"]')));
  assert.equal(await run(()=>document.querySelector('select[aria-label="Ventilation type"]').value),'dual');
  assert.equal(await run(()=>document.querySelector('input[type="number"][aria-label="Recovery [%]"]').value),'75');
  assert.equal(await run(()=>document.querySelector('input[type="number"][aria-label="Shared coil cleanliness [% clear]"]').value),'95');
  assert.equal(await run(()=>document.querySelectorAll('.clean-override,.ou [aria-label^="Compressor efficiency"]').length),0);
  assert.ok(await run(()=>[...document.querySelectorAll('.room-panel select[aria-label^="Indoor model"]')].every(s=>s.querySelector('optgroup[label="Daikin"]'))));
 });
 await check('hosted zoom keeps the temperature scales at the bottom and headline trends use borderless separators',async()=>{
  for(const zoom of ['overview','outdoor','overview']) {
   if(zoom==='outdoor') await run(()=>document.querySelector('.zone-out').dispatchEvent(new MouseEvent('click',{bubbles:true})));
   else await run(()=>{const button=document.querySelector('.zoom-out');if(!button.hidden)button.click()});
   await new Promise(resolve=>setTimeout(resolve,650));
   const layout=await run(()=>{const legend=document.querySelector('.legend').getBoundingClientRect(),ramp=document.querySelector('.lg-scale .ramp').getBoundingClientRect();return {bottom:legend.bottom,height:innerHeight,visible:!!document.elementFromPoint(ramp.x+ramp.width/2,ramp.y+ramp.height/2)?.closest('.legend')}});
   assert.ok(Math.abs(layout.bottom-layout.height)<1&&layout.visible,JSON.stringify(layout));
   assert.equal(await run(()=>document.querySelector('.time').textContent),paused);
  }
  assert.equal(await run(()=>document.querySelectorAll('.hm-trend').length),5);
  assert.ok(await run(()=>[...document.querySelectorAll('.hm-trend .trend-line')].every(e=>e.getAttribute('d').includes('M'))));
  assert.ok(await run(()=>[...document.querySelectorAll('.hm')].every(e=>getComputedStyle(e).borderTopWidth==='0px'&&getComputedStyle(e).borderBottomWidth==='0px')));
  assert.deepEqual(await run(()=>[...document.querySelectorAll('.hm')].map(e=>getComputedStyle(e).borderLeftWidth)),['0px','1px','1px','1px','1px']);
  assert.ok(await run(()=>[...document.querySelectorAll('.hm')].every(e=>{const v=e.querySelector('.vl').getBoundingClientRect(),g=e.querySelector('.hm-trend').getBoundingClientRect();return g.left>=v.right+4&&g.height>=40&&g.top<v.bottom&&g.bottom>v.top})), 'headline graphs sit beside their values');
  assert.ok(await run(()=>{const e=document.querySelector('.scene-scroll');return e.scrollHeight<=e.clientHeight+1}), 'default three-room overview fits without scrolling');
 });
 await check('hosted winter preset, room junctions, session COP and drained-water total are visible',async()=>{
  assert.ok(await run(()=>[...document.querySelectorAll('.hm-trend .trend-line,.hm-trend .session-line')].every(e=>e.getAttribute('d').includes('M'))));
  assert.ok(Number.isFinite(Number(await run(()=>document.querySelector('.hm-session-cop .v').textContent))));
  assert.ok(Number(await run(()=>document.querySelector('.hm-energy').dataset.exactKwh))>0);
  assert.ok(await run(()=>document.querySelector('.energy-line').getAttribute('d').includes('M')));
  assert.equal(await run(()=>document.querySelectorAll('.room-link').length),2);
  assert.ok(await run(()=>[...document.querySelectorAll('.room-link')].every(e=>Number.isFinite(Number(e.dataset.heatW))&&e.querySelector('.lk-val').textContent.includes('kW'))));
  assert.deepEqual(await run(()=>[...document.querySelectorAll('input[role="switch"]')].map(e=>e.checked)),[false,true,true]);
  assert.ok(await run(()=>document.querySelector('.ice-head').textContent.includes('Water total')));
  assert.equal(await run(()=>document.querySelectorAll('.zone-base').length),0);
  assert.ok(await run(()=>Number(document.querySelector('[data-block="line-model"]').closest('foreignObject').getAttribute('y'))>=10));
 });
 await check('paused weather and individual indoor controls preserve the simulation clock',async()=>{
  await run(()=>{
   const temperature=document.querySelector('[aria-label="Outdoor air"] input[type="number"]');
   temperature.value='12.5';temperature.dispatchEvent(new Event('input',{bubbles:true}));
   const unit=document.querySelectorAll('input[role="switch"]')[1];
   unit.click();
  });
  await new Promise(resolve=>setTimeout(resolve,700));
  assert.equal(await run(()=>document.querySelector('.time').textContent),paused);
  assert.equal(await run(()=>document.querySelector('[aria-label="Outdoor air"] input[type="number"]').value),'12.5');
  assert.equal(await run(()=>document.querySelectorAll('input[role="switch"]')[1].checked),false);
 });
 await check('requested acceleration resumes physical time without restarting',async()=>{
  await run(()=>{const speed=document.querySelector('select[aria-label="Requested speed"]');speed.value='50';speed.dispatchEvent(new Event('change',{bubbles:true}))});
  await activateControl(page,'Resume');
  await page.waitFor(`document.querySelector('[data-unit="off"]')&&document.querySelector('.hd-speed-rate').dataset.actualRate!==''`,30000);
  assert.notEqual(await run(()=>document.querySelector('.time').textContent),paused);
  // The winter preset can legitimately idle after its main upstairs head is switched off and outdoors is raised to 12.5°C.
  assert.ok(['running','idle'].includes(await run(()=>document.querySelector('.opstate').dataset.kind)));
 });
 const achievedRate=await run(()=>document.querySelector('.hd-speed-rate').textContent);
 const resumedOperatingState=await run(()=>document.querySelector('.opstate').dataset.kind);
 await activateControl(page,'Pause');
 await new Promise(resolve=>setTimeout(resolve,1000));
 await check('hosted application and assets report no runtime or loading errors',async()=>{
  assert.deepEqual(page.events.filter(e=>e.method==='Runtime.exceptionThrown'),[]);
  const failed=page.events.filter(e=>e.method==='Network.loadingFailed'||
   e.method==='Network.responseReceived'&&e.params.response.status>=400&&!e.params.response.url.endsWith('/favicon.ico'));
  assert.deepEqual(failed,[]);
 });
 const result={checkedAt:new Date().toISOString(),url,wasmUrl:wasmUrl.href,wasmSha256:wasmHash,expectedBundles,bundleHashes,checks,achievedRate,resumedOperatingState,desktop:{width:1600,height:1000}};
 await writeFile('reviews/github-pages-browser-results.json',JSON.stringify(result,null,2)+'\n');
 console.log(JSON.stringify(result,null,2));
}finally{await page.close()}
