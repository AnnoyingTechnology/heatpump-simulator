// Layout and accessibility checks for the single header and static HVAC fan illustration.
import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { openPage } from './browser-session.mjs';
import { activateControl } from './browser-controls.mjs';
import { startIsolatedDev } from './isolated-dev.mjs';

const isolated=await startIsolatedDev(5182);
const page=await openPage(isolated.url);
const run=fn=>page.evaluate(`(${fn.toString()})()`), results=[];
const check=async(name,fn)=>{await fn();results.push({name,passed:true});console.log(`PASS ${name}`)};
try {
  await page.waitFor('!!document.querySelector(".hd-metrics")');
  await run(async()=>{
    const src=await fetch('/src/main.ts').then(r=>r.text());
    globalThis.qa=await import(src.match(/from "([^"]*\/state\.ts[^"]*)"/)[1]);
    qa.store.update(s=>{s.ui.paused=true});
  });
  await check('one header contains headline readings without a stacked metric/status ribbon',async()=>{
    assert.equal(await run(()=>document.querySelectorAll('#app>.ribbon').length),0);
    assert.equal(await run(()=>document.querySelector('.ribbon')),null);
    assert.equal(await run(()=>document.querySelectorAll('.topbar .hd-metrics .hm').length),3);
    for(const [width,height] of [[1440,900],[1600,1000]]){
      await page.send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:false});
      for(const source of ['Examples','Live']){
        await activateControl(page,source);
        assert.equal(await run(()=>qa.store.state.ui.experience),source.toLowerCase());
        const layout=await run(()=>{
          const h=document.querySelector('.topbar').getBoundingClientRect();
          const controls=[...document.querySelectorAll('.topbar button,.topbar select,.hd-metrics,.hd-status')].filter(e=>e.getClientRects().length).map(e=>{
            const r=e.getBoundingClientRect();return {label:e.getAttribute('aria-label')||e.textContent,left:r.left,right:r.right,top:r.top,bottom:r.bottom};});
          return {headerHeight:h.height,stageTop:document.querySelector('.workbench').getBoundingClientRect().top,controls};
        });
        assert.ok(layout.headerHeight<=80&&layout.stageTop===layout.headerHeight,JSON.stringify(layout));
        assert.ok(layout.controls.every(e=>e.left>=0&&e.right<=width&&e.top>=0&&e.bottom<=layout.headerHeight),JSON.stringify({width,source,layout}));
      }
    }
  });
  await check('duplicate readings are absent and source/scenario selection belongs to outdoor settings',async()=>{
    assert.equal(await run(()=>document.querySelectorAll('.hd-readings,.ribbon,.drawer').length),0);
    await activateControl(page,'Examples');await activateControl(page,'Defrost');
    assert.equal(await run(()=>qa.store.state.cfg.example),'defrost');
    assert.equal(await run(()=>document.querySelector('.hd-metrics .hm:first-child .v').textContent),'—');
    assert.match(await run(()=>document.querySelector('.hd-status').innerText),/Examples|fixed|illustrative/i);
    await activateControl(page,'Cooling');
    assert.ok(await run(()=>[...document.querySelector('[data-pop="outdoor"] select').closest('.pop-settings').querySelectorAll('option')].filter(o=>['frost','defrost'].includes(o.value)).every(o=>o.disabled)));
  });
  await check('speed is a compact native control and fan graphics have no mechanical animation',async()=>{
    assert.deepEqual(await run(()=>[...document.querySelector('select[aria-label="Requested speed"]').options].map(o=>o.value)),['0.5','1','2','5','10','50']);
    await activateControl(page,'5×');assert.equal(await run(()=>qa.store.state.ui.speed),5);
    await activateControl(page,'50×');assert.equal(await run(()=>qa.store.state.ui.speed),50);
    assert.equal(await run(()=>document.querySelectorAll('#app>.drawer').length),0);
    assert.equal(await run(()=>document.querySelectorAll('.spin').length),0);
    assert.equal(await run(()=>document.querySelectorAll('.room .hub,.room .blade,.room circle.fan-well').length),0);
    assert.equal(await run(()=>document.querySelectorAll('.room .in-fan .slat').length),3);
    const animations=await run(()=>[...document.querySelectorAll('.scene *')].map(e=>getComputedStyle(e).animationName).filter(n=>/spin/i.test(n)));
    assert.deepEqual(animations,[]);
    assert.equal(await run(()=>document.querySelectorAll('img,image,canvas').length),0);
  });
  assert.equal(page.events.filter(e=>e.method==='Runtime.exceptionThrown').length,0);
  await writeFile('reviews/simplified-chrome-browser-results.json',JSON.stringify({checkedAt:new Date().toISOString(),checks:results},null,2)+'\n');
} finally {await page.close();await isolated.close()}
