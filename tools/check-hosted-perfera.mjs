// Published class choices through native controls, with actual worker continuation.
import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {openPage} from './browser-session.mjs';
const url=process.argv[2]??'https://annoyingtechnology.github.io/heatpump-simulator/';
const page=await openPage(url),checks=[];
const run=fn=>page.evaluate(`(${fn.toString()})()`);
const check=async(name,fn)=>{await fn();checks.push({name,passed:true});console.log('PASS '+name)};
const pairs=[['RXM20A','FTXM20A'],['RXM25A9','FTXM25A'],['RXM35A9','FTXM35A'],['RXM42A','FTXM42A'],['RXM50A8','FTXM50A'],['RXM60A','FTXM60A'],['RXM71A','FTXM71A']];
const house=()=>({clock:document.querySelector('.time').textContent,
  target:document.querySelector('.room-rp input[type=number]').value,
  enabled:document.querySelector('input[role=switch]').checked,
  charts:[...document.querySelectorAll('.room-chart')].filter(e=>!e.hidden).map(e=>[e.dataset.roomId,e.dataset.seconds,e.dataset.count])});
try{
  await page.waitFor("Number(document.querySelector('.room-chart')?.dataset.seconds)>2",60000);
  await run(()=>{const e=document.querySelector('.language-select');e.value='en';e.dispatchEvent(new Event('change',{bubbles:true}));document.querySelector('.hd-pause').click()});
  await new Promise(r=>setTimeout(r,800));
  await run(()=>{const e=document.querySelector('.ou-model-select');e.value='generic';e.dispatchEvent(new Event('change',{bubbles:true}));
    for(let i=0;i<2;i++)document.querySelector('.rp-remove').click();
    const target=document.querySelector('.room-rp input[type=number]');target.value='22';target.dispatchEvent(new Event('input',{bubbles:true}));});
  const before=await run(house);
  assert.equal(before.charts.length,1);
  await check('all seven Perfera pairs expose class identity without invented factory suffixes',async()=>{
    for(const [outdoor,indoor] of pairs){
      await page.evaluate(`(()=>{const e=document.querySelector('.ou-model-select');e.value=${JSON.stringify(outdoor)};e.dispatchEvent(new Event('change',{bubbles:true}))})()`);
      const selected=await run(()=>({out:document.querySelector('.ou-model-select').selectedOptions[0].textContent,
        head:document.querySelector('.eq-model').value,headText:document.querySelector('.eq-model').selectedOptions[0].textContent,
        status:document.querySelector('[data-installation-status]').textContent}));
      assert.equal(selected.head,indoor);assert.match(selected.out,/class; suffix unpublished/);
      assert.match(selected.headText,/class; suffix unpublished/);assert.match(selected.status,/exact OEM combination unknown/);
      assert.deepEqual(await run(house),before);
    }
  });
  await check('class identity remains explicit in French while house and chart time stay unchanged',async()=>{
    await run(()=>{const e=document.querySelector('.language-select');e.value='fr';e.dispatchEvent(new Event('change',{bubbles:true}))});
    assert.match(await run(()=>document.querySelector('.ou-model-select').selectedOptions[0].textContent),/classe ; suffixe non publié/);
    assert.match(await run(()=>document.querySelector('[data-installation-status]').textContent),/combinaison constructeur exacte inconnue/);
    assert.deepEqual(await run(house),before);
    await run(()=>{const e=document.querySelector('.language-select');e.value='en';e.dispatchEvent(new Event('change',{bubbles:true}))});
  });
  await check('selected class resumes accepted physical time with real compressor sensors',async()=>{
    await run(()=>document.querySelector('.hd-pause').click());
    await page.waitFor(`document.querySelector('.time').textContent!==${JSON.stringify(before.clock)}&&document.querySelector('.opstate')?.dataset.kind==='running'&&document.querySelector('[data-probe=compressor-discharge]')?.dataset.source==='live'`,60000);
    assert.ok(Number.isFinite(await run(()=>Number(document.querySelector('[data-probe=compressor-discharge]').dataset.exact))));
  });
  assert.deepEqual(page.events.filter(e=>e.method==='Runtime.exceptionThrown'),[]);
  await writeFile('reviews/hosted-perfera-results.json',JSON.stringify({checkedAt:new Date().toISOString(),url,checks,pairs,scope:'Native class choices, explicit suffix/eligibility unknowns, retained room/history and actual generic worker; no OEM performance claim'},null,2)+'\n');
}finally{await page.close()}
