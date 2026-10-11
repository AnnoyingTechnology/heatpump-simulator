import test from'node:test';import assert from'node:assert/strict';import {readFile}from'node:fs/promises';import Module from'./backend.mjs';
import{Properties,HeatPumpEngine,defaultEngineConfig}from'./build/index.js';import{driveStep,newDriveState}from'./build/drive.js';import{estimateHeldEnvelope}from'./build/envelope.js';
const p=new Properties(await Module()),input={demandRps:35,minimumRps:18,maximumRps:75,maximumRatio:8,maximumDischargeC:145,minimumOffSeconds:30,pressureRatio:3,predictedDischargeC:140,pickupAvailable:true,coolingMode:true};
test('reverse-order protections, unknown stopped sensor and mode exit preserve each release requirement',()=>{
 let s=driveStep(newDriveState(),.25,input);s=driveStep({...s,offSeconds:60},.25,{...input,predictedDischargeC:120,coolingCoilC:1});
 s=driveStep(s,.25,{...input,predictedDischargeC:120,coolingCoilC:5});assert.equal(s.speedRps,0);assert.ok(s.dischargeHold);assert.equal(s.antifreezeHold,false);
 s=driveStep(s,.25,{...input,predictedDischargeC:100,coolingCoilC:5});assert.equal(s.speedRps,18);
 s=driveStep(s,.25,{...input,predictedDischargeC:80,coolingCoilC:1});
 s=driveStep({...s,offSeconds:60},.25,{...input,demandRps:0,predictedDischargeC:null,pickupAvailable:false});assert.ok(s.antifreezeHold);assert.equal(s.speedRps,0);
 s=driveStep(s,.25,{...input,predictedDischargeC:80,coolingCoilC:3});assert.equal(s.speedRps,0);
 s=driveStep(s,.25,{...input,predictedDischargeC:80,coolingMode:false});assert.equal(s.speedRps,18);
});
test('held-envelope estimate detects excessive discharge before an out-of-envelope PH flash',()=>{
 const c=defaultEngineConfig(1);c.compressor.isentropicEfficiency=.4186110433423892;
 const estimate=estimateHeldEnvelope(p,c,'heating',[30],-20,[true]);assert.ok(estimate.available);assert.ok(estimate.dischargeExceeded);assert.equal(estimate.dischargeC,null);
 const heterogeneous=estimateHeldEnvelope(p,c,'heating',[5,50],20,[true,true]);assert.ok(heterogeneous.available);assert.ok(heterogeneous.condensingC<20,'cold branch allows the floating mixed-header recovery estimate');
 const unavailable=estimateHeldEnvelope(p,c,'heating',[30],-50,[true]);assert.equal(unavailable.available,false);
});
test('retained cold-start and hot dirty cooling failures close or protect throughout their original schedules',async()=>{
 for(const fixture of ['robustness-20261011/sequence-3.json','robustness-20261012/grid-cooling-45-0.json']){
  const scenario=JSON.parse(await readFile(new URL(`./fixtures/${fixture}`,import.meta.url),'utf8'));
  const e=new HeatPumpEngine(p,scenario.config);
  for(const operation of scenario.operations){if(operation.type==='update'){e.updateConfig(operation.config);continue;}if(operation.type!=='step')throw Error('Unknown fixture operation');
   for(let elapsed=0;elapsed<operation.seconds-1e-10;elapsed+=.25){const o=e.step(Math.min(.25,operation.seconds-elapsed));assert.equal(o.diagnostics.fault,null,`${scenario.id} ${o.simulatedSeconds}`);assert.ok(Math.abs(o.energy.residualJ)<.01);assert.ok(Math.abs(o.energy.waterResidualKg)<1e-10);
    if(o.cycle){assert.ok(o.cycle.closureResidualW<=scenario.config.numerics.pressureToleranceW);assert.ok(o.cycle.condensingC<63);assert.ok(o.cycle.discharge.temperatureC<scenario.config.compressor.maxDischargeC);}else assert.equal(o.electrical.compressorW,0);
   }
  }
  // A historical trajectory need not encounter the same hold after comfort
  // calls change. Mandatory actual cold-envelope holds are provoked below.
 }
});

test('declared low-efficiency cold-source demand holds discharge, retains stores and recovers on a warmed boundary',()=>{
 const c=defaultEngineConfig(1);c.outdoorTemperatureC=-20;c.outdoorRelativeHumidity=.2;
 c.rooms[0].initialTemperatureC=30;c.rooms[0].setpointC=35;
 c.compressor.isentropicEfficiency=.4186110433423892; // Deliberate generic envelope provocation, not owner calibration.
 const e=new HeatPumpEngine(p,c);let o=e.step(.25);
 const check=o=>{assert.equal(o.diagnostics.fault,null);assert.ok(Math.abs(o.energy.residualJ)<.01);assert.ok(Math.abs(o.energy.waterResidualKg)<1e-10);};
 check(o);assert.equal(o.diagnostics.envelopeProtection,'discharge temperature');assert.equal(o.cycle,null);assert.equal(o.electrical.compressorW,0);assert.equal(o.rooms[0].thermostatCalling,true);
 const heldAt=o.simulatedSeconds;
 for(let i=0;i<4;i++){o=e.step(.25);check(o);assert.equal(o.diagnostics.envelopeProtection,'discharge temperature');assert.equal(o.electrical.compressorW,0);}
 const stores=e.checkpoint();c.outdoorTemperatureC=20;const configured=e.updateConfig(c);
 assert.equal(e.checkpoint().outdoorEnergyJ,stores.outdoorEnergyJ);assert.equal(e.checkpoint().outdoorWaterKg,stores.outdoorWaterKg);
 assert.ok(Math.abs(configured.energy.configurationEnergyJ-o.energy.configurationEnergyJ)<1e-5);
 let heldWarmIntervals=0;
 for(let i=0;i<720;i++){
  o=e.step(.25);check(o);
  if(o.cycle){
   assert.ok(heldWarmIntervals>0);assert.ok(o.simulatedSeconds-heldAt>=c.control.minOffSeconds);
   assert.equal(o.diagnostics.envelopeProtection,null);assert.ok(o.cycle.compressorWorkW>0);
   assert.ok(o.cycle.closureResidualW<=c.numerics.pressureToleranceW);assert.ok(Math.abs(o.cycle.massResidualKgs)*250000<=c.numerics.pressureToleranceW);
   assert.ok(o.cycle.discharge.temperatureC<c.compressor.maxDischargeC);return;
  }
  heldWarmIntervals++;assert.equal(o.electrical.compressorW,0);assert.equal(o.rooms[0].thermostatCalling,true);
 }
 assert.fail('real thermal evolution did not release the cold discharge hold within 180 s');
});
