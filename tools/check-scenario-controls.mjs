// Real-worker continuity, room identity/line pairing, declared capacity and config-preserving restart.
import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {openPage} from './browser-session.mjs';
import {startIsolatedDev} from './isolated-dev.mjs';

const isolated=await startIsolatedDev(5183),page=await openPage(isolated.url),results=[];
const run=fn=>page.evaluate(`(${fn.toString()})()`);
const settled=()=>page.waitFor('!qv.simulation.isBusy&&qv.simulation.status.state!=="loading"',30000);
const check=async(name,fn)=>{await fn();results.push({name,passed:true});console.log(`PASS ${name}`)};
const step=async()=>{
  await settled();const before=await run(()=>qv.simulation.status.output.simulatedSeconds);
  assert.equal(await run(()=>qv.simulation.step(.25)),true);await settled();
  const st=await run(()=>qv.simulation.status);
  assert.equal(st.state,'ready');assert.notEqual(st.output.state,'fault',st.output.diagnostics.fault);
  assert.equal(st.output.simulatedSeconds,before+.25);return st.output;
};
try{
  await page.waitFor('!!document.querySelector(".scene")');
  await run(async()=>{
    const m=await fetch('/src/main.ts').then(r=>r.text());
    globalThis.qa=await import(m.match(/from "([^"]*\/state\.ts[^"]*)"/)[1]);
    globalThis.qv=await import(m.match(/from "([^"]*\/runtime\/view\.ts[^"]*)"/)[1]);
    qa.store.update(s=>{s.ui.paused=true});
  });
  await step();
  await check('indoor On/Off retains calculated values without blanking, resetting time or other rooms',async()=>{
    const previous=await run(()=>qv.simulation.status.output);
    const transition=await run(()=>{
      const before=qv.simulation.status.output;
      const values=[...document.querySelectorAll('.hd-metrics .v')].map(e=>e.textContent);
      document.querySelector('.scene input[role=switch]').click();
      return {retained:qv.simulation.status.output===before,state:qv.simulation.status.state,
        valuesUnchanged:JSON.stringify(values)===JSON.stringify([...document.querySelectorAll('.hd-metrics .v')].map(e=>e.textContent)),
        marker:document.querySelector('.opstate').textContent};
    });
    assert.equal(transition.retained,true);assert.equal(transition.valuesUnchanged,true);
    assert.equal(transition.state,'updating');assert.match(transition.marker,/Last calculated step/i);
    await settled();assert.equal(await run(()=>qv.simulation.status.output.simulatedSeconds),previous.simulatedSeconds);
    const off=await step();assert.equal(off.rooms[0].massFlowKgs,0);assert.equal(off.rooms[0].fanPowerW,0);assert.equal(off.rooms[0].airOutletC,null);
    assert.ok(off.cycle.branchMassFlowsKgs.slice(1).every(v=>v>0));
    assert.ok(off.rooms.every((r,i)=>Math.abs(r.temperatureC-previous.rooms[i].temperatureC)<.1));
    await run(()=>document.querySelector('.scene input[role=switch]').click());
    const on=await step();assert.ok(on.rooms[0].massFlowKgs>0);assert.ok(on.rooms[0].fanPowerW>0);
    assert.ok(on.rooms.every((r,i)=>r.id===off.rooms[i].id&&Math.abs(r.temperatureC-off.rooms[i].temperatureC)<.1));
  });
  await check('declared generic capacity permits six rooms and actual six-branch live operation',async()=>{
    await run(()=>{qa.store.setOutdoorKind('generic');qa.store.setGenericPortCapacity(6);qa.store.setUnitCount(6)});
    const out=await step();assert.equal(out.rooms.length,6);assert.equal(out.cycle.branchInlets.length,6);
    assert.ok(out.cycle.branchMassFlowsKgs.every(v=>v>0));assert.equal(new Set(out.rooms.map(r=>r.id)).size,6);
    await run(()=>qa.store.addRoom());assert.equal(await run(()=>qa.store.state.cfg.unitCount),6);
  });
  await check('removing a middle room preserves surviving thermal identity, matching lines and physical time',async()=>{
    const before=await run(()=>({out:qv.simulation.status.output,
      rooms:qa.store.state.cfg.rooms.slice(0,6),pipes:qa.store.state.cfg.pipes.slice(0,6)}));
    await run(()=>{qa.store.update(s=>{s.ui.selected='indoor:4'});qa.store.removeRoom(1)});
    await settled();const configured=await run(()=>qv.simulation.status.output);
    assert.equal(configured.simulatedSeconds,before.out.simulatedSeconds);
    const ids=before.rooms.filter((_,i)=>i!==1).map(r=>r.id);
    assert.deepEqual(configured.rooms.map(r=>r.id),ids);
    configured.rooms.forEach(r=>assert.ok(Math.abs(r.temperatureC-before.out.rooms.find(old=>old.id===r.id).temperatureC)<1e-9));
    assert.deepEqual(await run(()=>qa.store.state.cfg.pipes.slice(0,5)),before.pipes.filter((_,i)=>i!==1));
    assert.equal(await run(()=>qa.store.state.ui.selected),'indoor:3');
    const out=await step();assert.ok(Math.abs(out.energy.residualJ)<1e-3);assert.ok(Math.abs(out.energy.waterResidualKg)<1e-10);
    await run(()=>qa.store.addRoom());await settled();
    assert.equal(await run(()=>qa.store.state.cfg.rooms[5].id),before.rooms[1].id);
    assert.deepEqual(await run(()=>qa.store.state.cfg.pipes[5]),before.pipes[1]);
  });
  await check('restart applies edited initial temperature while retaining weather and room parameters',async()=>{
    await run(()=>qa.store.update(s=>{s.cfg.rooms[0].airC=17;s.cfg.rooms[0].volumeM3=67;s.cfg.outdoorC=5}));
    await settled();const cfg=await run(()=>qa.store.state.cfg);
    await run(()=>qa.store.restartSimulation());await settled();
    assert.deepEqual(await run(()=>qa.store.state.cfg),cfg);
    const out=await run(()=>qv.simulation.status.output);assert.equal(out.simulatedSeconds,0);assert.equal(out.outdoor.filmMassKg,0);
    assert.ok(Math.abs(out.rooms[0].temperatureC-17)<1e-6);
  });
  assert.equal(page.events.filter(e=>e.method==='Runtime.exceptionThrown').length,0);
  await writeFile('reviews/scenario-controls-browser-results.json',JSON.stringify({checkedAt:new Date().toISOString(),method:'Real worker and self-hosted EOS; configuration continuity',checks:results},null,2)+'\n');
}finally{await page.close();await isolated.close()}
