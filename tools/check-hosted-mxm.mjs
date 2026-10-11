// Visible production controls only; exact assets are checked separately by check-hosted-pages.
import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {openPage} from './browser-session.mjs';
const page=await openPage('https://annoyingtechnology.github.io/heatpump-simulator/'),checks=[];
const run=fn=>page.evaluate(`(${fn.toString()})()`);
const check=async(name,fn)=>{await fn();checks.push({name,passed:true});console.log('PASS '+name)};
const choose=async id=>page.evaluate(`(()=>{const e=document.querySelector('.ou-model-select');e.value=${JSON.stringify(id)};e.dispatchEvent(new Event('change',{bubbles:true}))})()`);
const current=['2MXM40A2V1B9','2MXM50A2V1B8','2MXM68A2V1B8','3MXM40A2V1B8','3MXM52A2V1B8','3MXM68A2V1B8','4MXM68A2V1B8','4MXM80A2V1B8','5MXM90A2V1B8'];
const legacy=['2MXM40N2V1B','2MXM50N2V1B','2MXM68N2V1B','3MXM40N2V1B8','3MXM52N2V1B8','3MXM68N2V1B','4MXM68N2V1B9','4MXM80N2V1B9','5MXM90N2V1B9'];
try {
 await page.waitFor('document.querySelector(".opstate")?.dataset.kind==="running"&&document.querySelector(".time")?.textContent!=="00:00:00"',60000);
 await run(()=>{const e=document.querySelector('.language-select');e.value='en';e.dispatchEvent(new Event('change',{bubbles:true}));document.querySelector('.hd-pause').click()});await new Promise(r=>setTimeout(r,1000));
 const snapshot=()=>({clock:document.querySelector('.time').textContent,targets:[...document.querySelectorAll('.room-rp input[type="number"]')].map(e=>e.value),enabled:[...document.querySelectorAll('input[role="switch"]')].map(e=>e.checked),heads:[...document.querySelectorAll('.room-rp select')].map(e=>e.value),air:[...document.querySelectorAll('.flow-in .rp-v')].map(e=>e.textContent)});
 const before=await run(snapshot);
 await check('source-reviewed current MXM references are grouped under Daikin',async()=>{
  for(const id of current)assert.equal(await page.evaluate(`document.querySelector('.ou-model-select option[value=${JSON.stringify(id)}]')?.parentElement.label`),'Daikin');
  if(process.env.HEATPUMP_HOSTED_LEGACY==='1')for(const id of legacy)assert.equal(await page.evaluate(`document.querySelector('.ou-model-select option[value=${JSON.stringify(id)}]')?.parentElement.label`),'Daikin');
 });
 await check('same-count selection retains visible house state and labels exact compatibility unknown',async()=>{
  await choose('3MXM52A2V1B8');assert.equal(await run(()=>document.querySelector('.ou-model-select').value),'3MXM52A2V1B8');
  assert.deepEqual(await run(snapshot),before);assert.match(await run(()=>document.querySelector('[data-installation-status]').textContent),/exact OEM combination: unknown/);
  assert.equal(await run(()=>document.querySelector('.ou-fluid-select').value),'R32');assert.equal(await run(()=>document.querySelector('.ou-fluid-select').disabled),true);
 });
 await check('two-port choice cannot silently delete a third room or reset its clock',async()=>{
  await choose('2MXM40A2V1B9');assert.equal(await run(()=>document.querySelector('.ou-model-select').value),'3MXM52A2V1B8');assert.deepEqual(await run(snapshot),before);
  assert.match(await run(()=>document.querySelector('.ou-slot').textContent),/Add or remove rooms explicitly/);
 });
 await check('selected MXM keeps actual worker sensors and accepted time advancing',async()=>{
  await run(()=>{const e=document.querySelector('.language-select');e.value='en';e.dispatchEvent(new Event('change',{bubbles:true}));document.querySelector('.hd-pause').click()});await page.waitFor(`document.querySelector('.time').textContent!==${JSON.stringify(before.clock)} && document.querySelector('.opstate').dataset.kind==='running'`,60000);
  assert.equal(await run(()=>document.querySelector('[data-probe="compressor-discharge"]').dataset.source),'live');assert.ok(Number.isFinite(await run(()=>Number(document.querySelector('[data-probe="compressor-discharge"]').dataset.exact))));
 });
 assert.deepEqual(page.events.filter(e=>e.method==='Runtime.exceptionThrown'),[]);
 await writeFile('reviews/hosted-mxm-results.json',JSON.stringify({checkedAt:new Date().toISOString(),checks,current,legacy:process.env.HEATPUMP_HOSTED_LEGACY==='1'?legacy:[],scope:'Visible production controls, retained house state and actual worker sensors; no state injection or OEM performance claim'},null,2)+'\n');
}finally{await page.close()}
