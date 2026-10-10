import test from 'node:test';
import assert from 'node:assert/strict';
import Module from './backend.mjs';
import {Properties,HeatPumpEngine,defaultEngineConfig} from './build/index.js';
const p = new Properties(await Module());
test('Reference inverter preserves stores and closes freshly after warmed three-to-one branch change',()=>{
 const c=defaultEngineConfig(3);c.outdoorTemperatureC=-.5;c.outdoorRelativeHumidity=.35;c.rooms.forEach(r=>r.setpointC=23);
 const e=new HeatPumpEngine(p,c);let o;const check=o=>{
  assert.equal(o.diagnostics.fault,null);assert.ok(Math.abs(o.energy.residualJ)<.01);assert.ok(Math.abs(o.energy.waterResidualKg)<1e-10);
  if(o.cycle){assert.ok(o.cycle.discharge.temperatureC<c.compressor.maxDischargeC);assert.ok(o.cycle.closureResidualW<=c.numerics.pressureToleranceW);}
  else {assert.equal(o.electrical.compressorW,0);assert.equal(o.heatingCOP,null);}
 };
 for(let i=0;i<320;i++){o=e.step(.25);check(o);}
 assert.ok(o.diagnostics.speedRps>c.compressor.speedMinRps);const time=o.simulatedSeconds,temperatures=o.rooms.map(r=>r.temperatureC);
 c.rooms[0].enabled=false;c.rooms[2].enabled=false;o=e.updateConfig(c);
 assert.equal(o.simulatedSeconds,time);o.rooms.forEach((r,i)=>assert.ok(Math.abs(r.temperatureC-temperatures[i])<1e-9));
 for(let i=0;i<400;i++){o=e.step(.25);check(o);}
 assert.equal(o.simulatedSeconds,180);assert.ok(o.cycle);assert.deepEqual(o.cycle.branchMassFlowsKgs.map(m=>m>0),[false,true,false]);
});
