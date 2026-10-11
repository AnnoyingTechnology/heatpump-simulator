import test from'node:test';import assert from'node:assert/strict';import Module from'./backend.mjs';
import{Properties,HeatPumpEngine,defaultEngineConfig}from'./build/index.js';import{equilibrateRoomAir}from'./build/air.js';import{FUSION_JKG,ICE_CP_JKGK,WATER_CP_JKGK}from'./build/film.js';
import{driveStep,newDriveState}from'./build/drive.js';
const p=new Properties(await Module());
function ledger(o){assert.equal(o.diagnostics.fault,null);assert.ok(Math.abs(o.energy.residualJ)<.01);assert.ok(Math.abs(o.energy.waterResidualKg)<1e-10);}
test('room equilibrium preserves gas and retained liquid/ice energy and total water',()=>{
 for(const t of [-10,10]){const vapor=p.airW(t,1,101325),condensate=.01,h=p.airH(t,vapor,101325)+condensate*(t<0?-FUSION_JKG+ICE_CP_JKGK*t:WATER_CP_JKGK*t);
  const r=equilibrateRoomAir(p,h,vapor+condensate,101325,20);assert.ok(Math.abs(r.temperatureC-t)<1e-7);assert.ok(Math.abs(r.vaporWater+r.fogWater-vapor-condensate)<1e-12);
  const reconstructed=p.airH(r.temperatureC,r.vaporWater,101325)+(r.fogWater-r.fogIceWater)*WATER_CP_JKGK*r.temperatureC+r.fogIceWater*(-FUSION_JKG+ICE_CP_JKGK*r.temperatureC);assert.ok(Math.abs(reconstructed-h)<1e-5+1e-10*Math.abs(h));
 }
});
test('passive room condensation freezes and re-evaporates with conserved stores and volume edits',()=>{
 const c=defaultEngineConfig(1);c.rooms[0].enabled=false;c.rooms[0].volumeM3=24;c.rooms[0].envelopeWK=750;c.rooms[0].initialRelativeHumidity=.99;c.rooms[0].ventilationACH=0;c.outdoorTemperatureC=-20;c.outdoorRelativeHumidity=.35;
 const e=new HeatPumpEngine(p,c);for(let i=0;i<800;i++)ledger(e.step(.25));
 const cold=e.checkpoint();assert.ok(cold.rooms[0].retainedWaterKg>0);assert.ok(cold.rooms[0].retainedIceKg>0);
 const before=cold.rooms[0].retainedWaterKg;c.rooms[0].volumeM3=30;e.updateConfig(c);assert.equal(e.checkpoint().rooms[0].retainedWaterKg,before);
 c.ambientPressurePa=90000;const edit=e.updateConfig(c);ledger(edit);assert.ok(edit.rooms[0].relativeHumidity<=1);
 c.outdoorTemperatureC=35;e.updateConfig(c);for(let i=0;i<800;i++)ledger(e.step(.25));assert.equal(e.checkpoint().rooms[0].retainedWaterKg,0);
});
test('dirty indoor cooling stops above freezing, warms with fan heat and restarts without remapping',()=>{
 const c=defaultEngineConfig(1);c.mode='cooling';c.outdoorTemperatureC=42;c.outdoorRelativeHumidity=.35;c.rooms[0].initialTemperatureC=30;c.rooms[0].setpointC=17;c.rooms[0].envelopeWK=70;c.rooms[0].volumeM3=100;c.rooms[0].cleanFraction=.1;
 const e=new HeatPumpEngine(p,c);let hold=false,restart=false;
 for(let i=0;i<1600;i++){const o=e.step(.25);ledger(o);assert.ok(o.rooms[0].metalTemperatureC>=2);if(o.diagnostics.envelopeProtection==='indoor antifreeze'){hold=true;assert.equal(o.cycle,null);assert.equal(o.electrical.compressorW,0);assert.equal(o.coolingCOP,null);assert.ok(o.electrical.indoorFansW>0);}else if(hold&&o.cycle)restart=true;}
 assert.ok(hold&&restart);
});

test('simultaneous discharge protection does not erase antifreeze recovery hysteresis',()=>{
 const input={demandRps:35,minimumRps:18,maximumRps:75,maximumRatio:8,maximumDischargeC:145,minimumOffSeconds:30,pressureRatio:3,predictedDischargeC:140,pickupAvailable:true,coolingCoilC:1};
 let state=driveStep(newDriveState(),.25,input);assert.equal(state.protection,'discharge temperature');assert.ok(state.antifreezeHold);
 state=driveStep({...state,offSeconds:60},.25,{...input,predictedDischargeC:80,coolingCoilC:3});assert.equal(state.speedRps,0);assert.ok(state.antifreezeHold);
 state=driveStep(state,.25,{...input,predictedDischargeC:80,coolingCoilC:5});assert.equal(state.speedRps,18);assert.equal(state.antifreezeHold,false);
});
