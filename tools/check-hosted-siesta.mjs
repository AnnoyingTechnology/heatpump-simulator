// Exercise visible controls and actual workers; bundle identity is checked separately.
import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {openPage} from './browser-session.mjs';
const url=process.argv[2]??'https://annoyingtechnology.github.io/heatpump-simulator/';
const page=await openPage(url),checks=[];
const run=fn=>page.evaluate(`(${fn.toString()})()`);
const refs=['ATXM20A2V1B','ATXM20A5V1B','ATXM25A2V1B','ATXM25A5V1B','ATXM35A2V1B','ATXM35A5V1B','ATXM50A2V1B','ATXM50A5V1B','ATXP20N5V1B9','ATXP25N5V1B9','ATXP35N5V1B9','ATXF20F5V1B','ATXF25F5V1B','ATXF35F5V1B','ATXF42F5V1B','ATXF50F5V1B','ATXF60F2V1B','ATXF71F2V1B'];
const check=async(name,fn)=>{await fn();checks.push({name,passed:true});console.log('PASS '+name)};
const house=()=>({clock:document.querySelector('.time').textContent,
 targets:[...document.querySelectorAll('.room-rp input[type=number]')].map(e=>e.value),
 enabled:[...document.querySelectorAll('input[role=switch]')].map(e=>e.checked),
 charts:[...document.querySelectorAll('.room-chart')].map(e=>[e.dataset.roomId,e.dataset.seconds,e.dataset.count])});
try{
 await page.waitFor("Number(document.querySelector('.room-chart')?.dataset.seconds)>2&&document.querySelector('.opstate')?.dataset.kind==='running'",60000);
 await run(()=>{const language=document.querySelector('.language-select');language.value='en';language.dispatchEvent(new Event('change',{bubbles:true}));document.querySelector('.hd-pause').click()});
 await new Promise(r=>setTimeout(r,800));
 const before=await run(house);
 await run(()=>{const e=document.querySelector('.ou-model-select');e.value='generic';e.dispatchEvent(new Event('change',{bubbles:true}))});
 await check('all eighteen Siesta heads appear in the Daikin optgroup with availability unverified',async()=>{
  for(const id of refs){const option=await page.evaluate(`(()=>{const e=[...document.querySelectorAll('.room-rp select')[1].options].find(e=>e.value===${JSON.stringify(id)});return {brand:e?.parentElement.label,text:e?.textContent}})()`);assert.equal(option.brand,'Daikin');assert.match(option.text,/availability unverified/);}
 });
 await check('native indoor choices retain room targets, enabled state, clock and accepted charts',async()=>{
  for(const id of refs){await page.evaluate(`(()=>{const e=document.querySelectorAll('.room-rp select')[1];e.value=${JSON.stringify(id)};e.dispatchEvent(new Event('change',{bubbles:true}))})()`);assert.equal(await run(()=>document.querySelectorAll('.room-rp select')[1].value),id);assert.deepEqual(await run(house),before);}
 });
 await page.waitFor("document.querySelector('[data-probe=compressor-discharge]')?.dataset.source==='live'",60000);
 await check('selected source-profile head continues with actual worker readings and physical time',async()=>{
  await run(()=>document.querySelector('.hd-pause').click());
  await page.waitFor(`document.querySelector('.time').textContent!==${JSON.stringify(before.clock)}&&document.querySelector('.opstate')?.dataset.kind==='running'`,60000);
  const sensor=await run(()=>({source:document.querySelector('[data-probe=compressor-discharge]').dataset.source,temperature:Number(document.querySelector('[data-probe=compressor-discharge]').dataset.exact)}));
  assert.equal(sensor.source,'live');assert.ok(Number.isFinite(sensor.temperature));
 });
 assert.deepEqual(page.events.filter(e=>e.method==='Runtime.exceptionThrown'),[]);
 await writeFile('reviews/hosted-siesta-results.json',JSON.stringify({checkedAt:new Date().toISOString(),url,checks,refs,scope:'Visible indoor choices, retained house/history and actual generic worker; no OEM performance or exact multisplit compatibility claim'},null,2)+'\n');
}finally{await page.close()}
