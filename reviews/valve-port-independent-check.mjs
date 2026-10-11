// Reviewer-only checks against immutable accepted source/build/native snapshots.
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
const root = process.argv[2];
if (!root) throw new Error('Supply the final immutable snapshot path');
const load = relative => import(pathToFileURL(`${root}/${relative}`).href);
const engine = await load('tests/engine/build/index.js');
const { transportPipe } = await load('tests/engine/build/transport.js');
const initialize = (await load('public/vendor/coolprop-safe/adapter.js')).default;
const native = await initialize(), p = new engine.Properties(native);
const baseline = await import('file:///tmp/heatpump-opening-science-snapshot-9ggrrx_t/tests/engine/build/index.js');
const bp = new baseline.Properties(native);
const hash = async path => createHash('sha256').update(await readFile(path)).digest('hex');
const files = ['src/engine/cycle.ts','src/engine/types.ts','src/engine/engine.ts','src/engine/properties.ts','src/engine/transport.ts','tests/engine/build/cycle.js','tests/engine/build/types.js','public/vendor/coolprop-safe/adapter.js','public/vendor/coolprop-safe/coolprop.js','public/vendor/coolprop-safe/coolprop.wasm'];
const hashes = Object.fromEntries(await Promise.all(files.map(async file => [file,await hash(`${root}/${file}`)])));
const near = (a,b,tol=1e-7) => assert.ok(Math.abs(a-b)<=tol, `${a} != ${b}, tolerance ${tol}`);
const stripped = value => { const clone=structuredClone(value);delete clone.branchValveInlets;delete clone.branchValveOutlets;return clone; };
function make(mode,physical,defrost=false,active=[true,true]) {
  const c=engine.defaultEngineConfig(active.length);c.outdoorTemperatureC=mode==='heating'?7:35;
  c.rooms.forEach(room=>{room.pipe.lengthM=physical?7.5:0;room.pipe.elevationM=0;});
  return {c,input:{mode,indoorMetalC:active.map((_,i)=>21+i),outdoorMetalC:defrost?10:c.outdoorTemperatureC,active,speedRps:40,defrost}};
}
function rawState(state) {
  const prop=output=>native.PropsSI(output,'P',state.pPa,'H',state.hJkg,'R32');
  near(prop('T')-273.15,state.temperatureC,1e-8);
  near(prop('D'),state.densityKgm3,1e-7);near(prop('S'),state.entropyJkgK,1e-7);
  const q=prop('Q'), wet=q>=0&&q<=1;
  const liquidH=native.PropsSI('H','P',state.pPa,'Q',0,'R32');
  const phase=wet?'two-phase':state.hJkg<liquidH?'liquid':'vapor';
  assert.equal(state.phase,phase);assert.equal(state.qualityMass,wet?q:null);
  if(wet) {
    const vaporH=native.PropsSI('H','P',state.pPa,'Q',1,'R32');
    near((state.hJkg-liquidH)/(vaporH-liquidH),q,1e-9);
  }
}
const cases=[];
for(const mode of ['heating','cooling'])for(const physical of [false,true]) {
  cases.push({name:`${mode}-${physical?'physical':'ideal'}`,physical,...make(mode,physical)});
  cases.push({name:`${mode}-${physical?'physical':'ideal'}-inactive`,physical,...make(mode,physical,false,[true,false,true])});
}
cases.push({name:'defrost-liquid-outlet',physical:false,...make('cooling',false,true)});
const warm=make('heating',false,false,[true,true,true]);warm.c.outdoorTemperatureC=25;
warm.input={mode:'heating',indoorMetalC:[17,20,23],outdoorMetalC:25,active:[true,true,true],speedRps:18,allocationWeights:[1,2,3]};
cases.push({name:'heterogeneous-warm-heating',physical:false,...warm});
const results=[];
for(const item of cases) {
  const o=engine.solveCycle(p,item.c,item.input),old=baseline.solveCycle(bp,item.c,item.input);
  assert.deepEqual(stripped(o),old,'Physical results differ from pre-diagnostic baseline');
  assert.ok(o.closureResidualW<=item.c.numerics.pressureToleranceW);
  assert.equal(o.branchValveInlets.length,item.c.rooms.length);assert.equal(o.branchValveOutlets.length,item.c.rooms.length);
  const ports=[];
  o.branchMassFlowsKgs.forEach((mass,i)=>{
    const up=o.branchValveInlets[i],down=o.branchValveOutlets[i];
    if(!mass){assert.equal(up,null);assert.equal(down,null);return;}
    rawState(up);rawState(down);assert.ok(up.pPa>down.pPa);assert.equal(up.hJkg,down.hJkg);
    assert.ok(down.entropyJkgK>=up.entropyJkgK-1e-7,'Throttling entropy decreased');
    const room=item.c.rooms[i];
    if(item.input.mode==='heating') {
      const coil=o.branchOutlets[i];
      if(item.physical) {
        const line=transportPipe(p,coil.pPa,coil.hJkg,mass,room.pipe,room.pipe.liquidInsideDiameterM,item.c.outdoorTemperatureC,-room.pipe.elevationM);
        near(up.pPa,line.pPa);near(up.hJkg,line.hJkg);
        near(mass*(coil.hJkg-up.hJkg),line.heatToOutdoorW,1e-6);
      } else assert.deepEqual(up,coil);
      near(down.pPa,o.lowPressureBarAbs*1e5);
    } else {
      assert.deepEqual(up,o.condenserOutlet);
      if(item.physical) {
        const line=transportPipe(p,down.pPa,down.hJkg,mass,room.pipe,room.pipe.liquidInsideDiameterM,item.c.outdoorTemperatureC,room.pipe.elevationM);
        near(line.pPa,o.branchInlets[i].pPa,.2);near(line.hJkg,o.branchInlets[i].hJkg);
        near(mass*(down.hJkg-o.branchInlets[i].hJkg),line.heatToOutdoorW,1e-6);
      } else assert.deepEqual(down,o.branchInlets[i]);
    }
    ports.push({branch:i,inletPhase:up.phase,outletPhase:down.phase,inletPressurePa:up.pPa,outletPressurePa:down.pPa,enthalpyJkg:down.hJkg,entropyIncreaseJkgK:down.entropyJkgK-up.entropyJkgK});
  });
  if(item.input.mode==='heating') near(o.branchMassFlowsKgs.reduce((sum,m,i)=>sum+m*(o.branchValveOutlets[i]?.hJkg??0),0)/o.totalMassFlowKgs,o.expansionOutlet.hJkg);
  if(item.name==='defrost-liquid-outlet')assert.equal(o.branchValveOutlets[0].phase,'liquid');
  if(item.name==='heterogeneous-warm-heating')assert.ok(o.branchValveInlets.some(s=>s.phase!=='liquid'));
  results.push({name:item.name,closureResidualW:o.closureResidualW,exactPhysicalParity:true,ports});
}
const accepted=engine.solveCycle(p,warm.c,warm.input),target=accepted.branchValveOutlets[1];
const originalPh=p.ph,originalPt=p.pt,originalPressure=p.pressureAtSaturationC;
let failures=0,laterPtCalls=0,laterPressureCalls=0;
p.ph=function(pressure,h){if(!failures&&pressure===target.pPa&&h===target.hJkg){failures++;throw new Error('independent accepted diagnostic PH failure');}return originalPh.call(this,pressure,h);};
p.pt=function(...args){if(failures)laterPtCalls++;return originalPt.apply(this,args);};
p.pressureAtSaturationC=function(...args){if(failures)laterPressureCalls++;return originalPressure.apply(this,args);};
let fault;
try{engine.solveCycle(p,warm.c,warm.input);}catch(error){fault=error.message;}
finally{p.ph=originalPh;p.pt=originalPt;p.pressureAtSaturationC=originalPressure;}
assert.equal(failures,1);assert.equal(fault,'independent accepted diagnostic PH failure');
assert.equal(laterPtCalls,0);assert.equal(laterPressureCalls,0);
// A publication-specific probe checks the enclosing engine's accepted transaction.
const ep=new engine.Properties(native),ec=engine.defaultEngineConfig(2),e=new engine.HeatPumpEngine(ep,ec);
const before=structuredClone(e.checkpoint()),eph=ep.ph;
let engineDiagnosticFailures=0;
ep.ph=function(...args){
  if(new Error().stack.includes('acceptedValveStates')){engineDiagnosticFailures++;throw new Error('independent engine valve publication failure');}
  return eph.apply(this,args);
};
let faultOutput;
try{faultOutput=e.step(.25);}finally{ep.ph=eph;}
assert.equal(engineDiagnosticFailures,1);assert.equal(faultOutput.diagnostics.fault,'independent engine valve publication failure');
assert.equal(faultOutput.cycle,null);assert.equal(faultOutput.electrical.compressorW,0);
assert.ok(faultOutput.rooms.every(room=>room.fanPowerW===0&&room.fanSpeedFraction===0));
const after=e.checkpoint();
for(const key of ['rooms','outdoorEnergyJ','outdoorWaterKg','time','stateTime','heatingRuntime','onTime','offTime','active','thermostatCalls','lastCycle','ledgers','boundaryWater','chargeCandidate','inventoryDrive','demandIntegralW','inverterCycling','fluid'])assert.deepEqual(after[key],before[key],`Fault changed retained ${key}`);
for(const file of files)assert.equal(await hash(`${root}/${file}`),hashes[file]);
const receipt={status:'PASS',snapshot:root,backend:'guarded native HEOS R32',hashes,cases:results,diagnosticFailure:{fault,failures,laterPtCalls,laterPressureCalls},engineFault:{fault:faultOutput.diagnostics.fault,publicationFailures:engineDiagnosticFailures,simulatedSeconds:faultOutput.simulatedSeconds,retainedStateUnchanged:true,compressorW:faultOutput.electrical.compressorW},limitations:['Pipe endpoint reconstruction uses existing transportPipe and is a consistency check, not an independent validation of its correlation.','Ten exact direct-cycle parity cases supplement the implementer full-output parity receipt; no OEM controller/topology calibration is asserted.']};
await writeFile(new URL('./valve-port-independent-results.json',import.meta.url),JSON.stringify(receipt,null,2)+'\n');
console.log(JSON.stringify({status:receipt.status,cases:results.length,diagnosticFailure:receipt.diagnosticFailure,hashes}));
p.dispose();bp.dispose();ep.dispose();native.dispose();
