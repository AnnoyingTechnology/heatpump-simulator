// Hosted DOM/worker readings only: no source imports, generated outputs or injected application state.
import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {openPage} from './browser-session.mjs';
const url='https://annoyingtechnology.github.io/heatpump-simulator/';
const page=await openPage(url),checks=[];
const run=fn=>page.evaluate(`(${fn.toString()})()`);
const check=async(name,fn)=>{await fn();checks.push({name,passed:true});console.log(`PASS ${name}`)};
try {
  await page.waitFor('document.querySelectorAll(".thermometer").length>10');
  await page.waitFor("[...document.querySelectorAll('.probe')].some(e=>e.dataset.exact)",45000);
  await check('published thermometers retain numeric readings, match physical sensors and use fixed scales',async()=>{
    const r=await run(()=>({sensors:[...document.querySelectorAll('.probe')].map(e=>({exact:e.dataset.exact,icon:e.querySelector('.thermometer').dataset.temperature})),icons:[...document.querySelectorAll('.thermometer')].map(e=>({min:+e.dataset.min,max:+e.dataset.max,height:+e.querySelector('.thermometer-column').getAttribute('height'),value:e.dataset.temperature,hidden:e.getAttribute('aria-hidden'),text:e.textContent})),numbers:[...document.querySelectorAll('.rp-v')].every(e=>!e.children.length)}));
    assert.ok(r.sensors.some(e=>e.exact));assert.ok(r.sensors.some(e=>!e.exact));
    for(const s of r.sensors){if(s.exact)assert.equal(+s.icon,+s.exact);else assert.equal(s.icon,'unknown');}
    for(const i of r.icons){assert.ok(i.min===-30&&i.max===50||i.min===-40&&i.max===145);assert.equal(i.text,'');assert.equal(i.hidden,'true');const expected=i.value==='unknown'?0:12*Math.max(0,Math.min(1,(+i.value-i.min)/(i.max-i.min)));assert.ok(Math.abs(i.height-expected)<1e-10);}
    assert.equal(r.numbers,true);
  });
  await check('published heating/cooling symbols and temperature controls remain legible and preserve focus/time',async()=>{
    const paused=await run(()=>{const p=[...document.querySelectorAll('.topbar button')].find(e=>e.textContent==='Pause');if(p)p.click();return document.querySelector('.time').textContent});
    await page.waitFor("[...document.querySelectorAll('.topbar button')].some(e=>e.textContent==='Resume')");
    await new Promise(resolve=>setTimeout(resolve,300));
    const r=await run(()=>{
      const input=document.querySelector('.op input[type=range][aria-label*="temperature" i]'),therm=input.closest('.pf').querySelector('.thermometer'),before=document.querySelector('.time').textContent;
      input.focus();const target=Number(input.value)+2;input.value=String(target);input.dispatchEvent(new Event('input',{bubbles:true}));
      const scene=document.querySelector('.scene').getBoundingClientRect();
      return {target,temperature:+therm.dataset.temperature,same:therm===input.closest('.pf').querySelector('.thermometer'),focused:document.activeElement===input,clockBefore:before,clockAfter:document.querySelector('.time').textContent,header:document.querySelector('.hm-heat .thermal-symbol').dataset.service,symbols:[...document.querySelectorAll('.thermal-symbol')].every(e=>e.querySelector('.symbol-flame')&&e.querySelector('.symbol-snow')&&e.textContent===''),bounded:[...document.querySelectorAll('.scene .measurement-symbol')].filter(e=>e.getClientRects().length).every(e=>{const r=e.getBoundingClientRect();return r.left>=scene.left-1&&r.right<=scene.right+1})};
    });assert.ok(paused);assert.equal(r.target,r.temperature);assert.equal(r.same,true);assert.equal(r.focused,true);assert.equal(r.clockBefore,r.clockAfter);assert.equal(r.header,'heating');assert.equal(r.symbols,true);assert.equal(r.bounded,true);
  });
  assert.deepEqual(page.events.filter(e=>e.method==='Runtime.exceptionThrown'),[]);
  await writeFile('reviews/hosted-measurement-symbols-results.json',JSON.stringify({checkedAt:new Date().toISOString(),url,checks,desktop:{width:1600,height:1000}},null,2)+'\n');
} finally {await page.close()}
