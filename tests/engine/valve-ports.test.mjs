import test from 'node:test';
import assert from 'node:assert/strict';
import Module from './backend.mjs';
import { Properties, defaultEngineConfig, solveCycle, HeatPumpEngine } from './build/index.js';
import { transportPipe } from './build/transport.js';

const p = new Properties(await Module());
const near = (a,b,tolerance=1e-8) => assert.ok(Math.abs(a-b)<=tolerance, `${a} differs from ${b}`);
function scenario(mode='heating',physical=false,defrost=false,active=[true,true]) {
  const c=defaultEngineConfig(active.length);
  c.outdoorTemperatureC=mode==='heating'?7:35;
  c.rooms.forEach(r=>{r.pipe.lengthM=physical?7.5:0;r.pipe.elevationM=0;});
  const input={mode,indoorMetalC:active.map((_,i)=>21+i),outdoorMetalC:defrost?10:mode==='heating'?7:35,active,speedRps:40,defrost};
  return {c,input};
}
function checkFaces(o,c) {
  assert.ok(o.closureResidualW<=c.numerics.pressureToleranceW);
  assert.equal(o.branchValveInlets.length,c.rooms.length);assert.equal(o.branchValveOutlets.length,c.rooms.length);
  o.branchMassFlowsKgs.forEach((flow,i)=>{
    if(!flow){assert.equal(o.branchValveInlets[i],null);assert.equal(o.branchValveOutlets[i],null);return;}
    const up=o.branchValveInlets[i],down=o.branchValveOutlets[i];
    assert.ok(up.pPa>down.pPa);assert.equal(up.hJkg,down.hJkg);
    for(const state of [up,down]) {
      const independent=p.ph(state.pPa,state.hJkg);
      near(independent.temperatureC,state.temperatureC);assert.equal(independent.phase,state.phase);assert.equal(independent.qualityMass,state.qualityMass);
    }
  });
}

test('idealized heating valve faces preserve individual branch enthalpy and mix only downstream',()=>{
  const {c,input}=scenario(),o=solveCycle(p,c,input);checkFaces(o,c);
  o.branchMassFlowsKgs.forEach((flow,i)=>{
    assert.deepEqual(o.branchValveInlets[i],o.branchOutlets[i]);near(o.branchValveOutlets[i].pPa,o.lowPressureBarAbs*1e5);
    assert.equal(o.branchValveOutlets[i].hJkg,o.branchOutlets[i].hJkg);
  });
  assert.notEqual(o.branchValveOutlets[0].hJkg,o.branchValveOutlets[1].hJkg);
  const mixed=o.branchMassFlowsKgs.reduce((sum,m,i)=>sum+m*o.branchValveOutlets[i].hJkg,0)/o.totalMassFlowKgs;
  near(mixed,o.expansionOutlet.hJkg);near(mixed,o.condenserOutlet.hJkg);
});

test('physical heating valve inlet is the transported returning liquid endpoint, not indoor coil outlet',()=>{
  const {c,input}=scenario('heating',true),o=solveCycle(p,c,input);checkFaces(o,c);
  c.rooms.forEach((room,i)=>{
    const coil=o.branchOutlets[i],transport=transportPipe(p,coil.pPa,coil.hJkg,o.branchMassFlowsKgs[i],room.pipe,room.pipe.liquidInsideDiameterM,c.outdoorTemperatureC,-room.pipe.elevationM);
    near(o.branchValveInlets[i].pPa,transport.pPa);near(o.branchValveInlets[i].hJkg,transport.hJkg);
    assert.ok(Math.abs(coil.hJkg-o.branchValveInlets[i].hJkg)>1);assert.ok(coil.pPa>o.branchValveInlets[i].pPa);
    near(o.branchValveOutlets[i].pPa,o.lowPressureBarAbs*1e5);
  });
  near(o.branchMassFlowsKgs.reduce((sum,m,i)=>sum+m*o.branchValveOutlets[i].hJkg,0)/o.totalMassFlowKgs,o.expansionOutlet.hJkg);
});

test('idealized cooling and reverse-cycle defrost expose actual condenser-to-branch valve faces without forcing flash phase',()=>{
  for(const defrost of [false,true]){
    const {c,input}=scenario('cooling',false,defrost),o=solveCycle(p,c,input);checkFaces(o,c);
    o.branchMassFlowsKgs.forEach((flow,i)=>{
      assert.deepEqual(o.branchValveInlets[i],o.condenserOutlet);assert.deepEqual(o.branchValveOutlets[i],o.branchInlets[i]);
    });
    if(defrost) assert.equal(o.branchValveOutlets[0].phase,'liquid','valid low-lift subcooled liquid must not be relabelled two-phase');
    else assert.equal(o.branchValveOutlets[0].phase,'two-phase');
  }
});

