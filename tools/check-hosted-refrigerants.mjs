import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {openPage} from './browser-session.mjs';
const fluids=(process.env.HEATPUMP_HOSTED_FLUIDS??'R22,R290,R134a,R1234yf,R410A,R407C,R32').split(',');
const page=await openPage('https://annoyingtechnology.github.io/heatpump-simulator/'),checks=[],readings=[];
const run=fn=>page.evaluate(`(${fn.toString()})()`);
const check=async(name,fn)=>{await fn();checks.push({name,passed:true});console.log('PASS '+name)};
try{
 await page.waitFor('!!document.querySelector(".ou-fluid-select") && document.querySelector(".time").textContent!=="00:00:00"',60000);
 await run(()=>{const l=document.querySelector('.language-select');l.value='en';l.dispatchEvent(new Event('change',{bubbles:true}));document.querySelector('.hd-pause').click()});await new Promise(r=>setTimeout(r,1000));
 await check('published factory selector stays R32 and generic equipment enables the qualified fluids',async()=>{
  assert.equal(await run(()=>document.querySelector('.ou-fluid-select').disabled),true);
  await run(()=>{const e=document.querySelector('.ou-model-select');e.value='generic';e.dispatchEvent(new Event('change',{bubbles:true}))});
  assert.equal(await run(()=>document.querySelector('.ou-fluid-select').disabled),false);
  for(const fluid of fluids)assert.equal(await page.evaluate(`document.querySelector('.ou-fluid-select option[value=${JSON.stringify(fluid)}]').disabled`),false);
 });
 await check('published fluid changes reset accepted time and each selected worker produces physical readings',async()=>{
  for(const fluid of fluids){
   await page.evaluate(`(()=>{const e=document.querySelector('.ou-fluid-select');e.value=${JSON.stringify(fluid)};e.dispatchEvent(new Event('change',{bubbles:true}))})()`);
   await page.waitFor('document.querySelector(".opstate").dataset.kind==="idle" && document.querySelector(".time").textContent==="00:00:00"',60000);
   assert.ok(await run(()=>[...document.querySelectorAll('.room-chart')].every(e=>Number(e.dataset.seconds)===0)));
   await run(()=>document.querySelector('.hd-pause').click());
   await page.waitFor('document.querySelector(".opstate").dataset.kind==="running" && Number(document.querySelector(".room-chart").dataset.seconds)>=2',60000);
   await run(()=>document.querySelector('.hd-pause').click());await new Promise(r=>setTimeout(r,800));
   const a=await run(()=>({fluid:document.querySelector('.ou-fluid-select').value,time:document.querySelector('.time').textContent,state:document.querySelector('.opstate').dataset.kind,dischargeC:Number(document.querySelector('[data-probe="compressor-discharge"]').dataset.exact),suctionC:Number(document.querySelector('[data-probe="compressor-suction"]').dataset.exact),energyKwh:Number(document.querySelector('.hm-energy').dataset.exactKwh),temp:document.querySelector('.flow-in .rp-v').textContent}));
   assert.equal(a.fluid,fluid);assert.equal(a.state,'running');assert.ok(Number.isFinite(a.dischargeC)&&Number.isFinite(a.suctionC)&&a.dischargeC>a.suctionC);assert.ok(a.energyKwh>0);readings.push(a);
  }
 });
 assert.deepEqual(page.events.filter(e=>e.method==='Runtime.exceptionThrown'),[]);
 await writeFile('reviews/hosted-refrigerants-results.json',JSON.stringify({checkedAt:new Date().toISOString(),checks,readings,scope:'Visible production controls, fresh workers and materialized sensors; no state injection'},null,2)+'\n');
}finally{await page.close()}
