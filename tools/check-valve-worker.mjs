// Actual-worker counterpart to the independent synthetic native-cycle renderer review.
import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {openPage} from './browser-session.mjs';
import {startIsolatedDev} from './isolated-dev.mjs';
const isolated=await startIsolatedDev(5218),checks=[];
try {
  for (const mode of ['heating','cooling']) {
    const suffix=mode==='heating'?'?room.first.target=24':'?outdoor=39&mode=cooling&room.ground.target=24&room.ground.temperature=28&room.first.target=24&room.first.temperature=28';
    const page=await openPage(isolated.url+suffix),run=fn=>page.evaluate(`(${fn.toString()})()`);
    try {
      await page.waitFor('!!document.querySelector(".scene")');
      await run(async()=>{
        const m=await fetch('/src/main.ts').then(r=>r.text());
        globalThis.qa=await import(m.match(/from "([^"]*\/state\.ts[^"]*)"/)[1]);
        globalThis.qv=await import(m.match(/from "([^"]*\/runtime\/view\.ts[^"]*)"/)[1]);
        globalThis.qi=await import('/src/inspector.ts');globalThis.qc=await import('/src/circuit.ts');
      });
      await page.waitFor('qv.simulation.status.output?.cycle&&qv.simulation.status.output.cycle.branchMassFlowsKgs.some(f=>f>0)',60000);
      await run(()=>qa.store.update(s=>s.ui.paused=true));
      await page.waitFor('!qv.simulation.isBusy',60000);
      // Let the subscribed renderer publish the last accepted worker output.
      await run(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
      const d=await run(()=>{
        const s=qa.store.state,rd=qv.readingsFor(s,'live'),cycle=rd.engine.cycle,heat=cycle.mode==='heating';
        const pipes=[];
        const check=(id,st,active)=>{
          const p=document.querySelector(`[data-seg="${id}"]`);
          pipes.push({id,expectedPhase:active?(st.phase==='two-phase'?'two':st.phase):'idle',phase:p.dataset.phase,
            expectedT:active?st.temperatureC.toFixed(1):'unknown',t:p.dataset.temp,
            expectedStroke:active?qc.tempColor(st.temperatureC):null,stroke:p.querySelector('.p-fill').getAttribute('stroke'),dir:Number(p.dataset.dir)});
        };
        check('liqHdr',heat?cycle.expansionOutlet:cycle.condenserOutlet,true);
        const inspectors=[];
        cycle.branchMassFlowsKgs.forEach((f,i)=>{
          check(`hdrStub:${i}`,heat?cycle.branchValveOutlets[i]:cycle.branchValveInlets[i],f>0);
          for(const k of ['fieldStub','liqField'])check(`${k}:${i}`,heat?cycle.branchValveInlets[i]:cycle.branchValveOutlets[i],f>0);
          const box=document.createElement('div');box.innerHTML=qi.inspectorHtml(`eev:${i}`,s);
          const rows=Object.fromEntries([...box.querySelectorAll('dl.rows>div')].map(e=>[e.querySelector('dt').textContent,e.querySelector('dd').textContent]));
          const expected=st=>`${qc.phaseLabel(st.phase==='two-phase'?'two':st.phase)} · ${st.temperatureC.toFixed(1)} °C · ${(s.ui.pressure==='abs'?st.pBarAbs:st.pBarAbs-1.01325).toFixed(2)} ${s.ui.pressure==='abs'?'bar(a)':'bar(g)'}`;
          inspectors.push({i,active:f>0,rows,expectedIn:f>0?expected(cycle.branchValveInlets[i]):null,expectedOut:f>0?expected(cycle.branchValveOutlets[i]):null,text:box.textContent});
        });
        return {mode:cycle.mode,time:rd.engine.timeS,epoch:qa.store.resetEpoch,pipes,inspectors,error:qv.simulation.status.error};
      });
      assert.equal(d.mode,mode);assert.equal(d.epoch,0);assert.ok(!d.error);
      for(const p of d.pipes){assert.equal(p.phase,p.expectedPhase,p.id);assert.equal(p.t,p.expectedT,p.id);if(p.expectedStroke)assert.equal(p.stroke,p.expectedStroke,p.id);else assert.equal(p.dir,0,p.id)}
      for(const v of d.inspectors){assert.match(v.text,/essentially constant refrigerant enthalpy/);if(v.active){assert.ok(v.rows.Upstream.replaceAll("−","-").includes(v.expectedIn),JSON.stringify(v));assert.ok(v.rows.Downstream.replaceAll("−","-").includes(v.expectedOut),JSON.stringify(v));assert.equal(v.rows['Flow direction'],mode==='heating'?'Field side → header side':'Header side → field side')}else{assert.equal(v.rows.Upstream,'—');assert.equal(v.rows.Downstream,'—');assert.equal(v.rows['Flow direction'],'None')}}
      assert.deepEqual(page.events.filter(e=>e.method==='Runtime.exceptionThrown'),[]);
      checks.push({name:`${mode}: actual worker PH states match materialized valve/header/field colours and inspector`,passed:true,...d});
      console.log(`PASS ${checks.at(-1).name}`);
    } finally {await page.close()}
  }
  const sourceHashes=Object.fromEntries(await Promise.all(['src/main.ts','src/runtime/view.ts','src/geometry.ts','src/inspector.ts','src/engine/cycle.ts','src/engine/types.ts'].map(async f=>[f,createHash('sha256').update(await readFile(`${isolated.sourceRoot}/${f}`)).digest('hex')])));
  await writeFile('reviews/valve-worker-browser-results.json',JSON.stringify({checkedAt:new Date().toISOString(),scope:'Actual initialized browser worker outputs; no injected cycles or altered thermodynamic states',sourceHashes,checks},null,2)+'\n');
} finally {await isolated.close()}
