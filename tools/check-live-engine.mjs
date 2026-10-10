// Real-browser worker/WASM integration checks. Scientific engine assertions live in tests/engine.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve, extname } from 'node:path';
import { openPage } from './browser-session.mjs';
import { startIsolatedDev } from './isolated-dev.mjs';
import { activateControl } from './browser-controls.mjs';

const results=[];
const isolated = await startIsolatedDev();
const page=await openPage(isolated.url);
let server;
const check=async(name,fn)=>{await fn();results.push({name,passed:true});console.log(`PASS ${name}`)};
const run=fn=>page.evaluate(`(${fn.toString()})()`);
const click=label=>activateControl(page,label);
try{
  await page.waitFor('!!document.querySelector(".scene")');
  await run(async()=>{
    const source=await fetch('/src/main.ts').then(r=>r.text());
    globalThis.__qaStateModule=await import(source.match(/from "([^"]*\/state\.ts[^"]*)"/)[1]);
    globalThis.__qaRuntimeModule=await import(source.match(/from "([^"]*\/runtime\/view\.ts[^"]*)"/)[1]);
    __qaStateModule.store.update(s=>{s.ui.paused=true});
  });
  await click('Live');
  await page.waitFor('!__qaRuntimeModule.simulation.isBusy&&__qaRuntimeModule.simulation.status.state!=="loading"',30000);
  assert.equal(await run(()=>__qaRuntimeModule.simulation.status.state),'ready');
  const step=async(seconds)=>{
    // Bound each request while preserving the exact scenario horizon. Safe EOS flashes
    // are CPU-limited; one large QA batch must not be mistaken for a stalled worker.
    let output;
    for(let remaining=seconds;remaining>1e-9;){
      const chunk=Math.min(5,remaining);
      const before=await run(()=>__qaRuntimeModule.simulation.status.output.simulatedSeconds);
      assert.equal(await page.evaluate(`__qaRuntimeModule.simulation.step(${chunk})`),true);
      await page.waitFor(`__qaRuntimeModule.simulation.status.output?.state==='fault'||__qaRuntimeModule.simulation.status.output?.simulatedSeconds>=${before+chunk-1e-6}`,60000);
      const status=await run(()=>__qaRuntimeModule.simulation.status);
      assert.equal(status.output.state==='fault',false,status.output.diagnostics.fault??'physics fault');
      output=status.output;remaining-=chunk;
    }
    return output;
  };
  const configured=()=>page.waitFor('!__qaRuntimeModule.simulation.isBusy&&__qaRuntimeModule.simulation.status.state!=="loading"',30000);
  await check('real local property backend runs in the worker and returns live cycle data',async()=>{
    const output=await step(30);
    assert.ok(output.cycle&&output.cycle.totalMassFlowKgs>0);
    assert.ok(output.cycle.highPressureBarAbs>output.cycle.lowPressureBarAbs);
    assert.ok(output.rooms.every(r=>Number.isFinite(r.temperatureC)));
    assert.equal(await run(()=>document.querySelectorAll('img,canvas,image').length),0);
    assert.match(await run(()=>document.body.innerText),/generic/i);
    const screenshot=await page.send('Page.captureScreenshot',{format:'png',fromSurface:false,captureBeyondViewport:false});
    await writeFile('design/interface-live.png',Buffer.from(screenshot.data,'base64'));
  });
  await check('weather and room controls configure live physics without replacing focused inputs',async()=>{
    const before=await run(()=>__qaRuntimeModule.simulation.status.output);
    const focus=await run(()=>{
      const input=document.querySelector('input[aria-label="Outdoor temperature [°C]"]');input.focus();input.value='0';input.dispatchEvent(new Event('input',{bubbles:true}));return document.activeElement===input;
    });
    assert.equal(focus,true);await configured();const after=await step(20);
    assert.ok(Math.abs(after.outdoor.metalTemperatureC-before.outdoor.metalTemperatureC)>.01);
    assert.equal(await run(()=>document.activeElement?.getAttribute('aria-label')),'Outdoor temperature [°C]');
    await click('Pipes');await run(()=>document.querySelector('.scene [data-id="indoor:1"]').dispatchEvent(new MouseEvent('click',{bubbles:true})));
    assert.equal(await run(()=>__qaStateModule.store.state.ui.tab),'rooms');
    await run(()=>__qaStateModule.store.update(s=>{s.cfg.rooms[1].setpointC=24;s.cfg.rooms[1].heatLossWPerK=120}));await configured();
    const room=await step(10);assert.equal(room.rooms[1].setpointC,24);
  });
  await check('live heating/cooling mode preserves edited weather and uses real automatic reversal',async()=>{
    const weather=await run(()=>[__qaStateModule.store.state.cfg.outdoorC,__qaStateModule.store.state.cfg.outdoorRh]);
    await click('Cooling');await configured();
    assert.deepEqual(await run(()=>[__qaStateModule.store.state.cfg.outdoorC,__qaStateModule.store.state.cfg.outdoorRh]),weather);
    await run(()=>__qaStateModule.store.update(s=>{s.cfg.outdoorC=30;s.cfg.outdoorRh=50;s.cfg.rooms.forEach(r=>{r.setpointC=18})}));await configured();
    const output=await step(60);assert.equal(output.requestedMode,'cooling');assert.equal(output.cycle?.mode,'cooling');
    assert.equal(await run(()=>document.querySelector('.scene').dataset.fm),'cooling');
    assert.match(await run(()=>document.body.innerText),/Cooling COP/i);
  });
  await check('five-room live readings use actual branch outputs and complete vector connections',async()=>{
    await run(()=>__qaStateModule.store.setUnitCount(5));await configured();
    const output=await step(10);assert.equal(output.rooms.length,5);assert.equal(output.cycle.branchMassFlowsKgs.length,5);
    const sum=output.rooms.reduce((n,r)=>n+r.signedRoomHeatW,0);assert.ok(Math.abs(sum-output.signedRoomHeatW)<1e-8);
    assert.equal(await run(()=>document.querySelectorAll('.scene [data-id^="indoor:"]').length),5);
    const phases=await run(()=>{
      const r=__qaStateModule.currentReadings(__qaStateModule.store.state),c=__qaRuntimeModule.simulation.status.output.cycle;
      return c.branchOutlets.map((state,i)=>({actual:state.phase==='two-phase'?'two':state.phase,
        coil:__qaRuntimeModule.segmentFor(`inG:${i}`,r).phase,stub:__qaRuntimeModule.segmentFor(`gasStub:${i}`,r).phase}));
    });
    for(const p of phases){assert.equal(p.coil,p.actual);assert.equal(p.stub,p.actual);}
    assert.equal(output.cycle.suction.phase,'vapor');
    await run(()=>document.querySelector('.scene [data-id="indoor:0"]').dispatchEvent(new MouseEvent('click',{bubbles:true})));
    assert.match(await run(()=>document.querySelector('.ins-body').innerText),/Actual branch refrigerant inlet \/ outlet/i);
    assert.match(await run(()=>document.querySelector('.ins-body').innerText),/kJ\/kg/);
  });
  await check('failed physics clears pressures, COP and outlets and an input correction recovers',async()=>{
    await run(()=>__qaStateModule.store.update(s=>{s.cfg.outdoorC=60}));await configured();
    assert.equal(await run(()=>__qaRuntimeModule.simulation.status.state),'error');
    assert.equal(await run(()=>__qaRuntimeModule.simulation.status.output),null);
    const visible=await run(()=>document.querySelector('.ribbon').innerText);assert.match(visible,/—/);
    await run(()=>__qaStateModule.store.update(s=>{s.cfg.outdoorC=30}));await configured();assert.equal(await run(()=>__qaRuntimeModule.simulation.status.state),'ready');
  });
  await check('examples remain separate and switching does not mislabel fixed readings as live',async()=>{
    await click('Examples');assert.match(await run(()=>document.body.innerText),/illustrative/i);
    await click('Heating');assert.equal(await run(()=>document.querySelector('.scene').dataset.fm),'heating');
    await click('Live');await configured();assert.equal(await run(()=>__qaStateModule.store.state.ui.experience),'live');
  });
  await check('production worker and WASM load beneath a GitHub Pages style subdirectory',async()=>{
    const root=resolve('dist');
    server=createServer(async(req,res)=>{
      const path=new URL(req.url,'http://localhost').pathname;if(!path.startsWith('/heatpump-simulator/')){res.writeHead(404);res.end();return}
      const relative=decodeURIComponent(path.slice('/heatpump-simulator/'.length))||'index.html';const file=resolve(root,relative);
      if(!file.startsWith(`${root}/`)){res.writeHead(403);res.end();return}
      try{const data=await readFile(file);const mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.wasm':'application/wasm'}[extname(file)]??'application/octet-stream';res.writeHead(200,{'Content-Type':mime});res.end(data)}catch{res.writeHead(404);res.end()}
    });
    await new Promise(resolve=>server.listen(5175,'127.0.0.1',resolve));
    const production=await openPage('http://127.0.0.1:5175/heatpump-simulator/');
    try{
      await production.waitFor('!!document.querySelector(".scene")');
      await activateControl(production,'Live');
      await production.waitFor(`/running/i.test(document.body.innerText)`,60000);
      assert.equal(production.events.filter(e=>e.method==='Runtime.exceptionThrown').length,0);
      const failed=production.events.filter(e=>e.method==='Network.responseReceived'&&e.params.response.status>=400);assert.deepEqual(failed.map(e=>e.params.response.url),[]);
    }finally{await production.close()}
  });
  assert.equal(page.events.filter(e=>e.method==='Runtime.exceptionThrown').length,0);
  await writeFile('reviews/live-browser-results.json',JSON.stringify({checkedAt:new Date().toISOString(),checks:results},null,2)+'\n');
  console.log(`${results.length} live browser checks passed`);
}finally{await page.close();if(server)await new Promise(resolve=>{server.close(resolve);server.closeAllConnections();});await isolated.close()}
