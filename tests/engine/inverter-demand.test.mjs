import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import Module from './backend.mjs';
import {Properties,HeatPumpEngine,defaultEngineConfig} from './build/index.js';
import {roomDemand,inverterAllocationWeights} from './build/demand.js';
import {driveStep} from './build/drive.js';
const p=new Properties(await Module());
test('calling branches retain a dimensionless normalized UA reserve when sensible demand crosses zero',()=>{
 const c=defaultEngineConfig(3);c.rooms[0].refrigerantConductanceWK=100;c.rooms[1].refrigerantConductanceWK=300;
 const shares=inverterAllocationWeights(c,[true,true,false],[1000,0,2000]);
 assert.ok(Math.abs(shares.reduce((a,b)=>a+b,0)-1)<1e-12);assert.ok(shares[1]>0);assert.equal(shares[2],0);
 assert.deepEqual(inverterAllocationWeights(c,[true,true,false],[0,0,2000]),[.25,.75,0]);
 assert.deepEqual(inverterAllocationWeights(c,[false,false,false],[0,0,0]),[0,0,0]);
 const e=new HeatPumpEngine(p,c),rooms=e.checkpoint().rooms;
 for(const gains of [0,1000,3000]){
  c.rooms[0].internalGainW=gains;
  const d=roomDemand(c,rooms,c.rooms.map(r=>r.setpointC),[true,true,false],[0,0,0],.25,false);
  assert.equal(d.active[0],true,'zero/nonzero PI request cannot toggle the call');assert.ok(d.fanFraction[0]>0);
 }
});
function check(o,c){
 assert.equal(o.diagnostics.fault,null);assert.ok(Math.abs(o.energy.residualJ)<.01);assert.ok(Math.abs(o.energy.waterResidualKg)<1e-10);
 if(o.cycle){
  assert.ok(o.cycle.closureResidualW<=c.numerics.pressureToleranceW);
  assert.ok(o.cycle.discharge.temperatureC<=c.compressor.maxDischargeC);
  assert.ok(o.cycle.highPressureBarAbs/o.cycle.lowPressureBarAbs<=c.compressor.maxPressureRatio);
  assert.ok(o.cycle.totalMassFlowKgs>0);
  assert.ok(Math.abs(o.cycle.branchMassFlowsKgs.reduce((a,b)=>a+b,0)-o.cycle.totalMassFlowKgs)<1e-9);
 }else assert.equal(o.electrical.compressorW,0);
}
test('room demand balances target load and applies directional antiwindup independently',()=>{
 const c=defaultEngineConfig(2);const e=new HeatPumpEngine(p,c);const rooms=e.checkpoint().rooms;
 const t=c.rooms.map(r=>r.setpointC);const base=roomDemand(c,rooms,t,[true,true],[0,0],.25,false);
 assert.ok(base.heatW.every(q=>q>0));assert.ok(base.active.every(Boolean));
 const saturated=roomDemand(c,rooms,[t[0]-1,t[1]+.5],[true,true],[0,0],1,true,'upper');
 const lower=roomDemand(c,rooms,[t[0]+100,t[1]],[false,true],[0,0],1,true);
 assert.equal(lower.integralW[0],0);
 assert.equal(saturated.integralW[0],0);assert.ok(saturated.integralW[1]<0);
 const minimum=roomDemand(c,rooms,[t[0]-1,t[1]+.5],[true,true],[0,0],1,true,'lower');
 assert.ok(minimum.integralW[0]>0,'positive error may recover from a minimum-speed limit');
 assert.equal(minimum.integralW[1],0,'negative error cannot wind down below the physical speed floor');
 const approaching=roomDemand(c,rooms,[t[0]-2,t[1]-2],[true,true],[0,0],1,false);
 assert.ok(approaching.heatW[0]>base.heatW[0]);
});

