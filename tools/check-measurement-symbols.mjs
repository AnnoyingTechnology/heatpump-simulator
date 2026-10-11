// Real DOM/worker readouts plus isolated decorative-symbol boundaries; no synthetic live values.
import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {openPage} from './browser-session.mjs';
import {startIsolatedDev} from './isolated-dev.mjs';
const isolated=await startIsolatedDev(5221),page=await openPage(isolated.url),checks=[];
const run=fn=>page.evaluate(`(${fn.toString()})()`);
const check=async(name,fn)=>{await fn();checks.push({name,passed:true});console.log(`PASS ${name}`)};
const settled=()=>page.waitFor('!qv.simulation.isBusy&&qv.simulation.status.state!=="loading"',30000);
try {
  await page.waitFor('document.querySelectorAll(".thermometer").length>10');
  await run(async()=>{
    const m=await fetch('/src/main.ts').then(r=>r.text());
    globalThis.qa=await import(m.match(/from "([^"]*\/state\.ts[^"]*)"/)[1]);
    globalThis.qv=await import(m.match(/from "([^"]*\/runtime\/view\.ts[^"]*)"/)[1]);
    qa.store.update(s=>{s.ui.paused=true});
  });
  await settled();await run(()=>qv.simulation.step(.25));await settled();
  await check('thermometer fills follow fixed air/refrigerant scales, bounds and missing values without numeric text',async()=>{
    const evidence=await run(async()=>{
      const {temperatureSymbol}=await import('/src/measurement-symbols.ts');
      return ['air','refrigerant'].map(scale=>{
        const s=temperatureSymbol(scale),min=+s.root.dataset.min,max=+s.root.dataset.max;
        return {scale,min,max,samples:[min-100,min,(min+max)/2,max,max+100,null,NaN].map(value=>{
          s.update(value);return {value:Number.isFinite(value)?value:null,unknown:s.root.dataset.temperature==='unknown',height:+s.root.querySelector('.thermometer-column').getAttribute('height'),text:s.root.textContent,hidden:s.root.getAttribute('aria-hidden'),fill:s.root.querySelector('circle').getAttribute('fill')};
        })};
      });
    });
    assert.deepEqual(evidence.map(e=>[e.min,e.max]),[[-30,50],[-40,145]]);
    for(const e of evidence){assert.deepEqual(e.samples.map(x=>x.height),[0,0,6,12,12,0,0]);assert.ok(e.samples.every(x=>x.text===''&&x.hidden==='true'));assert.ok(e.samples.slice(5).every(x=>x.unknown&&x.fill==='transparent'));}
  });
  await check('materialized thermometers show their actual worker sensor values; inactive sensors stay empty',async()=>{
    const sensors=await run(()=>[...document.querySelectorAll('.probe')].map(e=>({exact:e.dataset.exact,icon:e.querySelector('.thermometer').dataset.temperature,plain:e.querySelector('.s-val').textContent,desc:e.getAttribute('aria-label')})));
    assert.ok(sensors.some(s=>s.exact));assert.ok(sensors.some(s=>!s.exact));
    for(const s of sensors){assert.ok(s.desc);if(s.exact)assert.equal(+s.icon,+s.exact);else{assert.equal(s.icon,'unknown');assert.equal(s.plain,'—');}}
    const air=await run(()=>[...document.querySelectorAll('.flow-in .thermometer')].map(e=>({icon:+e.dataset.temperature,text:e.nextElementSibling.textContent})));
    for(const a of air)assert.ok(Math.abs(a.icon-Number(a.text.replace('−','-')))<=.050001);
  });
  await check('temperature editing updates the fill without losing input focus, sensor DOM or the accepted clock',async()=>{
    const r=await run(()=>{
      const input=document.querySelector('.room-rp input[type=range]'),icon=input.closest('.pf').querySelector('.thermometer'),sensor=document.querySelector('.probe'),clock=qv.simulation.status.output.simulatedSeconds;
      input.focus();for(const target of [19,20,22]){input.value=target;input.dispatchEvent(new Event('input',{bubbles:true}));}
      return {focused:document.activeElement===input,sameIcon:icon===input.closest('.pf').querySelector('.thermometer'),temperature:+icon.dataset.temperature,sameSensor:sensor===document.querySelector('.probe'),clockBefore:clock,clockAfter:qv.simulation.status.output.simulatedSeconds};
    });assert.equal(r.focused,true);assert.equal(r.sameIcon,true);assert.equal(r.temperature,22);assert.equal(r.sameSensor,true);assert.equal(r.clockBefore,r.clockAfter);await settled();
  });
  await check('heating, cooling and illustrative defrost use shared flame/snowflake paths with signed service preserved',async()=>{
    await run(()=>qa.store.setExperience('examples'));await settled();
    for(const mode of ['heating','cooling']){
      await page.evaluate(`qa.store.update(s=>{s.cfg.mode=${JSON.stringify(mode)};s.cfg.example='normal'})`);
      const r=await run(()=>({head:document.querySelector('.hm-heat .thermal-symbol').dataset.service,rooms:[...document.querySelectorAll('.flow-out .thermal-symbol')].map(e=>e.dataset.service),coil:[...document.querySelectorAll('.coil-note')].map(e=>({heat:+e.dataset.heatW,service:e.querySelector('.thermal-symbol').dataset.service}))}));
      assert.equal(r.head,mode);assert.ok(r.rooms.every(s=>s===mode));
      for(const c of r.coil){if(Number.isFinite(c.heat)&&c.heat!==0)assert.equal(c.service,c.heat<0?'cooling':'heating');}
    }
    await run(()=>qa.store.update(s=>{s.cfg.mode='heating';s.cfg.example='defrost'}));
    const defrost=await run(()=>({head:document.querySelector('.hm-heat .thermal-symbol').dataset.service,heat:document.querySelector('.hm-heat .v').textContent,rooms:[...document.querySelectorAll('.flow-out .thermal-symbol')].map(e=>({service:e.dataset.service,value:e.nextElementSibling.textContent}))}));
    assert.equal(defrost.head,'cooling');assert.ok(Number(defrost.heat.replace('−','-'))<0);
    assert.ok(defrost.rooms.every(r=>r.service==='cooling'&&Number(r.value.replace('−','-'))<0));
    await run(()=>qa.store.update(s=>s.cfg.example='normal'));
  });
  await check('symbols and numbers remain separate, readable and within the diagram at four desktop widths in both themes',async()=>{
    for(const width of [1280,1440,1600,1920]){
      await page.send('Emulation.setDeviceMetricsOverride',{width,height:1000,deviceScaleFactor:1,mobile:false});
      for(const theme of ['light','dark']){
        await page.evaluate(`(()=>{const e=document.querySelector('select[aria-label="Colour theme"]');e.value=${JSON.stringify(theme)};e.dispatchEvent(new Event('change',{bubbles:true}))})()`);
        const r=await run(()=>{
          const stage=document.querySelector('.scene').getBoundingClientRect(),icons=[...document.querySelectorAll('.scene .measurement-symbol')];
          return {width:innerWidth,overflow:document.documentElement.scrollWidth>innerWidth,icons:icons.filter(e=>e.getClientRects().length).map(e=>{const b=e.getBoundingClientRect();return {x:b.x,right:b.right,stroke:getComputedStyle(e).color,within:b.left>=stage.left-1&&b.right<=stage.right+1}}),pairs:[...document.querySelectorAll('.rp-line:has(>.measurement-symbol)')].map(e=>{const i=e.querySelector('.measurement-symbol').getBoundingClientRect(),v=e.querySelector('.rp-v,.rp-num').getBoundingClientRect();return i.right<=v.left+.5}),numeric:[...document.querySelectorAll('.rp-v')].every(e=>!e.children.length)};
        });assert.equal(r.overflow,false);assert.ok(r.icons.every(i=>i.within),JSON.stringify({width,theme,icons:r.icons.filter(i=>!i.within)}));assert.ok(r.pairs.every(Boolean));assert.equal(r.numeric,true);
        if(width===1600)await page.screenshot(`design/measurement-symbols-${theme}.png`);
      }
    }
  });
  assert.deepEqual(page.events.filter(e=>e.method==='Runtime.exceptionThrown'),[]);
  await writeFile('reviews/measurement-symbols-browser-results.json',JSON.stringify({checkedAt:new Date().toISOString(),checks,desktopWidths:[1280,1440,1600,1920],themes:['light','dark'],scales:{air:[-30,50],refrigerant:[-40,145]}},null,2)+'\n');
}finally{await page.close();await isolated.close()}
