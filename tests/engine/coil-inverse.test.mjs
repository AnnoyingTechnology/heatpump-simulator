import test from 'node:test';
import assert from 'node:assert/strict';
import Module from '../../public/vendor/coolprop/coolprop.js';
import {Properties,HeatPumpEngine,defaultEngineConfig} from './build/index.js';
import {coilOutletH,conductanceIntegral,solveCycle} from './build/cycle.js';
const p=new Properties(await Module());

// Independent previous implementation: integral over all crossed phases and 35 bisections.
function bisectedOutlet(pressure,inlet,flow,ua,metal,condensing){
  let terminal=p.prop('H','P',pressure,'T',metal+273.15+(condensing?1e-5:-1e-5)),origin=inlet;
  const target=ua/flow;
  if(target>=conductanceIntegral(p,pressure,inlet,terminal,metal))return terminal;
  for(let i=0;i<35;i++){
    const mid=(terminal+origin)/2;
    if(conductanceIntegral(p,pressure,inlet,mid,metal)>target)terminal=mid;else origin=mid;
  }
  return (terminal+origin)/2;
}

test('phase-local exchanger inverse agrees with prior real-EOS bisection, including pressure perturbations',()=>{
  for(const saturationC of [-25,5,40,60])for(const shift of [-.025,0,.025])for(const condensing of [false,true]){
    const pressure=p.pressureAtSaturationC(saturationC+shift),sat=p.saturation(pressure);
    const inlet=condensing?p.pt(pressure,sat.temperatureC+25).hJkg:sat.liquidH+.15*(sat.vaporH-sat.liquidH);
    const metal=saturationC+(condensing?-10:10);
    for(const flow of [.008,.04])for(const ua of [5,100,800]){
      const actual=coilOutletH(p,pressure,inlet,flow,ua,metal,condensing);
      const reference=bisectedOutlet(pressure,inlet,flow,ua,metal,condensing);
      assert.ok(Math.abs(actual-reference)*flow<=1e-4,`outlet heat error at ${saturationC}, ${shift}, ${condensing}, ${flow}, ${ua}: ${Math.abs(actual-reference)*flow} W`);
    }
  }
});

test('stale/singular continuation slopes fall back to freshly closed real-EOS pressure equations',()=>{
  const c=defaultEngineConfig(3),input={mode:'heating',indoorMetalC:[30,31,29],outdoorMetalC:-3,active:[true,true,true],speedRps:40};
  const baseline=solveCycle(p,c,input);
  for(const matrix of [[0,0,0,0],[-1,0,0,-1]]){
    const result=solveCycle(p,c,{...input,previous:{evaporatingC:baseline.evaporatingC+.2,condensingC:baseline.condensingC+.2,
      pressureJacobian:{mode:'heating',floatingCondenser:false,matrix}}});
    assert.ok(result.closureResidualW<=c.numerics.pressureToleranceW);
    assert.ok(Math.abs(result.massResidualKgs)*250000<=c.numerics.pressureToleranceW);
    assert.ok(Math.abs(result.evaporatingC-baseline.evaporatingC)<.001);
    assert.ok(Math.abs(result.condensingC-baseline.condensingC)<.001);
  }
});

test('worker batching preserves every quarter-second thermal/control step and its conservation ledgers',()=>{
  const c=defaultEngineConfig(3),batched=new HeatPumpEngine(p,c),individual=new HeatPumpEngine(p,c);
  for(let i=0;i<8;i++){
    const actual=batched.step(1);
    for(let part=0;part<4;part++)individual.step(.25);
    assert.deepEqual(actual,individual.snapshot());
    assert.equal(actual.simulatedSeconds,i+1);
    assert.ok(Math.abs(actual.energy.residualJ)<.01);
    assert.ok(Math.abs(actual.energy.waterResidualKg)<1e-9);
  }
});
