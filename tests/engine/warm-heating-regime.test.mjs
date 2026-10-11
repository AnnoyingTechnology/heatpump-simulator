import test from'node:test';import assert from'node:assert/strict';import Module from'./backend.mjs';
import{Properties,defaultEngineConfig,solveCycle}from'./build/index.js';
const p=new Properties(await Module());
test('warm-source heating closes a real mixed liquid header at positive minimum lift',()=>{
 for(const source of [25,45])for(const metals of [[17],[17,20,23]]){
  const c=defaultEngineConfig(metals.length);c.outdoorTemperatureC=source;
  const o=solveCycle(p,c,{mode:'heating',indoorMetalC:metals,outdoorMetalC:source,active:metals.map(()=>true),speedRps:18,allocationWeights:metals.map((_,i)=>i+1)});
  assert.ok(o.closureResidualW<=c.numerics.pressureToleranceW);assert.ok(Math.abs(o.massResidualKgs)*250000<=c.numerics.pressureToleranceW);assert.ok(o.compressorWorkW>0);
  assert.ok(o.discharge.temperatureC<c.compressor.maxDischargeC);assert.ok(o.highPressureBarAbs/o.lowPressureBarAbs<c.compressor.maxPressureRatio);assert.equal(o.condenserOutlet.phase,'liquid');
  const mix=o.branchMassFlowsKgs.reduce((h,m,i)=>h+m*o.branchOutlets[i].hJkg,0)/o.totalMassFlowKgs;
  assert.ok(Math.abs(mix-o.condenserOutlet.hJkg)<1e-8);assert.ok(Math.abs(o.expansionOutlet.hJkg-mix)<1e-8);
  o.branchMassFlowsKgs.forEach((m,i)=>assert.ok(Math.abs(o.branchCoilHeatW[i]-m*(o.branchInlets[i].hJkg-o.branchOutlets[i].hJkg))<1e-8));
 }
});
test('SC-target and released-SC heating regimes remain freshly closed through warm-source crossover',()=>{
 const c=defaultEngineConfig(1);let previous;
 for(const source of [18,19,20,20.5,21,22,23,24,25]){
  const o=solveCycle(p,c,{mode:'heating',indoorMetalC:[17],outdoorMetalC:source,active:[true],speedRps:18,previous});
  assert.ok(o.closureResidualW<=c.numerics.pressureToleranceW);assert.ok(o.compressorWorkW>0);assert.equal(o.condenserOutlet.phase,'liquid');assert.ok(o.condensingC-o.evaporatingC>=1-1e-12);
  previous={evaporatingC:o.evaporatingC,condensingC:o.condensingC,condenserOutletC:o.condenserOutlet.temperatureC,branchMassFlowsKgs:o.branchMassFlowsKgs,pressureJacobian:o.pressureJacobian};
 }
});