function ownerDefaultConfig(){
 const fixture=JSON.parse(readFileSync(new URL('./fixtures/published-owner-startup-146/published-owner-1C-ground17-600.json',import.meta.url)));
 const c=structuredClone(fixture.config),generic=defaultEngineConfig(3);
 // Explicit qualified interactive idealized-Reference setting; not an OEM map.
 // General/native/inventory defaults retain18; physical cooling still requires18.
 // Published house/pipe/weather inputs stay exact.
 c.compressor.speedMinRps=8;
 c.control.inverterRampUpRpsPerSecond=generic.control.inverterRampUpRpsPerSecond;
 c.control.inverterRampDownRpsPerSecond=generic.control.inverterRampDownRpsPerSecond;
 return c;
}
function checkActualRamp(before,output,c){
 check(output,c);assert.equal(output.diagnostics.envelopeProtection,null);assert.ok(output.cycle);
 const dt=output.simulatedSeconds-before.simulatedSeconds;
 if(before.diagnostics.speedRps===0)assert.equal(output.diagnostics.speedRps,c.compressor.speedMinRps);
 else{
  const difference=output.diagnostics.speedRps-before.diagnostics.speedRps;
  assert.ok(difference<=c.control.inverterRampUpRpsPerSecond*dt+1e-9);
  assert.ok(difference>=-c.control.inverterRampDownRpsPerSecond*dt-1e-9);
 }
 assert.ok(Math.abs(output.electrical.compressorW-output.cycle.compressorWorkW/c.compressor.driveEfficiency)<1e-8);
 assert.ok(Math.abs(output.energy.electricityJ-before.energy.electricityJ-output.electrical.totalW*dt)<1e-7,'actual accepted watts supply the energy ledger');
}
test('exact published owner house maintains native continuous inverter service for 1200 seconds',()=>{
 const c=ownerDefaultConfig(),e=new HeatPumpEngine(p,c);let previous=e.snapshot(),modulatedBelow18=false,crossedTarget=false;
 for(let i=0;i<4800;i++){
  const output=e.step(.25);checkActualRamp(previous,output,c);
  assert.equal(output.rooms[1].thermostatCalling,true,'upstairs call must survive modulation across target');
  modulatedBelow18 ||= output.diagnostics.speedRps<18;
  crossedTarget ||= i>400&&previous.rooms[1].temperatureC<c.rooms[1].setpointC&&output.rooms[1].temperatureC>=c.rooms[1].setpointC;
  previous=output;
 }
 assert.equal(previous.simulatedSeconds,1200);assert.ok(modulatedBelow18);assert.ok(crossedTarget);
 assert.ok(Math.abs(previous.rooms[1].temperatureC-c.rooms[1].setpointC)<.3);
 assert.ok(previous.diagnostics.rawDemandSpeedRps>c.compressor.speedMinRps&&previous.diagnostics.rawDemandSpeedRps<18);
 c.rooms.forEach(room=>room.enabled=false);e.updateConfig(c);
 const stopped=e.step(.25);check(stopped,c);assert.equal(stopped.electrical.compressorW,0);assert.ok(stopped.rooms.every(room=>room.thermostatCalling===false));
});
test('native cold startup and retained-hot-coil restart use admitted speed and actual energy ramp',()=>{
 const c=ownerDefaultConfig(),e=new HeatPumpEngine(p,c);let previous=e.snapshot();
 for(let i=0;i<32;i++){const output=e.step(.25);checkActualRamp(previous,output,c);previous=output;}
 assert.ok(previous.diagnostics.speedRps>c.compressor.speedMinRps,'cold startup accelerates within eight seconds');
 // Warm the actual coil through conserved running heat before an explicit Off/restart.
 for(let i=0;i<1168;i++){const output=e.step(.25);checkActualRamp(previous,output,c);previous=output;}
 assert.ok(previous.rooms[1].metalTemperatureC>30);
 c.rooms[1].enabled=false;e.updateConfig(c);
 for(let i=0;i<Math.ceil(c.control.minOffSeconds/.25);i++){previous=e.step(.25);check(previous,c);assert.equal(previous.electrical.compressorW,0);}
 assert.ok(previous.rooms[1].metalTemperatureC>c.rooms[1].initialTemperatureC,'restart retains actual warm metal storage');
 c.rooms[1].enabled=true;e.updateConfig(c);previous=e.snapshot();
 let increased=false;
 for(let i=0;i<32;i++){const output=e.step(.25);checkActualRamp(previous,output,c);increased ||= previous.diagnostics.speedRps>0&&output.diagnostics.speedRps>previous.diagnostics.speedRps;previous=output;}
 assert.ok(increased,'hot restart accelerates during the first eight seconds');
});
test('Reference slew configuration rejects nonfinite/nonpositive rates before state mutation',()=>{
 const c=defaultEngineConfig(1),e=new HeatPumpEngine(p,c),before=e.checkpoint();
 for(const field of ['inverterRampUpRpsPerSecond','inverterRampDownRpsPerSecond'])for(const value of [0,-1,NaN,Infinity]){
  const invalid=structuredClone(c);invalid.control[field]=value;
  assert.throws(()=>e.updateConfig(invalid),/Inverter slew/);assert.deepEqual(e.checkpoint(),before);
 }
});
test('inverter modulates continuously near target when load exceeds minimum capacity',()=>{
 const c=defaultEngineConfig(1);c.rooms[0].initialTemperatureC=21;c.rooms[0].envelopeWK=150;c.control.thermostatDeadbandK=.15;
 const e=new HeatPumpEngine(p,c);
 for(let i=0;i<2400;i++){const o=e.step(.25);check(o,c);assert.ok(o.cycle);assert.equal(o.rooms[0].thermostatCalling,true);}
 const final=e.snapshot();assert.ok(Math.abs(final.rooms[0].temperatureC-c.rooms[0].setpointC)<.2);
 assert.ok(final.diagnostics.speedRps>c.compressor.speedMinRps);assert.ok(final.diagnostics.speedRps<c.compressor.speedMaxRps);
});
test('below-minimum load cycles with dwell, while conventional operation uses a fixed speed',()=>{
 for(const strategy of ['inverter','on-off']){
  const c=defaultEngineConfig(1);c.control.strategy=strategy;c.control.thermostatDeadbandK=.15;c.rooms[0].initialTemperatureC=21;c.rooms[0].envelopeWK=5;c.rooms[0].airFabricWK=0;
  const e=new HeatPumpEngine(p,c);let running=false,stopped=false,restarted=false;
  for(let i=0;i<2400;i++){const o=e.step(.25);check(o,c);if(o.cycle){if(stopped)restarted=true;running=true;if(strategy==='on-off')assert.equal(o.diagnostics.speedRps,c.control.fixedSpeedRps);}else if(running)stopped=true;}
  assert.ok(stopped&&restarted,strategy);
 }
});

