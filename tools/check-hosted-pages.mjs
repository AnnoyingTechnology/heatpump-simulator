// Verify the deployed static site using only its visible controls and sensors.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile, writeFile} from 'node:fs/promises';
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
const run=fn=>page.evaluate(`(${fn.toString()})()`);
const check=async(name,fn)=>{await fn();checks.push({name,passed:true});console.log(`PASS ${name}`)};
try{
 await page.send('Page.bringToFront');
 await check('hosted site starts a real running worker with physical sensor readings',async()=>{
  await page.waitFor(`document.querySelector('.opstate')?.dataset.kind==='running'&&document.querySelector('.time')?.textContent!=='00:00.0'`,60000);
  assert.equal(await run(()=>document.querySelector('[data-probe="compressor-discharge"]').dataset.source),'live');
  assert.ok(Number.isFinite(Number(await run(()=>document.querySelector('[data-probe="compressor-discharge"]').dataset.exact))));
  assert.equal(await run(()=>document.querySelectorAll('.indoor-probes .probe:not(.na)').length),6);
  assert.equal(await run(()=>document.querySelectorAll('img,image,canvas').length),0);
 });
 await activateControl(page,'Pause');
 await new Promise(resolve=>setTimeout(resolve,1200));
 const paused=await run(()=>document.querySelector('.time').textContent);
 await check('paused weather and individual indoor controls preserve the simulation clock',async()=>{
  await run(()=>{
   const temperature=document.querySelector('[aria-label="Outdoor air"] input[type="number"]');
   temperature.value='12.5';temperature.dispatchEvent(new Event('input',{bubbles:true}));
   const unit=document.querySelector('input[role="switch"]');
   unit.click();
  });
  await new Promise(resolve=>setTimeout(resolve,700));
  assert.equal(await run(()=>document.querySelector('.time').textContent),paused);
  assert.equal(await run(()=>document.querySelector('[aria-label="Outdoor air"] input[type="number"]').value),'12.5');
  assert.equal(await run(()=>document.querySelector('input[role="switch"]').checked),false);
 });
 await check('requested acceleration resumes physical time without restarting',async()=>{
  await run(()=>{const speed=document.querySelector('select[aria-label="Requested speed"]');speed.value='50';speed.dispatchEvent(new Event('change',{bubbles:true}))});
  await activateControl(page,'Resume');
  await page.waitFor(`document.querySelector('[data-unit="off"]')&&document.querySelector('.hd-speed-rate').textContent.includes('× actual')`,30000);
  assert.notEqual(await run(()=>document.querySelector('.time').textContent),paused);
  assert.equal(await run(()=>document.querySelector('.opstate').dataset.kind),'running');
 });
 const achievedRate=await run(()=>document.querySelector('.hd-speed-rate').textContent);
 await activateControl(page,'Pause');
 await new Promise(resolve=>setTimeout(resolve,1000));
 await check('hosted application and assets report no runtime or loading errors',async()=>{
  assert.deepEqual(page.events.filter(e=>e.method==='Runtime.exceptionThrown'),[]);
  const failed=page.events.filter(e=>e.method==='Network.loadingFailed'||
   e.method==='Network.responseReceived'&&e.params.response.status>=400&&!e.params.response.url.endsWith('/favicon.ico'));
  assert.deepEqual(failed,[]);
 });
 const result={checkedAt:new Date().toISOString(),url,wasmUrl:wasmUrl.href,wasmSha256:wasmHash,checks,achievedRate,desktop:{width:1600,height:1000}};
 await writeFile('reviews/github-pages-browser-results.json',JSON.stringify(result,null,2)+'\n');
 console.log(JSON.stringify(result,null,2));
}finally{await page.close()}
