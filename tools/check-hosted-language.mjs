import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {openPage} from './browser-session.mjs';
const page=await openPage('https://annoyingtechnology.github.io/heatpump-simulator/'),checks=[];
const run=fn=>page.evaluate(`(${fn.toString()})()`);
const check=async(name,fn)=>{await fn();checks.push({name,passed:true});console.log('PASS '+name)};
const snapshot=()=>run(()=>({time:document.querySelector('.time').textContent,probes:[...document.querySelectorAll('[data-probe]')].map(e=>[e.dataset.probe,e.dataset.exact]),paths:[...document.querySelectorAll('.room-chart path,.hm-trend path')].map(e=>e.getAttribute('d'))}));
try{
 await page.waitFor('!!document.querySelector(".language-select") && document.querySelector(".time").textContent!=="00:00:00"',60000);
 await run(()=>{const l=document.querySelector('.language-select');l.value='en';l.dispatchEvent(new Event('change',{bubbles:true}));document.querySelector('.hd-pause').click()});await new Promise(r=>setTimeout(r,1000));
 await check('published French switches existing controls and readings without resetting accepted time or history',async()=>{
  const before=await snapshot();
  await run(()=>{globalThis.held=document.querySelector('[aria-label="Outdoor air"] input[type=number]');held.focus();held.value='2.5';const l=document.querySelector('.language-select');l.value='fr';l.dispatchEvent(new Event('change',{bubbles:true}))});
  assert.deepEqual(await snapshot(),before);
  assert.deepEqual(await run(()=>[document.documentElement.lang,document.activeElement===held,held.value,document.querySelector('.hd-reset').textContent]),['fr',true,'2.5','Relancer']);
  assert.ok(await run(()=>[...document.querySelectorAll('.hm .k')].some(e=>e.textContent==='Puissance électrique')));
 });
 await check('published language choice persists and English can be restored',async()=>{
  await page.send('Page.reload');await page.waitFor('document.documentElement.lang==="fr" && !!document.querySelector(".language-select")',60000);
  assert.equal(await run(()=>document.querySelector('.language-select').value),'fr');
  await run(()=>{const l=document.querySelector('.language-select');l.value='en';l.dispatchEvent(new Event('change',{bubbles:true}))});
  assert.equal(await run(()=>document.querySelector('.hd-reset').textContent),'Reset');
 });
 assert.deepEqual(page.events.filter(e=>e.method==='Runtime.exceptionThrown'),[]);
 await writeFile('reviews/hosted-language-results.json',JSON.stringify({checkedAt:new Date().toISOString(),checks},null,2)+'\n');
}finally{await page.close()}
