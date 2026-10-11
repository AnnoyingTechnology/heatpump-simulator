import assert from 'node:assert/strict';import {writeFile}from'node:fs/promises';import{openPage}from'./browser-session.mjs';
const page=await openPage('https://annoyingtechnology.github.io/heatpump-simulator/'),checks=[];
const run=fn=>page.evaluate(`(${fn.toString()})()`);const check=async(name,fn)=>{await fn();checks.push({name,passed:true});console.log('PASS '+name)};
const traces=()=>run(()=>[...document.querySelectorAll('.room-chart')].filter(e=>!e.hidden).map(e=>({id:e.dataset.roomId,count:Number(e.dataset.count),seconds:Number(e.dataset.seconds),actual:e.querySelector('.room-chart-actual').getAttribute('d'),target:e.querySelector('.room-chart-target').getAttribute('d')})));
try{
 await page.waitFor('document.querySelectorAll(".room-chart[data-count]").length===3 && Number(document.querySelector(".room-chart").dataset.seconds)>0',30000);
 await check('published room traces have accepted timestamps and remain visible for the disabled attic head',async()=>{const t=await traces();assert.equal(t.length,3);assert.ok(t.every(r=>r.count>0&&r.seconds>0&&r.actual.startsWith('M')&&r.target.startsWith('M')));assert.equal(await run(()=>document.querySelector('input[role="switch"]').checked),false)});
 await run(()=>document.querySelector('.hd-pause').click());await new Promise(r=>setTimeout(r,800));
 await check('published paused room edits preserve accepted graph history',async()=>{const before=await traces();await run(()=>{const e=document.querySelector('.room-rp input[type=number]');e.value='22';e.dispatchEvent(new Event('input',{bubbles:true}))});await new Promise(r=>setTimeout(r,500));assert.deepEqual(await traces(),before)});
 assert.deepEqual(page.events.filter(e=>e.method==='Runtime.exceptionThrown'),[]);
 await writeFile('reviews/hosted-room-history-results.json',JSON.stringify({checkedAt:new Date().toISOString(),checks},null,2)+'\n');
}finally{await page.close()}
