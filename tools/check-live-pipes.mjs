// Actual advanced pipe selector and geometry reach the worker, without resetting stored room state.
import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { openPage } from './browser-session.mjs';
import { startIsolatedDev } from './isolated-dev.mjs';
const isolated=await startIsolatedDev(5179),page=await openPage(isolated.url);
const run=fn=>page.evaluate(`(${fn.toString()})()`),results=[];
const click=label=>page.evaluate(`(()=>{const b=[...document.querySelectorAll('button')].find(e=>e.textContent===${JSON.stringify(label)}&&e.getClientRects().length);if(!b||b.disabled)throw Error('Missing/enabled '+${JSON.stringify(label)});b.click()})()`);
try{
  await page.waitFor('!!document.querySelector(".scene")');
  await run(async()=>{
    const src=await fetch('/src/main.ts').then(r=>r.text());
    globalThis.qa=await import(src.match(/from "([^"]*\/state\.ts[^"]*)"/)[1]);
    globalThis.rt=await import(src.match(/from "([^"]*\/runtime\/view\.ts[^"]*)"/)[1]);
    globalThis.mapper=await import(src.match(/from "([^"]*\/runtime\/config\.ts[^"]*)"/)[1]);
    qa.store.update(s=>{s.ui.paused=true});qa.store.setExperience('live');
  });
  await page.waitFor('rt.simulation.status.state!=="loading"',30000);
  const step=async(seconds)=>{
    const before=await run(()=>rt.simulation.status.output.simulatedSeconds);
    assert.equal(await page.evaluate(`rt.simulation.step(${seconds})`),true);
    await page.waitFor(`rt.simulation.status.output?.state==='fault'||rt.simulation.status.output?.simulatedSeconds>=${before+seconds-1e-6}`,60000);
    const out=await run(()=>rt.simulation.status.output);assert.notEqual(out.state,'fault',out.diagnostics.fault??'physics fault');return out;
  };
  await step(1);
  const before=await run(()=>rt.simulation.status.output);
  await click('Pipes');await click('Physical (advanced)');
  await page.waitFor('rt.simulation.status.state!=="loading"',30000);
  assert.equal(await run(()=>qa.store.state.cfg.live.fieldLines),'physical');
  const config=await run(()=>mapper.engineConfigFromUi(qa.store.state.cfg,qa.store.state.cfg.live));
  assert.deepEqual(config.rooms.map(r=>r.pipe.lengthM),[14,6.5,7.5]);
  assert.ok(Math.abs(config.rooms[0].pipe.liquidInsideDiameterM-.00475)<1e-12);
  const configured=await run(()=>rt.simulation.status.output);
  assert.equal(configured.simulatedSeconds,before.simulatedSeconds);
  assert.ok(Math.abs(configured.rooms[0].temperatureC-before.rooms[0].temperatureC)<1e-9);
  const physical=await step(1);
  assert.ok(physical.cycle.pressureDropsPa.some(p=>p>0));
  assert.ok(Math.abs(physical.energy.residualJ)<1e-4);
  results.push({name:'native physical selector applies historical lengths, assumed bore and Darcy transport without reset',passed:true});
  console.log('PASS native physical selector applies finite line transport without reset');
  await run(()=>{const input=document.querySelector('#panel-pipes input.num');input.focus();input.value='3';input.dispatchEvent(new Event('input',{bubbles:true}));});
  await page.waitFor('rt.simulation.status.state!=="loading"',30000);await step(1);
  assert.equal(await run(()=>mapper.engineConfigFromUi(qa.store.state.cfg,qa.store.state.cfg.live).rooms[0].pipe.lengthM),3);
  await click('Idealized (reference)');await page.waitFor('rt.simulation.status.state!=="loading"',30000);
  const ideal=await step(1);assert.ok(ideal.cycle.pressureDropsPa.every(p=>p===0));
  results.push({name:'editable length reaches physics; reference mode excludes pipe friction and preserves scenario time',passed:true});
  assert.equal(ideal.simulatedSeconds,4);
  assert.equal(page.events.filter(e=>e.method==='Runtime.exceptionThrown').length,0);
  await writeFile('reviews/live-pipes-browser-results.json',JSON.stringify({checkedAt:new Date().toISOString(),checks:results},null,2)+'\n');
  console.log('PASS editable length and idealized reference preserve scenario time');
}finally{await page.close();await isolated.close()}
