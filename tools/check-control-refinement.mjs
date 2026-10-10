// Actual worker and rendered controls: direct weather, stable updates, individual Off, independent pipe encodings.
import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { openPage } from './browser-session.mjs';
import { startIsolatedDev } from './isolated-dev.mjs';

const isolated=await startIsolatedDev(5180);
const page=await openPage(isolated.url);
const results=[];
const run=fn=>page.evaluate(`(${fn.toString()})()`);
const check=async(name,fn)=>{await fn();results.push({name,passed:true});console.log(`PASS ${name}`)};
const settled=()=>page.waitFor('!qv.simulation.isBusy&&qv.simulation.status.state!=="loading"',30000);
const step=async()=>{
  await settled();
  const before=await run(()=>qv.simulation.status.output.simulatedSeconds);
  assert.equal(await run(()=>qv.simulation.step(.25)),true);
  await page.waitFor('!qv.simulation.isBusy',30000);
  const st=await run(()=>qv.simulation.status);
  assert.equal(st.state,'ready');assert.notEqual(st.output.state,'fault',st.output.diagnostics.fault);
  assert.equal(st.output.simulatedSeconds,before+.25);return st.output;
};
try {
  await page.waitFor('!!document.querySelector(".op .rp-range")');
  await page.send('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]});
  await run(async()=>{
    const main=await fetch('/src/main.ts').then(r=>r.text());
    globalThis.qa=await import(main.match(/from "([^"]*\/state\.ts[^"]*)"/)[1]);
    globalThis.qv=await import(main.match(/from "([^"]*\/runtime\/view\.ts[^"]*)"/)[1]);
    qa.store.update(s=>{s.ui.paused=true});
  });
  await settled();await step();
  await check('outdoor temperature and humidity are editable in their zone card and synchronize both ways',async()=>{
    await run(()=>{const t=document.querySelector('.op input[type=range][aria-label^="Outdoor temperature"]');t.focus();t.value='4';t.dispatchEvent(new Event('input',{bubbles:true}));});
    assert.equal(await run(()=>qa.store.state.cfg.outdoorC),4);
    assert.equal(await run(()=>document.querySelector('input.num[aria-label="Outdoor temperature [°C]"]').value),'4.0');
    assert.equal(await run(()=>document.activeElement===document.querySelector('.op input[type=range][aria-label^="Outdoor temperature"]')),true);
    await run(()=>{const h=document.querySelector('.op input[type=number][aria-label^="Outdoor relative humidity"]');h.focus();h.value='88';h.dispatchEvent(new Event('input',{bubbles:true}));});
    assert.equal(await run(()=>qa.store.state.cfg.outdoorRh),88);
    assert.equal(await run(()=>document.querySelector('input.num[aria-label="Outdoor humidity [% RH]"]').value),'88');
    await run(()=>{document.activeElement.blur();const t=document.querySelector('input.num[aria-label="Outdoor temperature [°C]"]');t.value='3';t.dispatchEvent(new Event('input',{bubbles:true}));});
    assert.equal(await run(()=>document.querySelector('.op input[type=number][aria-label^="Outdoor temperature"]').value),'3.0');
    assert.equal(await run(()=>qa.store.state.ui.selected),null);await settled();await step();
  });
  await check('continuous target dragging preserves layout, focus, pipe colours and calculated readings',async()=>{
    const evidence=await run(()=>{
      const ctl=document.querySelector('.room-panel .rp-range');ctl.focus();
      const geo=()=>['.topbar','.ribbon','.stage','.scene','.op','.room-panel'].map(sel=>{
        const r=document.querySelector(sel).getBoundingClientRect();return [sel,r.x,r.y,r.width,r.height];});
      const before=geo(),clock=qv.simulation.status.output.simulatedSeconds;
      const values=[...document.querySelectorAll('.hd-metrics .v')].map(e=>e.textContent);
      const pipes=[...document.querySelectorAll('.scene .pipe')].map(e=>[e.dataset.phase,e.querySelector('.p-fill').getAttribute('stroke')]);
      const states=[];
      for(let i=0;i<30;i++){
        ctl.value=String(22+i%6*.5);ctl.dispatchEvent(new Event('input',{bubbles:true}));
        states.push({geo:JSON.stringify(geo())===JSON.stringify(before),focus:document.activeElement===ctl,
          values:JSON.stringify([...document.querySelectorAll('.hd-metrics .v')].map(e=>e.textContent))===JSON.stringify(values),
          pipes:JSON.stringify([...document.querySelectorAll('.scene .pipe')].map(e=>[e.dataset.phase,e.querySelector('.p-fill').getAttribute('stroke')]))===JSON.stringify(pipes)});
      }
      return {states,clock,status:qv.simulation.status.state,notice:document.querySelector('.opstate').textContent,
        pausedNote:document.querySelector('.hd-note').textContent,noticeVisible:document.querySelector('.opstate').getClientRects().length>0};
    });
    assert.equal(evidence.status,'updating');assert.match(evidence.notice,/last calculated step/i);
    assert.match(evidence.pausedNote,/Resume.*recalculat/);assert.equal(evidence.noticeVisible,true);
    assert.ok(evidence.states.every(s=>s.geo&&s.focus&&s.values&&s.pipes),JSON.stringify(evidence.states));
    await settled();assert.equal(await run(()=>qv.simulation.status.output.simulatedSeconds),evidence.clock);
    assert.equal(await run(()=>qv.simulation.status.state),'updating');await step();
    assert.equal(await run(()=>document.querySelector('.rb-upd')),null);
  });
  await check('closed readings disclosure does not hide faults or unavailable headline values',async()=>{
    await run(()=>qa.store.update(s=>{s.cfg.outdoorC=60}));await settled();
    assert.equal(await run(()=>qv.simulation.status.state),'error');
    assert.equal(await run(()=>document.querySelector('.opstate').dataset.kind),'fault');
    assert.ok(await run(()=>[...document.querySelectorAll('.hd-metrics .v')].every(e=>e.textContent==='—')));
    assert.match(await run(()=>document.querySelector('.hd-status').innerText),/Readings withheld/);
    assert.equal(await run(()=>document.querySelector('.ribbon').hidden),true);
    await run(()=>qa.store.update(s=>{s.cfg.outdoorC=3}));await settled();await step();
  });
  await check('individual Off closes its live branch and fan while retaining the room and other units',async()=>{
    const before=await run(()=>qv.simulation.status.output.rooms[0]);
    await run(()=>document.querySelector('.room-panel input[role=switch]').click());await settled();
    const output=await step();assert.equal(output.rooms.length,3);assert.equal(output.rooms[0].active,false);
    assert.equal(output.rooms[0].massFlowKgs,0);assert.equal(output.rooms[0].fanPowerW,0);assert.equal(output.rooms[0].airOutletC,null);
    assert.ok(Math.abs(output.rooms[0].temperatureC-before.temperatureC)<.1);
    assert.ok(output.cycle.branchMassFlowsKgs.slice(1).every(v=>v>0));
    assert.equal(await run(()=>document.querySelector('.room[data-room="0"]').dataset.fan),'0');
    assert.ok(await run(()=>[...document.querySelectorAll('.scene .pipe[data-seg$=":0"]')].every(e=>e.dataset.dir==='0')));
    await run(()=>qa.store.update(s=>{s.ui.tab='rooms'}));
    assert.equal(await run(()=>document.querySelector('#panel-rooms input[role=switch]').checked),false);
    await run(()=>document.querySelector('#panel-rooms input[role=switch]').click());await settled();
    const resumed=await step();assert.ok(resumed.rooms[0].massFlowKgs>0);
  });
  await check('all Off remains idle without removing room thermal states and allows re-enable',async()=>{
    await run(()=>[...document.querySelectorAll('.room-panel input[role=switch]')].forEach(e=>{if(e.checked)e.click()}));await settled();
    const out=await step();assert.equal(out.state,'idle');assert.equal(out.cycle,null);
    assert.ok(out.rooms.every(r=>r.massFlowKgs===0&&r.fanPowerW===0&&r.airOutletC===null&&Number.isFinite(r.temperatureC)));
    await run(()=>document.querySelector('.room-panel input[role=switch]').click());await settled();await step();
    assert.equal(await run(()=>qa.store.state.cfg.rooms[0].enabled),true);
  });
  await check('temperature fills pipes and phase retains an independent monochrome pattern',async()=>{
    // Examples provide stable different temperatures in the same phase; their values stay explicitly illustrative.
    await run(()=>qa.store.setExperience('examples'));
    const tubes=await run(()=>[...document.querySelectorAll('.scene .pipe')].filter(e=>e.dataset.temp!=='unknown').map(e=>{
      const f=e.querySelector('.p-fill'),m=e.querySelector('.p-mk');return {phase:e.dataset.phase,t:Number(e.dataset.temp),
        colour:f.getAttribute('stroke'),fillW:Number(f.getAttribute('stroke-width')),markW:Number(m.getAttribute('stroke-width')),
        dash:getComputedStyle(m).strokeDasharray,markColour:getComputedStyle(m).stroke};}));
    const vap=tubes.filter(t=>t.phase==='vapor');assert.ok(vap.length>=2);
    assert.ok(vap.some(a=>vap.some(b=>a.t!==b.t&&a.colour!==b.colour)));
    assert.ok(tubes.every(t=>t.fillW>t.markW&&t.markColour==='rgb(255, 255, 255)'));
    assert.equal(new Set(tubes.map(t=>t.phase)).size,3);
    assert.equal(new Set(tubes.map(t=>t.dash)).size,3);
    assert.match(await run(()=>document.querySelector('.legend').innerText),/Tube colour = temperature/i);
    assert.equal(await run(()=>document.querySelectorAll('.dim').length),0);
    assert.doesNotMatch(await run(()=>document.body.innerText),/H × W × D|500 mm|Casings and dimensions/);
    assert.equal(await run(()=>document.querySelectorAll('img,image,canvas').length),0);
  });
  await check('outdoor controls and room switches fit desktop views with one to five rooms',async()=>{
    for(const [width,height] of [[1440,900],[1600,1000]]){
      await page.send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:false});
      for(const count of [1,3,5]){
        await page.evaluate(`qa.store.setUnitCount(${count})`);
        const panels=await run(()=>[...document.querySelectorAll('.op,.room-panel .rp')].map(e=>{
          const r=e.getBoundingClientRect();const box={x:r.x,y:r.y,right:r.right,bottom:r.bottom};
          const controls=[...e.querySelectorAll('.rp-ctl')].map(c=>{const b=c.getBoundingClientRect();return b.left>=r.left&&b.right<=r.right+1&&b.top>=r.top&&b.bottom<=r.bottom+1});
          return {kind:e.className,box,fit:e.scrollWidth<=e.clientWidth+1&&e.scrollHeight<=e.clientHeight+1,controls:controls.every(Boolean),visible:r.left>=0&&r.right<=innerWidth&&r.top>=0&&r.bottom<=innerHeight};}));
        assert.equal(panels.length,count+1);assert.ok(panels.every(p=>p.fit&&p.controls&&p.visible),JSON.stringify({width,height,count,panels}));
        const overlap=await run(()=>[...document.querySelectorAll('.op-ctl')].map(e=>{
          const label=e.querySelector('.rp-k').getBoundingClientRect(),line=e.querySelector('.rp-line').getBoundingClientRect();
          const unit=e.querySelector('small');
          return {clear:label.right<=line.left+1||label.bottom<=line.top+1,unitOneLine:unit.getBoundingClientRect().height<parseFloat(getComputedStyle(unit).fontSize)*1.8};
        }));
        assert.ok(overlap.every(e=>e.clear&&e.unitOneLine),JSON.stringify({width,height,count,overlap}));
      }
    }
    await run(()=>qa.store.setUnitCount(3));
    const shot=await page.send('Page.captureScreenshot',{format:'png',fromSurface:false,captureBeyondViewport:false});
    await writeFile('design/interface-controls.png',Buffer.from(shot.data,'base64'));
  });
  assert.equal(page.events.filter(e=>e.method==='Runtime.exceptionThrown').length,0);
  await writeFile('reviews/control-refinement-browser-results.json',JSON.stringify({checkedAt:new Date().toISOString(),checks:results},null,2)+'\n');
  console.log(`${results.length} actual-worker and rendered control checks passed`);
} finally {await page.close();await isolated.close()}
