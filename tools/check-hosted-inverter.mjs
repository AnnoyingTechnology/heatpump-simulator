// Unchanged published house: visible speed control only; no development imports or injected state.
import assert from 'node:assert/strict';
import {readFile,readdir,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {openPage} from './browser-session.mjs';
const url=process.argv[2]??'https://annoyingtechnology.github.io/heatpump-simulator/';
const digest=b=>createHash('sha256').update(b).digest('hex'),bundleHashes={};
for(const name of (await readdir('dist/assets')).filter(n=>/\.(js|css)$/.test(n))){
 const r=await fetch(new URL('assets/'+name,url));assert.equal(r.status,200);
 bundleHashes[name]=digest(Buffer.from(await r.arrayBuffer()));assert.equal(bundleHashes[name],digest(await readFile('dist/assets/'+name)));
}
const page=await openPage(url),samples=[];let passed=false,error=null;
const run=fn=>page.evaluate(`(${fn.toString()})()`);
try{
 await page.waitFor('document.querySelector(".opstate")?.dataset.kind==="running"',60000);
 await run(()=>{const s=document.querySelector('select[aria-label="Requested speed"]');s.value='50';s.dispatchEvent(new Event('change',{bubbles:true}))});
 let last=-1,origin=null,nextReport=300;
 const deadline=Date.now()+480000;
 while(Date.now()<deadline){
  const sample=await run(()=>({time:document.querySelector('.time').textContent,state:document.querySelector('.opstate').dataset.kind,discharge:document.querySelector('[data-probe="compressor-discharge"]').dataset.exact,source:document.querySelector('[data-probe="compressor-discharge"]').dataset.source,powerKw:Number(document.querySelector('.hm-elec .v').textContent),cop:Number(document.querySelector('.hm-cop .v').textContent),speed:document.querySelector('select[aria-label="Requested speed"]').value,origin:performance.timeOrigin}));
  sample.seconds=sample.time.split(':').reduce((n,x)=>60*n+Number(x),0);samples.push(sample);
  origin??=sample.origin;assert.equal(sample.origin,origin,'document reloaded');assert.equal(sample.speed,'50');assert.ok(sample.seconds>=last,'clock reset');last=sample.seconds;
  assert.ok(['running','updating'].includes(sample.state),JSON.stringify(sample));
  assert.ok(sample.discharge!==''&&Number.isFinite(Number(sample.discharge)),'compressor circulation stopped');assert.equal(sample.source,'live');
  if(last>=nextReport){console.log(`Published owner case: ${last}s, ${sample.powerKw}kW, ${sample.cop}COP`);nextReport+=300}
  if(last>=1200){passed=true;break}await new Promise(r=>setTimeout(r,500));
 }
 assert.ok(passed,'published run did not reach1200simseconds');
 assert.deepEqual(page.events.filter(e=>e.method==='Runtime.exceptionThrown'||e.method==='Inspector.targetCrashed'),[]);
}catch(e){error=String(e);passed=false;throw e}
finally{
 await writeFile('reviews/hosted-inverter-continuity-results.json',JSON.stringify({checkedAt:new Date().toISOString(),url,bundleHashes,passed,error,samples,scope:'Unchanged published default; only visible requested speed changed to50; materialized compressor probe continuously available and physical clock/document retained for1200simseconds. Sampled UI evidence, not proof of uninterrupted sub-sample hardware operation.'},null,2)+'\n');
 await page.close();
}
