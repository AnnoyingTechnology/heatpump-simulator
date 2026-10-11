import test from 'node:test';
import assert from 'node:assert/strict';
import Module from './backend.mjs';
import {Properties,HeatPumpEngine,defaultEngineConfig} from './build/index.js';
import {roomDemand} from './build/demand.js';
import {driveStep} from './build/drive.js';
const p=new Properties(await Module());
function check(o,c){assert.equal(o.diagnostics.fault,null);assert.ok(Math.abs(o.energy.residualJ)<.01);assert.ok(Math.abs(o.energy.waterResidualKg)<1e-10);if(o.cycle)assert.ok(o.cycle.closureResidualW<=c.numerics.pressureToleranceW);else assert.equal(o.electrical.compressorW,0);}
test('room demand balances target load and applies directional antiwindup independently',()=>{
 const c=defaultEngineConfig(2);const e=new HeatPumpEngine(p,c);const rooms=e.checkpoint().rooms;
 const t=c.rooms.map(r=>r.setpointC);const base=roomDemand(c,rooms,t,[true,true],[0,0],.25,false);
 assert.ok(base.heatW.every(q=>q>0));assert.ok(base.active.every(Boolean));
 const saturated=roomDemand(c,rooms,[t[0]-1,t[1]+1],[true,true],[0,0],1,true,true);
 const lower=roomDemand(c,rooms,[t[0]+100,t[1]],[false,true],[0,0],1,true,false);
 assert.equal(lower.integralW[0],0);
 assert.equal(saturated.integralW[0],0);assert.ok(saturated.integralW[1]<0);
 const approaching=roomDemand(c,rooms,[t[0]-2,t[1]-2],[true,true],[0,0],1,false);
 assert.ok(approaching.heatW[0]>base.heatW[0]);
});
test('inverter modulates continuously across target when load exceeds minimum capacity',()=>{
 const c=defaultEngineConfig(1);c.rooms[0].initialTemperatureC=21;c.rooms[0].envelopeWK=150;c.control.thermostatDeadbandK=.15;
 const e=new HeatPumpEngine(p,c);let crossed=false;
 for(let i=0;i<2400;i++){const o=e.step(.25);check(o,c);assert.ok(o.cycle);crossed ||= o.rooms[0].temperatureC>21;}
 assert.ok(crossed);assert.ok(e.snapshot().diagnostics.speedRps<c.compressor.speedMaxRps);
});
test('below-minimum load cycles with dwell, while conventional operation uses a fixed speed',()=>{
 for(const strategy of ['inverter','on-off']){
  const c=defaultEngineConfig(1);c.control.strategy=strategy;c.control.thermostatDeadbandK=.15;c.rooms[0].initialTemperatureC=21;
  const e=new HeatPumpEngine(p,c);let running=false,stopped=false,restarted=false;
  for(let i=0;i<1600;i++){const o=e.step(.25);check(o,c);if(o.cycle){if(stopped)restarted=true;running=true;if(strategy==='on-off')assert.equal(o.diagnostics.speedRps,c.control.fixedSpeedRps);}else if(running)stopped=true;}
  assert.ok(stopped&&restarted,strategy);
 }
});

test('controller history rolls back on native failure and clears on strategy change',()=>{
 const c=defaultEngineConfig(1);c.rooms[0].setpointC=23;const e=new HeatPumpEngine(p,c);
 for(let i=0;i<100;i++)check(e.step(.25),c);
 const before=e.checkpoint();assert.ok(before.demandIntegralW[0]>0);
 const original=p.airH;p.airH=()=>{throw new Error('injected native air failure');};
 try{const o=e.step(.25);assert.match(o.diagnostics.fault,/injected native/);}finally{p.airH=original;}
 const after=e.checkpoint();assert.deepEqual(after.demandIntegralW,before.demandIntegralW);assert.equal(after.inverterCycling,before.inverterCycling);assert.deepEqual(after.inventoryDrive,before.inventoryDrive);assert.deepEqual(after.rooms,before.rooms);
 c.control.strategy='on-off';e.updateConfig(c);assert.deepEqual(e.checkpoint().demandIntegralW,[0]);
 const invalid=structuredClone(c);delete invalid.control.fixedSpeedRps;invalid.compressor.speedMinRps=50;
 assert.throws(()=>new HeatPumpEngine(p,invalid),/Fixed compressor speed/);
});

test('live minimum-speed edits cannot publish a running command outside the selected range',()=>{
 const next=driveStep({speedRps:18,startupSeconds:20,offSeconds:0,protection:null},.25,{demandRps:35,minimumRps:30,maximumRps:75,maximumRatio:8,maximumDischargeC:145,minimumOffSeconds:30,pressureRatio:2,predictedDischargeC:60,pickupAvailable:true});
 assert.equal(next.speedRps,30);
});
