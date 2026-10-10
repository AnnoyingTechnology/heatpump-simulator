// Real worker endpoint provenance and permanent spatial controls; no constructed live readings.
import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {openPage} from './browser-session.mjs';
import {startIsolatedDev} from './isolated-dev.mjs';
const isolated=await startIsolatedDev(5184),page=await openPage(isolated.url),checks=[];
const run=fn=>page.evaluate(`(${fn.toString()})()`);
const settled=()=>page.waitFor('!qv.simulation.isBusy&&qv.simulation.status.state!=="loading"',30000);
const check=async(name,fn)=>{await fn();checks.push({name,passed:true});console.log(`PASS ${name}`)};
const step=async()=>{await settled();await run(()=>qv.simulation.step(.25));await settled();const out=await run(()=>qv.simulation.status.output);assert.notEqual(out.state,'fault',out.diagnostics.fault);return out};
const probe=async(id,role,value)=>{
  const p=await page.evaluate(`(()=>{const e=document.querySelector('[data-probe="${id}"]');return {role:e.dataset.role,exact:e.dataset.exact,temp:e.dataset.temp,visible:e.getClientRects().length>0,text:e.querySelector('.s-val').textContent}})()`);
  assert.equal(p.visible,true);assert.equal(p.role,role);
  if(value===null){assert.equal(p.temp,'unknown');assert.equal(p.text,'—')}
  else{assert.ok(Math.abs(Number(p.exact)-value)<1e-10);assert.ok(Math.abs(Number(p.text)-value)<=.050001)}
};
try{
  await page.waitFor('!!document.querySelector(".scene")');
  await run(async()=>{
    const m=await fetch('/src/main.ts').then(r=>r.text());
    globalThis.qa=await import(m.match(/from "([^"]*\/state\.ts[^"]*)"/)[1]);
    globalThis.qv=await import(m.match(/from "([^"]*\/runtime\/view\.ts[^"]*)"/)[1]);
    qa.store.update(s=>{s.ui.paused=true});
  });
  const out=await step(),c=out.cycle;assert.ok(c);
  await check('permanent heating probes match actual outdoor/compressor and per-branch EOS endpoints',async()=>{
    await probe('outdoor-coil-liquid','IN',c.expansionOutlet.temperatureC);
    await probe('outdoor-coil-gas','OUT',c.suction.temperatureC);
    await probe('compressor-suction','S',c.suction.temperatureC);
    await probe('compressor-discharge','D',c.discharge.temperatureC);
    for(let i=0;i<out.rooms.length;i++){
      await probe(`indoor-gas-${i}`,'IN',c.branchInlets[i].temperatureC);
      await probe(`indoor-liquid-${i}`,'OUT',c.branchOutlets[i].temperatureC);
    }
    const note=await run(()=>{const e=document.querySelector('[data-readout=outdoor-coil]');return {deltaK:e.dataset.deltaK,heatW:e.dataset.heatW}});
    assert.ok(Math.abs(Number(note.deltaK)-(c.suction.temperatureC-c.expansionOutlet.temperatureC))<1e-10);
    assert.equal(Number(note.heatW),c.outdoorCoilHeatW);
  });
  await check('local controls stay focused and preserve probe values until the next accepted step',async()=>{
    const r=await run(()=>{
      const e=document.querySelector('.room-rp input[type=range]');e.focus();
      const before=document.querySelector('[data-probe=compressor-discharge]').dataset.exact;
      e.value='22';e.dispatchEvent(new Event('input',{bubbles:true}));
      return {focused:document.activeElement===e,retained:before===document.querySelector('[data-probe=compressor-discharge]').dataset.exact,
        target:qa.store.state.cfg.rooms[0].setpointC};
    });assert.equal(r.focused,true);assert.equal(r.retained,true);assert.equal(r.target,22);
    await step();
  });
  await check('closed branch probes become unavailable without substituting air or metal temperature',async()=>{
    await run(()=>document.querySelector('.scene input[role=switch]').click());await step();
    await probe('indoor-gas-0','IN',null);await probe('indoor-liquid-0','OUT',null);
    assert.ok(Number(await run(()=>document.querySelector('[data-probe=indoor-gas-1]').dataset.exact))>0);
  });
  await check('environmental controls are unboxed, equipment-local mode and enlarged readouts are permanent',async()=>{
    const r=await run(()=>{
      const visible=e=>e.getClientRects().length>0;
      const weather=document.querySelector('.op'),room=document.querySelector('.room-env');
      return {weatherBorder:getComputedStyle(weather).borderTopWidth,roomBorder:getComputedStyle(room).borderTopWidth,
        weatherInputs:[...weather.querySelectorAll('input')].every(visible),roomInputs:[...room.querySelectorAll('input')].every(visible),
        values:[...document.querySelector('.room-rp').querySelectorAll('.rp-v,.rp-num')].map(e=>getComputedStyle(e).fontSize),
        mode:[...document.querySelectorAll('.ou button')].some(e=>e.textContent==='Heating'),
        headerMode:[...document.querySelectorAll('.topbar button')].some(e=>e.textContent==='Heating'),footer:document.querySelectorAll('#app>.drawer').length};
    });assert.equal(r.weatherBorder,'0px');assert.equal(r.roomBorder,'0px');assert.equal(r.weatherInputs,true);assert.equal(r.roomInputs,true);
    assert.ok(r.values.every(x=>parseFloat(x)>=22));assert.equal(r.mode,true);assert.equal(r.headerMode,false);assert.equal(r.footer,0);
  });
  assert.equal(page.events.filter(e=>e.method==='Runtime.exceptionThrown').length,0);
  await writeFile('reviews/spatial-sensors-browser-results.json',JSON.stringify({checkedAt:new Date().toISOString(),checks},null,2)+'\n');
}finally{await page.close();await isolated.close()}
