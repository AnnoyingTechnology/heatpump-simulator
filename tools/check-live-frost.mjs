// Natural frost/defrost and retained inventory rendered from real worker output, without seeded ice.
import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { openPage } from './browser-session.mjs';
import { startIsolatedDev } from './isolated-dev.mjs';
const isolated=await startIsolatedDev(5178);
const page=await openPage(isolated.url);
const run=fn=>page.evaluate(`(${fn.toString()})()`);
const samples=[];
try{
  await page.waitFor('!!document.querySelector(".scene")');
  await page.send('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]});
  await run(async()=>{
    const src=await fetch('/src/main.ts').then(r=>r.text());
    globalThis.qa=await import(src.match(/from "([^"]*\/state\.ts[^"]*)"/)[1]);
    globalThis.rt=await import(src.match(/from "([^"]*\/runtime\/view\.ts[^"]*)"/)[1]);
    qa.store.update(s=>{s.ui.paused=true;s.cfg.outdoorC=3;s.cfg.outdoorRh=85;s.cfg.rooms.forEach(r=>{r.setpointC=23});});
    qa.store.setExperience('live');
  });
  await page.waitFor('rt.simulation.status.state!=="loading"',30000);
  let seenDefrost=false,returned=false,heldChecked=false,captured=false;
  for(let i=0;i<160;i++){
    const before=await run(()=>rt.simulation.status.output.simulatedSeconds);
    assert.equal(await run(()=>rt.simulation.step(5)),true);
    await page.waitFor(`rt.simulation.status.output?.state==='fault'||rt.simulation.status.output?.simulatedSeconds>=${before+5-1e-6}`,60000);
    const out=await run(()=>rt.simulation.status.output);
    samples.push({seconds:out.simulatedSeconds,state:out.state,iceKg:out.outdoor.iceKg,waterKg:out.outdoor.liquidKg,energyResidualJ:out.energy.residualJ,waterResidualKg:out.energy.waterResidualKg});
    if(out.state==='fault'){
      await writeFile('reviews/live-frost-browser-failure.json',JSON.stringify({checkedAt:new Date().toISOString(),output:out,samples},null,2)+'\n');
      assert.fail(out.diagnostics.fault??'physics fault');
    }
    assert.ok(Math.abs(out.energy.residualJ)<1e-4);assert.ok(Math.abs(out.energy.waterResidualKg)<1e-10);
    assert.equal(await run(()=>document.querySelector('.scene').dataset.ice),'live');
    await page.waitFor(`document.querySelector('.op .rp-grid:last-child .rp-cell:last-child .rp-v').textContent===${JSON.stringify(out.outdoor.iceKg.toFixed(3))}`);
    assert.equal(await run(()=>document.querySelector('.room-panel .rp-v').textContent),out.rooms[0].temperatureC.toFixed(1));
    if(!heldChecked&&out.outdoor.iceKg>.03){
      await run(()=>qa.store.update(s=>{s.cfg.outdoorC=60}));
      await page.waitFor('rt.simulation.status.state!=="loading"',30000);
      assert.equal(await run(()=>rt.simulation.status.state),'error');
      assert.equal(await run(()=>rt.simulation.inventory.outdoor.iceKg),out.outdoor.iceKg);
      await page.waitFor('document.querySelector(".scene").dataset.ice==="held"');
      assert.equal(await run(()=>document.querySelector('.scene').dataset.melting),'0');
      assert.match(await run(()=>document.querySelector('.chip-ice').textContent),/held/i);
      assert.equal(await run(()=>document.querySelector('.room-panel .rp-v').textContent),'—');
      await run(()=>qa.store.update(s=>{s.cfg.outdoorC=3}));
      await page.waitFor('rt.simulation.status.state!=="loading"',30000);
      assert.equal(await run(()=>rt.simulation.status.output.outdoor.iceKg),out.outdoor.iceKg);
      assert.equal(await run(()=>rt.simulation.status.output.simulatedSeconds),out.simulatedSeconds);
      heldChecked=true;console.log('PASS rejected configuration retains visible ice and correction preserves physical time/inventory');
    }
    if(!captured&&out.outdoor.iceKg>.05){
      const img=await page.send('Page.captureScreenshot',{format:'png',fromSurface:false,captureBeyondViewport:false});
      await writeFile('design/interface-live-frost.png',Buffer.from(img.data,'base64'));captured=true;
    }
    if(out.state==='defrost'&&!seenDefrost)console.log(`Natural defrost observed at ${out.simulatedSeconds}s`);
    if(out.state==='defrost')seenDefrost=true;
    if(seenDefrost&&out.state==='running'){returned=true;break;}
  }
  assert.ok(seenDefrost,'Natural automatic defrost must occur');assert.ok(returned,'Return to heating must complete');assert.ok(heldChecked);
  assert.equal(page.events.filter(e=>e.method==='Runtime.exceptionThrown').length,0);
  await writeFile('reviews/live-frost-browser-results.json',JSON.stringify({checkedAt:new Date().toISOString(),naturalDefrost:true,returnToHeating:true,heldInventory:true,samples},null,2)+'\n');
  console.log('PASS real worker frosting, automatic defrost and return to heating with matching vector/readout state');
}finally{await page.close();await isolated.close()}
