// Browser evidence for direct room controls, readable zone panels and cleanliness inheritance.
import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { openPage } from './browser-session.mjs';
import { startIsolatedDev } from './isolated-dev.mjs';
import { activateControl } from './browser-controls.mjs';

const isolated = await startIsolatedDev(5177);
const page = await openPage(isolated.url);
const results = [];
const run = fn => page.evaluate(`(${fn.toString()})()`);
const check = async (name, fn) => { await fn(); results.push({ name, passed: true }); console.log(`PASS ${name}`); };
const click = label => activateControl(page,label);
try {
  await page.waitFor('!!document.querySelector(".rp-range")');
  await page.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
  await run(async () => {
    const src = await fetch('/src/main.ts').then(r=>r.text());
    globalThis.qa = await import(src.match(/from "([^"]*\/state\.ts[^"]*)"/)[1]);
    globalThis.mapper = await import(src.match(/from "([^"]*\/runtime\/config\.ts[^"]*)"/)[1]);
    qa.store.update(s=>{s.ui.paused=true});
  });
  await click('Examples');
  await check('room setpoint slider supports keyboard input and preserves focus and weather', async () => {
    const before=await run(()=>[qa.store.state.cfg.outdoorC,qa.store.state.cfg.outdoorRh]);
    await run(()=>document.querySelector('.room-panel .rp-range').focus());
    await page.send('Input.dispatchKeyEvent',{type:'keyDown',key:'ArrowRight',code:'ArrowRight',windowsVirtualKeyCode:39});
    await page.send('Input.dispatchKeyEvent',{type:'keyUp',key:'ArrowRight',code:'ArrowRight',windowsVirtualKeyCode:39});
    assert.equal(await run(()=>qa.store.state.cfg.rooms[0].setpointC),21.5);
    assert.equal(await run(()=>document.activeElement===document.querySelector('.room-panel .rp-range')),true);
    assert.equal(await run(()=>document.querySelector('.room-panel .rp-num').value),'21.5');
    assert.deepEqual(await run(()=>[qa.store.state.cfg.outdoorC,qa.store.state.cfg.outdoorRh]),before);
    assert.equal(await run(()=>qa.store.state.ui.selected),null);
    await run(()=>{const e=document.querySelector('.room-panel .rp-num');e.focus();e.value='24.5';e.dispatchEvent(new Event('input',{bubbles:true}));});
    assert.equal(await run(()=>qa.store.state.cfg.rooms[0].setpointC),24.5);
    assert.equal(await run(()=>document.activeElement===document.querySelector('.room-panel .rp-num')),true);
  });
  await check('global cleanliness and per-coil overrides map to actual model inputs', async () => {
    await click('Equipment');
    const baseline=await run(()=>document.querySelector('.ribbon').innerText);
    await run(()=>{const e=document.querySelector('input.num[aria-label^="Heat-exchanger cleanliness (global)"]');e.value='70';e.dispatchEvent(new Event('input',{bubbles:true}));});
    await run(()=>{const box=document.querySelector('#panel-equipment .clean-override input[type=checkbox]');box.click();const e=document.querySelector('input.num[aria-label^="Outdoor coil cleanliness override"]');e.value='80';e.dispatchEvent(new Event('input',{bubbles:true}));});
    await click('Rooms');
    await run(()=>{const box=document.querySelector('#panel-rooms .clean-override input[type=checkbox]');box.click();const e=document.querySelector('input.num[aria-label^="Indoor coil cleanliness override"]');e.value='30';e.dispatchEvent(new Event('input',{bubbles:true}));});
    const fractions=await run(()=>{const c=qa.store.state.cfg,e=mapper.engineConfigFromUi(c,c.live);return [e.outdoor.cleanFraction,...e.rooms.map(r=>r.cleanFraction)];});
    assert.deepEqual(fractions,[.8,.3,.7,.7]);
    assert.equal(await run(()=>document.querySelector('.ribbon').innerText),baseline);
    const titles=await run(()=>[...document.querySelectorAll('.scene .dirt title')].map(e=>e.textContent));
    assert.ok(titles.some(t=>/Outdoor coil cleanliness 80.*override/.test(t)));
    assert.ok(titles.some(t=>/Attic indoor coil cleanliness 30.*override/.test(t)));
    assert.ok(titles.some(t=>/First floor indoor coil cleanliness 70.*global/.test(t)));
    await run(()=>document.querySelector('#panel-rooms .clean-override input[type=checkbox]').click());
    assert.equal(await run(()=>qa.store.state.cfg.rooms[0].cleanlinessOverridePct),null);
    await click('Equipment');
    await run(()=>document.querySelector('#panel-equipment .clean-override input[type=checkbox]').click());
    assert.equal(await run(()=>qa.store.state.cfg.live.outdoorCleanlinessOverridePct),null);
  });
  await check('cleanliness endpoints show independent vector fouling without raster assets',async()=>{
    for(const value of [10,100]){
      await page.evaluate(`(()=>{const e=document.querySelector('input.num[aria-label^="Heat-exchanger cleanliness (global)"]');e.value='${value}';e.dispatchEvent(new Event('input',{bubbles:true}));})()`);
      const display=await run(()=>[...document.querySelectorAll('.scene .dirt')].map(e=>e.getAttribute('display')));
      assert.ok(display.every(v=>v===(value===100?'none':'inline')));
    }
    assert.equal(await run(()=>document.querySelectorAll('img,image,canvas').length),0);
  });
  await check('one to five room panels fit and keep direct setpoints visible at desktop sizes',async()=>{
    for(const [width,height] of [[1440,900],[1600,1000]]){
      await page.send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:false});
      for(const count of [1,3,5]){
        await page.evaluate(`qa.store.setUnitCount(${count})`);
        const sizes=await run(()=>[...document.querySelectorAll('.room-panel .rp')].map(e=>{const r=e.getBoundingClientRect(),a=e.querySelector('.rp-range').getBoundingClientRect();return {fit:e.scrollWidth<=e.clientWidth&&e.scrollHeight<=e.clientHeight,visible:r.left>=0&&r.right<=innerWidth&&a.top>=0&&a.bottom<=innerHeight};}));
        assert.equal(sizes.length,count);assert.ok(sizes.every(s=>s.fit&&s.visible),JSON.stringify({width,height,count,sizes}));
      }
      await run(()=>qa.store.loadExample('heating','frost'));
      assert.ok(await run(()=>document.querySelector('.ov-top').getBoundingClientRect().height<150),'Header must not shrink five-room diagram through excessive wrapping');
    }
  });
  assert.equal(page.events.filter(e=>e.method==='Runtime.exceptionThrown').length,0);
  await writeFile('reviews/room-controls-browser-results.json',JSON.stringify({checkedAt:new Date().toISOString(),checks:results},null,2)+'\n');
  console.log(`${results.length} room and cleanliness browser checks passed`);
} finally { await page.close(); await isolated.close(); }
