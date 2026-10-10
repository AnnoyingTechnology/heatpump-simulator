// Direct length editing, capacity-driven UI and connected scrolling layout.
import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {openPage} from './browser-session.mjs';
import {startIsolatedDev} from './isolated-dev.mjs';
const isolated=await startIsolatedDev(5185),page=await openPage(isolated.url),checks=[];
const run=fn=>page.evaluate(`(${fn.toString()})()`);
const check=async(name,fn)=>{await fn();checks.push({name,passed:true});console.log(`PASS ${name}`)};
try{
  await page.waitFor('!!document.querySelector(".scene")');
  await run(async()=>{
    const m=await fetch('/src/main.ts').then(r=>r.text());globalThis.qa=await import(m.match(/from "([^"]*\/state\.ts[^"]*)"/)[1]);
    qa.store.setExperience('examples');qa.store.update(s=>{s.ui.paused=true});
  });
  await check('branch length edits directly in the corridor with stable focus and honest model scope',async()=>{
    const r=await run(()=>{
      const block=document.querySelector('[data-block="line-length"][data-branch="0"]'),slider=block.querySelector('.ln-range');
      slider.focus();slider.value='12.5';slider.dispatchEvent(new Event('input',{bubbles:true}));
      return {length:qa.store.state.cfg.pipes[0].lengthM,source:qa.store.state.cfg.pipes[0].lengthSource,
        focus:document.activeElement===slider,number:block.querySelector('.ln-num').value,note:block.querySelector('.ln-note').textContent,
        current:qa.store.state.ui.selected,geometry:qa.store.state.cfg.rooms[0].name,aria:slider.getAttribute('aria-label')};
    });assert.equal(r.length,12.5);assert.equal(r.source,'edited');assert.equal(r.focus,true);assert.equal(Number(r.number),12.5);
    assert.match(r.note,/Examples: not applied/);assert.equal(r.current,null);assert.ok(r.aria.includes(r.geometry));
    await run(()=>document.querySelector('[data-block="line-model"] button:last-child').click());
    assert.equal(await run(()=>qa.store.state.cfg.live.fieldLines),'physical');
    await run(()=>document.querySelector('[data-block="line-model"] button:first-child').click());
    assert.equal(await run(()=>qa.store.state.cfg.live.fieldLines),'idealized');
  });
  await check('native port capacity and Add/Remove allow eight connected rooms without a global five cap',async()=>{
    await run(()=>{
      [...document.querySelectorAll('.ou button')].find(e=>e.textContent==='Generic').click();
      const cap=document.querySelector('.ou-cap');cap.value='8';cap.dispatchEvent(new Event('input',{bubbles:true}));cap.dispatchEvent(new Event('change',{bubbles:true}));
      for(let i=0;i<5;i++)document.querySelector('.in-add').click();
    });assert.equal(await run(()=>qa.store.state.cfg.unitCount),8);
    assert.equal(await run(()=>document.querySelectorAll('[data-block="line-length"]').length),8);
    assert.equal(await run(()=>document.querySelector('.in-add').disabled),true);
    assert.equal(await run(()=>document.querySelectorAll('.room').length),8);
    assert.equal(await run(()=>document.querySelectorAll('.indoor-probes .probe').length),16);
    assert.equal(await run(()=>document.querySelector('.scene-scroll').scrollHeight>document.querySelector('.scene-scroll').clientHeight),true);
    await run(()=>{document.querySelector('.scene-scroll').scrollTop=9999});
    const r=await run(()=>{const e=document.querySelector('[data-block="line-length"][data-branch="7"]'),box=e.getBoundingClientRect(),stage=document.querySelector('.scene-scroll').getBoundingClientRect();return {visible:box.top>=stage.top&&box.bottom<=stage.bottom}});
    assert.equal(r.visible,true);
    await run(()=>document.querySelectorAll('.rp-remove')[7].click());assert.equal(await run(()=>qa.store.state.cfg.unitCount),7);
    assert.equal(await run(()=>document.querySelector('.in-add').disabled),false);
  });
  await check('one/three/five room layouts keep length blocks and probe pills in the desktop viewport',async()=>{
    for(const [width,height] of [[1440,900],[1600,1000]]){
      await page.send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:false});
      for(const count of [1,3,5]){
        await page.evaluate(`qa.store.setUnitCount(${count});document.querySelector('.scene-scroll').scrollTop=0`);
        const bounds=await run(()=>[...document.querySelectorAll('[data-block="line-length"],.s-pill-g')].map(e=>{const r=e.getBoundingClientRect();return {x:r.x,y:r.y,right:r.right,bottom:r.bottom}}));
        assert.ok(bounds.every(r=>r.x>=0&&r.right<=width&&r.y>=72&&r.bottom<=height),JSON.stringify({width,count,bounds}));
        assert.ok(Number(await run(()=>document.querySelector('.scene').style.getPropertyValue('--flow-dur').replace('s','')))>=.65);
      }
    }
  });
  assert.equal(page.events.filter(e=>e.method==='Runtime.exceptionThrown').length,0);
  await writeFile('reviews/line-corridor-browser-results.json',JSON.stringify({checkedAt:new Date().toISOString(),checks},null,2)+'\n');
}finally{await page.close();await isolated.close()}
