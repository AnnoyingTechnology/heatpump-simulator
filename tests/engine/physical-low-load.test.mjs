import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import Module from './backend.mjs';
import {Properties,solveCycle,HeatPumpEngine} from './build/index.js';
const native=await Module(),p=new Properties(native);
const owner=JSON.parse(await readFile(new URL('./fixtures/opening-exchange-robustness/opening-owner-1C-ground17-1200.json',import.meta.url))).config;
const near=(a,b,tol)=>assert.ok(Math.abs(a-b)<=tol,`${a} != ${b} within ${tol}`);
function scenario(outside=35){
  const c=structuredClone(owner);c.mode='cooling';c.outdoorTemperatureC=outside;c.compressor.speedMinRps=8;
  c.rooms[1].pipe={...c.rooms[1].pipe,lengthM:6.5,gasInsideDiameterM:.0111,liquidInsideDiameterM:.00475};
  return {c,input:{mode:'cooling',indoorMetalC:[10,10,10],outdoorMetalC:outside,active:[false,true,false],allocationWeights:[0,1,0],speedRps:8,defrost:false}};
}
function terminalBalances(o,c,input){
  assert.ok(o.closureResidualW<=c.numerics.pressureToleranceW);
  assert.ok(Math.abs(o.massResidualKgs)*250000<=c.numerics.pressureToleranceW);
  near(o.branchMassFlowsKgs.reduce((s,m)=>s+m,0),o.totalMassFlowKgs,1e-12);
  const density=native.PropsSI('D','P',o.suction.pPa,'H',o.suction.hJkg,'R32');
  near(o.totalMassFlowKgs,density*c.compressor.displacementM3rev*input.speedRps*c.compressor.volumetricEfficiency,c.numerics.pressureToleranceW/250000);
  const branches=o.branchMassFlowsKgs.map((m,i)=>m*(o.branchInlets[i].hJkg-o.branchOutlets[i].hJkg));
  branches.forEach((heat,i)=>near(heat,o.branchCoilHeatW[i],1e-8));
  const condenser=o.totalMassFlowKgs*(o.discharge.hJkg-o.condenserOutlet.hJkg),work=o.totalMassFlowKgs*(o.discharge.hJkg-o.suction.hJkg);
  near(condenser,o.outdoorCoilHeatW,1e-8);near(work,o.compressorWorkW,1e-8);
  near(condenser+branches.reduce((s,h)=>s+h,0)+o.lineHeatToOutdoorW,work,1e-7);
  assert.equal(o.suction.phase,'vapor');assert.ok(o.discharge.temperatureC<=c.compressor.maxDischargeC);
  assert.ok(o.highPressureBarAbs/o.lowPressureBarAbs<=c.compressor.maxPressureRatio);
  input.active.forEach((active,i)=>{
    if(!active){assert.equal(o.branchMassFlowsKgs[i],0);assert.equal(o.branchValveInlets[i],null);assert.equal(o.branchValveOutlets[i],null);return;}
    assert.ok(o.branchInlets[i].temperatureC<input.indoorMetalC[i]);
    assert.ok(o.branchOutlets[i].temperatureC<input.indoorMetalC[i],'actual local terminal pinch must remain strict');
    assert.ok(o.branchValveInlets[i].pPa>o.branchValveOutlets[i].pPa);
    assert.equal(o.branchValveInlets[i].hJkg,o.branchValveOutlets[i].hJkg);
  });
}
for(const outside of [35,39])test(`physical cooling8rps at ${outside}°C preserves local pinch despite warmer common suction`,()=>{
  const {c,input}=scenario(outside),o=solveCycle(p,c,input);terminalBalances(o,c,input);
  const local=o.branchOutlets[1],sat=native.PropsSI('T','P',local.pPa,'Q',1,'R32')-273.15;
  assert.equal(local.phase,'vapor');assert.ok(local.temperatureC-sat>0);
  assert.ok(local.temperatureC-sat<c.compressor.superheatK,'field line accounts for part of common suction superheat');
  assert.ok(o.evaporatingC>input.indoorMetalC[1]-c.compressor.superheatK);
  assert.ok(o.suction.temperatureC>input.indoorMetalC[1]);
  const commonSat=native.PropsSI('T','P',o.suction.pPa,'Q',1,'R32')-273.15;
  near(o.suction.temperatureC-commonSat,c.compressor.superheatK,1e-5);
});
test('unequal physical coils retain supported18rps closure with an inactive branch',()=>{
  const {c,input}=scenario();c.compressor.speedMinRps=18;
  c.rooms[1].pipe.lengthM=0;c.rooms[0].pipe.lengthM=3.5;c.rooms[2].pipe.lengthM=6.5;
  input.indoorMetalC=[10,10,11];input.active=[true,false,true];input.allocationWeights=[1,0,1];input.speedRps=18;
  const o=solveCycle(p,c,input);terminalBalances(o,c,input);
  assert.notEqual(o.branchMassFlowsKgs[0],o.branchMassFlowsKgs[2]);
  assert.ok(o.branchOutlets[0].phase==='vapor'&&o.branchOutlets[2].phase==='vapor');
});
test('unqualified unequal physical cooling8rps remains a real fault and rolls back the engine transaction',()=>{
  const {c,input}=scenario();
  c.rooms[1].pipe.lengthM=0;c.rooms[0].pipe.lengthM=3.5;c.rooms[2].pipe.lengthM=6.5;
  input.indoorMetalC=[10,10,11];input.active=[true,false,true];input.allocationWeights=[1,0,1];
  // This is a declared limitation of the present common-suction-SH formulation.
  // The interactive physical-cooling setting retains18; no failed8 retry may
  // manufacture a successful stopped interval or silently substitute18.
  assert.throws(()=>solveCycle(p,c,input),/No feasible shared-pressure operating point/);
  c.rooms.forEach((room,i)=>{room.enabled=input.active[i];room.initialTemperatureC=input.indoorMetalC[i];room.setpointC=input.indoorMetalC[i]-2;});
  const engine=new HeatPumpEngine(p,c),before=engine.checkpoint(),output=engine.step(.25),after=engine.checkpoint();
  assert.match(output.diagnostics.fault,/No feasible shared-pressure operating point/);
  assert.equal(output.state,'fault');assert.equal(output.cycle,null);
  assert.equal(output.electrical.compressorW,0);assert.equal(output.simulatedSeconds,0);
  for(const key of ['rooms','outdoorEnergyJ','outdoorWaterKg','ledgers','boundaryWater','thermostatCalls','demandIntegralW','inventoryDrive','lastCycle'])assert.deepEqual(after[key],before[key],key);
  assert.ok(output.rooms.every(room=>room.fanPowerW===0&&room.fanSpeedFraction===0));
});
test('a lower pressure-search bound cannot bypass physical domain, hard ratio or line authority',()=>{
  for(const cause of ['domain','ratio','line']){
    const {c,input}=scenario();
    if(cause==='domain')input.indoorMetalC=[-40,-40,-40];
    if(cause==='ratio')c.compressor.maxPressureRatio=1.1;
    if(cause==='line')c.rooms[1].pipe.lengthM=300;
    assert.throws(()=>solveCycle(p,c,input),cause==='domain'?/operating envelope/:cause==='ratio'?/envelope exceeded/:/Pipe friction|kinetic energy|Pipe pressure|authority/i);
  }
});