test('controller history rolls back on native failure and clears on strategy change',()=>{
 const c=defaultEngineConfig(1);c.rooms[0].setpointC=23;const e=new HeatPumpEngine(p,c);
 for(let i=0;i<100;i++)check(e.step(.25),c);
 const before=e.checkpoint();assert.ok(before.demandIntegralW[0]>0);
 const original=p.airH;p.airH=()=>{throw new Error('injected native air failure');};
 try{const o=e.step(.25);assert.match(o.diagnostics.fault,/injected native/);}finally{p.airH=original;}
 const after=e.checkpoint();assert.deepEqual(after.demandIntegralW,before.demandIntegralW);assert.equal(after.inverterCycling,before.inverterCycling);assert.deepEqual(after.thermostatCalls,before.thermostatCalls);assert.deepEqual(after.inventoryDrive,before.inventoryDrive);assert.deepEqual(after.rooms,before.rooms);
 c.control.strategy='on-off';e.updateConfig(c);assert.deepEqual(e.checkpoint().demandIntegralW,[0]);
 const invalid=structuredClone(c);delete invalid.control.fixedSpeedRps;invalid.compressor.speedMinRps=50;
 assert.throws(()=>new HeatPumpEngine(p,invalid),/Fixed compressor speed/);
});

test('live minimum-speed edits cannot publish a running command outside the selected range',()=>{
 const next=driveStep({speedRps:18,startupSeconds:20,offSeconds:0,protection:null},.25,{demandRps:35,minimumRps:30,maximumRps:75,maximumRatio:8,maximumDischargeC:145,minimumOffSeconds:30,pressureRatio:2,predictedDischargeC:60,pickupAvailable:true});
 assert.equal(next.speedRps,30);
});
