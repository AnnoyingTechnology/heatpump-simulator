// Read-only browser reviewer: actual frozen native cycle outputs exercise the frontend selector.
// These are direct-cycle fixtures, not claims that the enclosing app worker produced them.
import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {openPage} from '../tools/browser-session.mjs';
import {startIsolatedDev} from '../tools/isolated-dev.mjs';
const snapshot='/tmp/heatpump-valve-science-snapshot-osvyohga';
const {Properties,defaultEngineConfig,solveCycle}=await import(`${snapshot}/tests/engine/build/index.js`);
const native=await(await import(`${snapshot}/public/vendor/coolprop-safe/adapter.js`)).default();
const p=new Properties(native),fixtures=[];
function make(name,mode,physical=false,defrost=false,active=[true,true]) {
  const c=defaultEngineConfig(active.length);c.outdoorTemperatureC=mode==='heating'?7:35;
  c.rooms.forEach(room=>{room.pipe.lengthM=physical?7.5:0;room.pipe.elevationM=0;});
  const input={mode,indoorMetalC:active.map((_,i)=>21+i),outdoorMetalC:defrost?10:c.outdoorTemperatureC,active,speedRps:40,defrost};
  if(name==='mixed-heating') {c.outdoorTemperatureC=25;Object.assign(input,{indoorMetalC:[17,20,23],outdoorMetalC:25,speedRps:18,allocationWeights:[1,2,3]});}
  const cycle=solveCycle(p,c,input);
  fixtures.push({name,mode,fieldLines:physical?'physical':'idealized',defrost,cycle});
}
make('mixed-heating','heating',false,false,[true,true,true]);
make('physical-heating','heating',true);make('physical-cooling','cooling',true);
make('ideal-cooling','cooling');make('liquid-defrost','cooling',false,true);
make('inactive-heating','heating',false,false,[true,false,true]);
make('inactive-physical-cooling','cooling',true,false,[true,false,true]);
p.dispose();native.dispose();
const files=['src/runtime/view.ts','src/geometry.ts','src/scene.ts','src/inspector.ts','src/settings.ts','src/circuit.ts','src/pipes.ts','src/style.css'];
const hash=async(path)=>createHash('sha256').update(await readFile(path)).digest('hex');
const hashes=Object.fromEntries(await Promise.all(files.map(async file=>[file,await hash(file)])));
const isolated=await startIsolatedDev(5353),page=await openPage(isolated.url),checks=[];
try {
  for(const file of files)assert.equal(await hash(`${isolated.sourceRoot}/${file}`),hashes[file]);
  await page.waitFor('!!document.querySelector(".scene")');
  await page.evaluate(`(async()=>{
    globalThis.qa=await import('/src/state.ts');
    qa.store.update(s=>s.ui.paused=true);
    globalThis.qv=await import('/src/runtime/view.ts');
    globalThis.qg=await import('/src/geometry.ts');
    globalThis.qc=await import('/src/circuit.ts');
    globalThis.qi=await import('/src/inspector.ts');
    globalThis.qfixtures=${JSON.stringify(fixtures)};
    globalThis.qmapping=[];
  })()`);
  const mapping=await page.evaluate(`(()=>{
    for(const f of qfixtures){
      const c=f.cycle,heat=f.mode==='heating'&&!f.defrost;
      const rd={source:'live',mode:f.defrost?'heating':f.mode,example:f.defrost?'defrost':'normal',fieldLines:f.fieldLines,engine:{cycle:c},
        cycle:{dischargeC:c.discharge.temperatureC,suctionC:c.suction.temperatureC,condOutC:c.condenserOutlet.temperatureC,expOutC:c.expansionOutlet.temperatureC}};
      const segments=[];
      const expect=(id,s,dir)=>{const got=qv.segmentFor(id,rd);const expected={phase:s.phase==='two-phase'?'two':s.phase,tempC:s.temperatureC,dir};
        if(JSON.stringify(got)!==JSON.stringify({phase:expected.phase,dir:expected.dir,tempC:expected.tempC}))throw Error(id+' mismatches actual face '+JSON.stringify({got,expected}));
        segments.push({id,...got});};
      c.branchMassFlowsKgs.forEach((mass,i)=>{
        if(!mass){for(const kind of ['hdrStub','fieldStub','liqField','inL','gasField']){const got=qv.segmentFor(kind+':'+i,rd);if(got.phase!=='idle'||got.dir!==0||got.tempC!==null)throw Error('Inactive segment moves');}return;}
        const field=heat?c.branchValveInlets[i]:c.branchValveOutlets[i];
        const header=heat?c.branchValveOutlets[i]:c.branchValveInlets[i];
        for(const kind of ['fieldStub','liqField'])expect(kind+':'+i,field,heat?-1:1);
        expect('hdrStub:'+i,header,heat?-1:1);
        expect('inL:'+i,heat?c.branchOutlets[i]:c.branchInlets[i],heat?1:-1);
        const probe=qc.indoorCoilProbeLive(heat?'heating':f.defrost?'defrost':'cooling',{flowKgs:mass,inletC:c.branchInlets[i].temperatureC,outletC:c.branchOutlets[i].temperatureC,heatW:c.branchCoilHeatW[i]});
        if(probe.liquid.tempC!==(heat?c.branchOutlets[i]:c.branchInlets[i]).temperatureC)throw Error('Indoor endpoint probe was replaced by outdoor valve face');
      });
      expect('liqHdr',heat?c.expansionOutlet:c.condenserOutlet,heat?-1:1);
      qmapping.push({name:f.name,segments});
    }
    return qmapping;
  })()`);
  checks.push({name:'Seven frozen native cycle fixtures map actual individual valve faces, common mix, modes, phases and inactive branches',passed:true,cases:mapping});
  await page.waitFor('!qv.simulation.isBusy && qv.simulation.status.output',30000);
  const materialized=await page.evaluate(`(()=>{
    const base=structuredClone(qv.simulation.status.output);qv.simulation.stop();
    const rows=[];
    for(const f of qfixtures){
      const c=f.cycle,heat=f.mode==='heating'&&!f.defrost,mode=f.defrost?'heating':f.mode;
      qa.store.state.cfg.mode=mode;qa.store.state.cfg.unitCount=c.branchMassFlowsKgs.length;qa.store.state.cfg.live.fieldLines=f.fieldLines;
      const o=structuredClone(base);o.cycle=c;o.inventory=null;o.state=f.defrost?'defrost':mode;o.requestedMode=mode;o.diagnostics.fault=null;
      o.rooms=o.rooms.slice(0,c.branchMassFlowsKgs.length);
      qv.simulation.status={state:'ready',output:o,error:null,calculationMs:0};qv.simulation.notify();
      const rd=qa.currentReadings(qa.store.state),segments=[];
      for(let i=0;i<c.branchMassFlowsKgs.length;i++)for(const kind of ['hdrStub','fieldStub','liqField','inL']){
        const id=kind+':'+i,expected=qv.segmentFor(id,rd),node=document.querySelector('[data-seg="'+id+'"]');
        if(node.dataset.phase!==expected.phase||Number(node.dataset.dir)!==expected.dir||node.dataset.temp!==(expected.tempC===null?'unknown':expected.tempC.toFixed(1)))throw Error('Materialized pipe differs '+id);
        if(expected.tempC!==null&&node.querySelector('.p-fill').getAttribute('stroke')!==qc.tempColor(expected.tempC))throw Error('Invented tube color '+id);
        if((expected.dir!==0)!==node.classList.contains('moving'))throw Error('Arrow/flow mismatch '+id);
        segments.push({id,phase:node.dataset.phase,dir:node.dataset.dir,temp:node.dataset.temp,stroke:node.querySelector('.p-fill').getAttribute('stroke')});
      }
      const probes=[];
      c.branchMassFlowsKgs.forEach((mass,i)=>{
        const node=document.querySelector('[data-probe="indoor-liquid-'+i+'"]');
        if(!node)throw Error('Missing indoor small-end probe');
        const expected=mass?(heat?c.branchOutlets[i]:c.branchInlets[i]).temperatureC:null;
        if(node.dataset.exact!==(expected===null?'':String(expected)))throw Error('Materialized coil-end probe mismatches branch');
        probes.push({branch:i,role:node.dataset.role,exact:node.dataset.exact});
      });
      const holder=document.createElement('div');holder.innerHTML=qi.inspectorHtml('eev:0',qa.store.state);
      const descriptions=Object.fromEntries([...holder.querySelectorAll('dl.rows>div')].map(row=>[row.querySelector('dt').textContent,row.querySelector('dd').textContent]));
      if(descriptions['Flow direction']!==(heat?'Field side → header side':'Header side → field side'))throw Error('Inspector stream direction inverted');
      for(const [label,state,side] of [['Upstream',c.branchValveInlets[0],heat?'Field-side':'Header-side'],['Downstream',c.branchValveOutlets[0],heat?'Header-side':'Field-side']]){
        if(!descriptions[label].startsWith(side+' line: ')||!descriptions[label].includes(qc.phaseLabel(state.phase==='two-phase'?'two':state.phase)))throw Error('Inspector substituted a common or forced branch phase');
      }
      if(f.name.startsWith('inactive')){
        holder.innerHTML=qi.inspectorHtml('eev:1',qa.store.state);
        const inactive=Object.fromEntries([...holder.querySelectorAll('dl.rows>div')].map(row=>[row.querySelector('dt').textContent,row.querySelector('dd').textContent]));
        if(inactive['Flow direction']!=='None'||inactive.Upstream!=='—'||inactive.Downstream!=='—')throw Error('Closed valve inspector invents flow');
      }
      rows.push({name:f.name,segments,probes,inspector:descriptions});
    }
    return rows;
  })()`);
  checks.push({name:'Materialized pipe phase, temperature color, direction, indoor probes and EEV inspector retain actual branch faces',passed:true,cases:materialized});
  const geometry=await page.evaluate(`(()=>{
    const rows=[];
    for(const n of [1,3,8,12])for(let i=0;i<n;i++){
      const specs=qg.pipeSpecs(n),header=specs.find(s=>s.id==='hdrStub:'+i),field=specs.find(s=>s.id==='fieldStub:'+i),line=specs.find(s=>s.id==='liqField:'+i);
      const center=qg.L(qg.EEV.centerX,qg.ylOf(i)),he=header.pts.at(-1),fs=field.pts[0];
      if(he[0]!==center[0]-9||fs[0]!==center[0]+9||he[1]!==center[1]||fs[1]!==center[1])throw Error('Valve faces detach from body');
      if(JSON.stringify(field.pts.at(-1))!==JSON.stringify(line.pts[0]))throw Error('Casing seam separates fields');
      if(fs[0]>=qg.OUT.x+qg.OUT.w)throw Error('Valve body lies outside casing');
      rows.push({n,branch:i,center,headerFace:he,fieldFace:fs,seam:field.pts.at(-1)});
    }
    const scene=document.querySelector('.scene'),inverse=scene.getCTM().inverse();
    const point=(node,x,y)=>new DOMPoint(x,y).matrixTransform(node.getCTM()).matrixTransform(inverse);
    const valves=[...document.querySelectorAll('.eev-body')].map((body,i)=>{
      const center=point(body,0,0),header=document.querySelector('[data-seg="hdrStub:'+i+'"] .p-fill'),field=document.querySelector('[data-seg="fieldStub:'+i+'"] .p-fill');
      const hp=header.getPointAtLength(header.getTotalLength()),fp=field.getPointAtLength(0),h=point(header,hp.x,hp.y),f=point(field,fp.x,fp.y);
      if(Math.abs(h.x-(center.x-9))>1e-6||Math.abs(f.x-(center.x+9))>1e-6||Math.abs(h.y-center.y)>1e-6||Math.abs(f.y-center.y)>1e-6)throw Error('Materialized body/face mismatch');
      if(Number(body.getAttribute('width'))!==20)throw Error('Unexpected body width');
      return {branch:i,center:{x:center.x,y:center.y},headerFace:{x:h.x,y:h.y},fieldFace:{x:f.x,y:f.y}};
    });
    const labels=[...document.querySelectorAll('.scene text')].map(node=>node.textContent);
    const required=['Compressor · pressure ↑','Fan · moves air','Accumulator · liquid trap','Reverser · heat / cool','Expansion valves','Lower pressure','Outdoor coil · exchanges heat'];
    for(const label of required)if(!labels.includes(label))throw Error('Missing component role '+label);
    const fan=document.querySelector('.fan-shroud');
    if(Number(fan.getAttribute('height'))!==qg.FAN_SIDE.h)throw Error('Materialized side fan height differs');
    return {layoutRows:rows.length,materializedValves:valves,componentRoles:required,sideFan:{height:Number(fan.getAttribute('height')),width:Number(fan.getAttribute('width')),genericSchematic:true}};
  })()`);
  assert.ok(geometry.materializedValves.length>0);checks.push({name:'Materialized EEV body joins both faces inside casing, with continuous field stub/line seam',passed:true,...geometry});
  const missing=await page.evaluate(`(()=>{
    const results=[];
    for(const name of ['mixed-heating','liquid-defrost'])for(const absent of ['missing','null']){
      const f=qfixtures.find(f=>f.name===name),cycle=structuredClone(f.cycle);
      if(absent==='missing'){delete cycle.branchValveInlets;delete cycle.branchValveOutlets;}
      else {cycle.branchValveInlets=cycle.branchMassFlowsKgs.map(()=>null);cycle.branchValveOutlets=cycle.branchMassFlowsKgs.map(()=>null);}
      const rd={source:'live',mode:f.defrost?'heating':f.mode,example:f.defrost?'defrost':'normal',fieldLines:f.fieldLines,engine:{cycle},cycle:{dischargeC:cycle.discharge.temperatureC,suctionC:cycle.suction.temperatureC,condOutC:cycle.condenserOutlet.temperatureC,expOutC:cycle.expansionOutlet.temperatureC}};
      results.push({name,absent,segments:['hdrStub:0','fieldStub:0','liqField:0'].map(id=>({id,...qv.segmentFor(id,rd)}))});
    }
    const fixture=qfixtures.find(f=>f.name==='liquid-defrost'),o=structuredClone(qv.simulation.status.output);
    o.cycle=structuredClone(fixture.cycle);delete o.cycle.branchValveInlets;delete o.cycle.branchValveOutlets;
    o.state='defrost';o.requestedMode='heating';o.rooms=o.rooms.slice(0,2);
    qa.store.state.cfg.mode='heating';qa.store.state.cfg.unitCount=2;
    qv.simulation.status={state:'ready',output:o,error:null,calculationMs:0};qv.simulation.notify();
    const rendered=['hdrStub:0','fieldStub:0','liqField:0'].map(id=>{const node=document.querySelector('[data-seg="'+id+'"]');
      const arrow=node.querySelector('.p-arrow');
      const value={id,phase:node.dataset.phase,dir:Number(node.dataset.dir),temp:node.dataset.temp,stroke:node.querySelector('.p-fill').getAttribute('stroke'),moving:node.classList.contains('moving'),markOpacity:getComputedStyle(node.querySelector('.p-mk')).opacity,arrowOpacity:arrow?getComputedStyle(arrow).opacity:'0'};
      if(value.phase!=='unknown'||value.dir!==0||value.temp!=='unknown'||value.stroke!=='url(#pTempNone)'||value.moving||value.markOpacity!=='0'||value.arrowOpacity!=='0')throw Error('Unavailable materialized pipe invents information');
      return value;});
    const holder=document.createElement('div');holder.innerHTML=qi.inspectorHtml('eev:0',qa.store.state);
    const descriptions=Object.fromEntries([...holder.querySelectorAll('dl.rows>div')].map(row=>[row.querySelector('dt').textContent,row.querySelector('dd').textContent]));
    if(!descriptions.Upstream.endsWith('—')||!descriptions.Downstream.endsWith('—')||descriptions['Outlet T / quality']!=='— · —')throw Error('Unavailable inspector fabricates state');
    return {selectorCases:results,rendered,inspector:descriptions};
  })()`);
  assert.ok(missing.selectorCases.every(item=>item.segments.every(segment=>segment.phase==='unknown'&&segment.tempC===null&&segment.dir===0)),'Missing live valve diagnostics synthesize phase/temperature');
  checks.push({name:'Missing optional live valve faces withhold phase/temperature/arrows',passed:true,segments:missing});
  for(const file of files)assert.equal(await hash(file),hashes[file]);
  const receipt={status:'PASS',frontendHashes:hashes,engineSnapshot:snapshot,cycleSha256:await hash(`${snapshot}/src/engine/cycle.ts`),checks,scope:'Read-only isolated browser uses frozen native direct-cycle fixtures to verify selector and materialized geometry. Root owns actual-worker color/inspector gate. Whole field-line color represents outdoor valve face; no spatial PH field is claimed.'};
  await writeFile(new URL('./valve-renderer-independent-results.json',import.meta.url),JSON.stringify(receipt,null,2)+'\n');
  console.log(JSON.stringify({status:'PASS',checks:checks.map(c=>c.name),frontendHashes:hashes}));
}finally{await page.close();await isolated.close();}