test('physical cooling valve outlet precedes the small field line at its actual solved start pressure/enthalpy',()=>{
  const {c,input}=scenario('cooling',true),o=solveCycle(p,c,input);checkFaces(o,c);
  c.rooms.forEach((room,i)=>{
    const up=o.branchValveInlets[i],down=o.branchValveOutlets[i];assert.deepEqual(up,o.condenserOutlet);
    const transported=transportPipe(p,down.pPa,down.hJkg,o.branchMassFlowsKgs[i],room.pipe,room.pipe.liquidInsideDiameterM,c.outdoorTemperatureC,room.pipe.elevationM);
    near(transported.pPa,o.branchInlets[i].pPa,.2);near(transported.hJkg,o.branchInlets[i].hJkg);
    assert.ok(down.pPa>o.branchInlets[i].pPa);assert.ok(Math.abs(down.hJkg-o.branchInlets[i].hJkg)>1);
  });
});

test('inactive branches have null valve faces while active arrays retain indices in every mode/topology',()=>{
  for(const mode of ['heating','cooling'])for(const physical of [false,true]){
    const {c,input}=scenario(mode,physical,false,[true,false,true]),o=solveCycle(p,c,input);checkFaces(o,c);
    assert.equal(o.branchValveInlets[1],null);assert.equal(o.branchValveOutlets[1],null);
    assert.ok(o.branchValveInlets[0]&&o.branchValveInlets[2]);
  }
});

test('mixed-phase heating branches retain EOS classification and extra valve flashes occur only once at accepted output',()=>{
  const c=defaultEngineConfig(3);c.outdoorTemperatureC=25;
  const input={mode:'heating',indoorMetalC:[17,20,23],outdoorMetalC:25,active:[true,true,true],speedRps:18,allocationWeights:[1,2,3]};
  const calls=[],original=p.ph;p.ph=function(pressure,h){calls.push([pressure,h]);return original.call(this,pressure,h);};
  let o;try{o=solveCycle(p,c,input);}finally{p.ph=original;}
  checkFaces(o,c);
  assert.ok(o.branchOutlets.some(s=>s.phase!=='liquid'),'fixture includes branch phase distinct from mixed liquid header');
  o.branchValveInlets.forEach((s,i)=>assert.deepEqual(s,o.branchOutlets[i]));
  o.branchValveOutlets.forEach(s=>assert.equal(calls.filter(([pressure,h])=>pressure===s.pPa&&h===s.hJkg).length,1,
    'each individual outlet PH coordinate is flashed only when publishing the accepted trial'));
});

test('accepted diagnostic PH failure propagates unchanged without selecting another physical regime',()=>{
  const c=defaultEngineConfig(3);c.outdoorTemperatureC=25;
  const input={mode:'heating',indoorMetalC:[17,20,23],outdoorMetalC:25,active:[true,true,true],speedRps:18,allocationWeights:[1,2,3]};
  const accepted=solveCycle(p,c,input),face=accepted.branchValveOutlets[0];
  assert.equal('valveFaces' in accepted,false,'private selection metadata must not leak into output');
  assert.equal('output' in accepted,false);
  const originalPh=p.ph,originalProp=p.prop,failure=new Error('injected accepted valve diagnostic failure');
  let failed=false,failureHits=0,physicalQueriesAfterFailure=0;
  p.ph=function(pressure,h){
    if(pressure===face.pPa&&h===face.hJkg){failed=true;failureHits++;throw failure;}
    return originalPh.call(this,pressure,h);
  };
  p.prop=function(...args){
    if(failed)physicalQueriesAfterFailure++;
    return originalProp.apply(this,args);
  };
  try{assert.throws(()=>solveCycle(p,c,input),error=>error===failure);}
  finally{p.ph=originalPh;p.prop=originalProp;}
  assert.equal(failureHits,1,'the accepted diagnostic coordinate is not retried');
  assert.equal(physicalQueriesAfterFailure,0,'diagnostics must not trigger an alternate pressure solve');
});

test('valve-port diagnostics survive snapshot/configuration preservation and cannot mutate retained engine state',()=>{
  const c=defaultEngineConfig(2);const e=new HeatPumpEngine(p,c),o=e.step(.25);
  assert.equal(o.diagnostics.fault,null);assert.ok(o.cycle);checkFaces(o.cycle,c);
  const original=o.cycle.branchValveInlets[0].temperatureC;
  o.cycle.branchValveInlets[0].temperatureC=999;
  assert.equal(e.snapshot().cycle.branchValveInlets[0].temperatureC,original);
  const before=e.snapshot();c.rooms[0].setpointC+=.5;
  const configured=e.updateConfig(c);assert.equal(configured.simulatedSeconds,before.simulatedSeconds);
  for(const key of ['electricityJ','usefulServiceHeatJ','signedRoomHeatJ','drainedWaterKg']) assert.equal(configured.energy[key],before.energy[key]);
  for(const key of Object.keys(before.energy)) near(configured.energy[key],before.energy[key],1e-6);
});
