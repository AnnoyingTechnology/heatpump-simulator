// Milestone QA: real browser interactions and static subdirectory hosting.
// Run after npm run build, with the local dev server and isolated QA Chromium running.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve, extname } from 'node:path';
import { openPage } from './browser-session.mjs';

const results = [];
async function check(name, fn) {
  await fn();
  results.push({ name, passed: true });
  console.log(`PASS ${name}`);
}
const page = await openPage('http://127.0.0.1:5173/');
let server;
try {
  await page.waitFor('!!document.querySelector(".scene")');
  const run = (fn) => page.evaluate(`(${fn.toString()})()`);
  const click = (label) => page.evaluate(`(() => {
    const b=[...document.querySelectorAll('button')].find(e=>e.textContent===${JSON.stringify(label)} && e.getClientRects().length);
    if(!b) throw new Error('Missing visible button: '+${JSON.stringify(label)});
    if(b.disabled) throw new Error('Disabled button: '+${JSON.stringify(label)});
    b.click();
  })()`);
  await run(async () => {
    const source=await fetch('/src/main.ts').then(r=>r.text());
    const url=source.match(/from \"([^\"]*\/state\.ts[^\"]*)\"/)[1];
    globalThis.__qaStateModule=await import(url);
  });
  await click('Examples');
  await click('Pause');
  await check('vector-only frontend with no runtime exceptions', async () => {
    assert.equal(await run(() => document.querySelectorAll('img,canvas,image').length), 0);
    assert.equal(page.events.filter(e => e.method === 'Runtime.exceptionThrown').length, 0);
  });
  await check('desktop layout and all sidebar tabs fit', async () => {
    for (const width of [1440,1600]) {
      await page.send('Emulation.setDeviceMetricsOverride', {width,height:1000,deviceScaleFactor:1,mobile:false});
      assert.equal(await run(() => document.documentElement.scrollWidth > innerWidth), false);
      assert.equal(await run(() => [...document.querySelectorAll('.topbar button')].every(e => {
        const r=e.getBoundingClientRect();return r.left>=0 && r.right<=innerWidth;
      })),true);
      assert.equal(await run(() => [...document.querySelectorAll('.sidebar .tab')].every(e => {
        const a=e.getBoundingClientRect(),b=document.querySelector('.sidebar').getBoundingClientRect();
        return a.left>=b.left && a.right<=b.right;
      })), true);
    }
  });
  await check('outdoor sliders remain available on every tab and with the drawer open',async()=>{
    for(const [width,height] of [[1440,900],[1600,1000]]){
      await page.send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:false});
      for(const label of ['Rooms','Equipment','Pipes','Advanced']){
        await click(label);
        const visible=await run(()=>['Outdoor temperature [°C]','Outdoor humidity [% RH]'].every(label=>{
          const el=document.querySelector(`input[aria-label="${label}"]`);
          if(!el||!el.getClientRects().length)return false;
          const r=el.getBoundingClientRect();return r.top>=0&&r.bottom<=innerHeight&&r.right<=innerWidth;
        }));
        assert.equal(visible,true,`${label} at ${width}x${height}`);
      }
      await click('Diagnostics and examples');
      assert.equal(await run(()=>['Outdoor temperature [°C]','Outdoor humidity [% RH]'].every(label=>{
        const el=document.querySelector(`input[aria-label="${label}"]`);const r=el.getBoundingClientRect();
        return el.getClientRects().length>0&&r.top>=0&&r.bottom<=innerHeight;
      })),true);
      await click('Diagnostics and examples');
    }
  });
  await check('scene uses clear zones without architectural decoration',async()=>{
    assert.equal(await run(()=>document.querySelectorAll('.scene .furn,.scene .window,.scene .rafter,[id="pBrick"],[id="pTile"],[id="gRoof"],[id="gSoil"]').length),0);
    const zones=await run(()=>[...document.querySelectorAll('.scene .zone-title')].map(e=>e.textContent.toUpperCase()));
    assert.ok(zones.includes('OUTDOOR'));assert.ok(zones.includes('INDOOR'));
  });
  await check('heating/cooling reversal, field phases and gauge convention', async () => {
    const heat=await run(async () => {
      const {store}=globalThis.__qaStateModule;
      const {fixtureFor}=await import('/src/fixtures.ts');
      const {segState,valvePairs}=await import('/src/circuit.ts');
      const c=fixtureFor('heating','normal').cycle;
      return {phase:segState('liqField:0','heating',c).phase,pairs:valvePairs('heating','heating')};
    });
    assert.equal(heat.phase,'liquid');assert.equal(heat.pairs.a,'D–I');
    await click('Cooling');
    assert.equal(await run(() => document.querySelector('.scene').dataset.fm),'cooling');
    assert.equal(await run(() => document.body.innerText.includes('COOLING COP')),true);
    const cool=await run(async () => {
      const {fixtureFor}=await import('/src/fixtures.ts');
      const {segState,valvePairs}=await import('/src/circuit.ts');
      return {phase:segState('liqField:0','cooling',fixtureFor('cooling','normal').cycle).phase,pairs:valvePairs('cooling','cooling')};
    });
    assert.equal(cool.phase,'two');assert.equal(cool.pairs.a,'D–O');
    await click('Advanced');await click('bar(g)');
    assert.equal(await run(() => document.body.innerText.includes('9.10bar(g)')),true);
    await click('bar(a)');
    await click('Heating');
  });
  await check('configuration inputs stay separate from readings and retain focus', async () => {
    const result=await run(() => {
      const input=document.querySelector('input[aria-label="Outdoor temperature [°C]"]');
      input.focus();input.value='-8';input.dispatchEvent(new Event('input',{bubbles:true}));
      return {focused:document.activeElement===input,body:document.body.innerText};
    });
    assert.equal(result.focused,true);assert.match(result.body,/Differs from fixture: outdoor air/);
    assert.match(result.body,/5\.98kW/);
    await click('Match fixture');
  });
  await check('one room click opens its editable inputs',async()=>{
    await click('Pipes');
    await run(()=>document.querySelector('.scene [data-id="indoor:2"]').dispatchEvent(new MouseEvent('click',{bubbles:true})));
    assert.equal(await run(()=>document.querySelector('#tab-rooms').getAttribute('aria-selected')),'true');
    assert.equal(await run(()=>document.querySelector('#panel-rooms').hidden),false);
    assert.equal(await run(()=>globalThis.__qaStateModule.store.state.ui.selected),'indoor:2');
  });
  await check('owner three-port constraint and complete five-room routing', async () => {
    await click('Equipment');await click('5');
    assert.equal(await run(() => document.querySelectorAll('.scene [data-id^="indoor:"]').length),5);
    assert.equal(await run(() => document.querySelectorAll('.scene [data-id^="eev:"]').length),5);
    assert.equal(await run(async () => (globalThis.__qaStateModule).store.state.cfg.outdoorKind),'generic');
    const sums=await run(async () => {
      const {store,activeRooms}=globalThis.__qaStateModule;
      const {fixtureFor,branchReadings}=await import('/src/fixtures.ts');
      return ['normal','frost','defrost','idle'].map(ex=>{
        const f=fixtureFor('heating',ex);const branches=branchReadings(f,activeRooms(store.state.cfg));
        return {sum:branches.reduce((s,b)=>s+b.roomKw,0),total:f.roomKwTotal};
      });
    });
    for(const s of sums) if(s.total!==null) assert.ok(Math.abs(s.sum-s.total)<1e-9);
    await run(async () => (globalThis.__qaStateModule).store.update(s=>{s.ui.selected='indoor:4'}));
    await click('3');
    assert.equal(await run(async () => (globalThis.__qaStateModule).store.state.ui.selected),null);
    await run(() => {const sel=[...document.querySelectorAll('#panel-equipment select')].find(s=>[...s.options].some(o=>o.value==='owner'));sel.value='owner';sel.dispatchEvent(new Event('change',{bubbles:true}));});
  });
  await check('pipe diameter redraw, length provenance and minimum guidance', async () => {
    await click('Pipes');
    await run(() => {
      const sel=[...document.querySelectorAll('#panel-pipes select')].find(s=>s.previousElementSibling?.textContent.includes('Gas'));
      if(!sel) throw new Error('Gas OD selector absent');
      sel.value='15.88';sel.dispatchEvent(new Event('change',{bubbles:true}));
      const input=document.querySelector('#panel-pipes input[type="number"]');
      input.value='1';input.dispatchEvent(new Event('input',{bubbles:true}));
    });
    assert.equal(await run(async () => (globalThis.__qaStateModule).store.state.cfg.pipes[0].gasOdMm),15.88);
    const text=await run(() => document.body.innerText);
    assert.match(text,/edited by you/);assert.match(text,/3 m|3–25|3\.0/);
  });
  await check('stop valves distinct from EEVs', async () => {
    const labels=await run(() => [...document.querySelectorAll('.scene [data-id]')].map(e=>e.getAttribute('aria-label')));
    assert.ok(labels.some(s=>/gas stop/i.test(s)));assert.ok(labels.some(s=>/liquid stop/i.test(s)));
  });
  await click('Reset');await click('Pause');
  await check('frost caution appears once across repeated renders',async()=>{
    await click('Frosting');
    await run(async()=>{const {store}=globalThis.__qaStateModule;store.emit();store.emit();store.emit();});
    assert.equal(await run(()=>document.querySelectorAll('.mismatch .fnote').length),1);
    await click('Normal');
    assert.equal(await run(()=>document.querySelectorAll('.mismatch .fnote').length),0);
  });
  await check('defrost suppresses useful COP and stopped-fan outlet readings', async () => {
    await click('Defrost');
    const data=await run(async () => {
      const {fixtureFor}=await import('/src/fixtures.ts');const f=fixtureFor('heating','defrost');
      return {cop:f.cop,air:f.outdoorOutletC,body:document.body.innerText};
    });
    assert.equal(data.cop,null);assert.equal(data.air,null);assert.match(data.body,/fan off/i);
  });
  await check('preview melt transfers mass, survives mode changes, and reset clears it', async () => {
    await page.send('Page.bringToFront');
    const before=await run(async () => {
      const {store}=globalThis.__qaStateModule;
      store.clock.iceKg=0.001;store.clock.retainedWaterKg=0;store.update(s=>{s.ui.speed=10;s.ui.paused=false});
      return store.clock.iceKg;
    });
    // Concurrent isolated browser targets can throttle animation frames; wait for
    // actual exhaustion instead of assuming a fixed wall-clock sleep is enough.
    await page.waitFor('globalThis.__qaStateModule.store.clock.iceKg===0',10000);
    await run(async () => (globalThis.__qaStateModule).store.update(s=>{s.ui.paused=true}));
    const melted=await run(async () => ({...(globalThis.__qaStateModule).store.clock}));
    assert.equal(melted.iceKg,0);assert.ok(Math.abs(melted.retainedWaterKg-before)<1e-12);
    await click('Idle');await click('Cooling');
    const retained=await run(async () => ({...(globalThis.__qaStateModule).store.clock}));
    assert.equal(retained.retainedWaterKg,melted.retainedWaterKg);
    assert.equal(retained.iceKg,0);
    await click('Reset');
    const reset=await run(async () => ({...(globalThis.__qaStateModule).store.clock}));
    assert.equal(reset.iceKg,0);assert.equal(reset.retainedWaterKg,0);
  });
  await check('idle avoids invented pressures and air outlet values', async () => {
    await click('Idle');
    const f=await run(async () => (await import('/src/fixtures.ts')).fixtureFor('heating','idle'));
    assert.equal(f.cycle,null);assert.equal(f.cop,null);assert.equal(f.outdoorOutletC,null);
  });
  await check('scenario drawer controls and keyboard tab wrapping', async () => {
    await click('Diagnostics and examples');
    await run(()=>[...document.querySelectorAll('.drawer [role="tab"]')].find(e=>e.textContent==='Examples').click());
    await run(() => document.querySelector('[data-fixture="cooling-normal"]').click());
    assert.equal(await run(() => document.querySelector('.scene').dataset.fm),'cooling');
    await run(()=>{
      const tabs=[...document.querySelectorAll('.sidebar [role="tab"]')];
      tabs[0].click();tabs[0].dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowLeft',bubbles:true}));
    });
    assert.equal(await run(()=>[...document.querySelectorAll('.sidebar [role="tab"]')].at(-1).getAttribute('aria-selected')),'true');
  });

  server=createServer(async (req,res)=>{
    try{
      const url=new URL(req.url,'http://localhost');
      if(!url.pathname.startsWith('/heatpump-simulator/')){res.writeHead(404).end();return;}
      const rel=decodeURIComponent(url.pathname.slice('/heatpump-simulator/'.length))||'index.html';
      const file=resolve('dist',rel);
      if(!file.startsWith(resolve('dist')+'/')){res.writeHead(403).end();return;}
      const mime={'.html':'text/html','.css':'text/css','.js':'text/javascript'}[extname(file)]||'application/octet-stream';
      res.writeHead(200,{'Content-Type':mime});res.end(await readFile(file));
    }catch{res.writeHead(404).end();}
  });
  await new Promise(r=>server.listen(5175,'127.0.0.1',r));
  await check('production build loads under GitHub Pages style subdirectory', async () => {
    const prod=await openPage('http://127.0.0.1:5175/heatpump-simulator/');
    try{
      await prod.waitFor('!!document.querySelector(".scene")');
      assert.equal(prod.events.filter(e=>e.method==='Runtime.exceptionThrown').length,0);
      const failures=prod.events.filter(e=>e.method==='Network.responseReceived' && e.params.response.status>=400);
      assert.deepEqual(failures,[]);
      assert.equal(await prod.evaluate('document.querySelectorAll("img,canvas,image").length'),0);
    }finally{await prod.close();}
  });
  await writeFile('reviews/interface-browser-results.json',JSON.stringify({checkedAt:new Date().toISOString(),results},null,2)+'\n');
  console.log(`${results.length} browser checks passed`);
} finally {
  await page.close();
  if(server)await new Promise(r=>server.close(r));
}
