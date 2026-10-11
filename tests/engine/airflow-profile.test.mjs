import test from 'node:test';import assert from 'node:assert/strict';
import Module from './backend.mjs';import {Properties,HeatPumpEngine,defaultEngineConfig}from'./build/index.js';
const p=new Properties(await Module());
test('volumetric profile converts at actual inlet humid-air specific volume',()=>{
 for(const [mode,t] of [['heating',-10],['cooling',42]]){
  const mass=defaultEngineConfig(1);mass.mode=mode;mass.outdoorTemperatureC=t;mass.outdoorRelativeHumidity=.35;if(mode==='cooling'){mass.rooms[0].initialTemperatureC=27;mass.rooms[0].setpointC=22;}
  const volume=structuredClone(mass),r=volume.rooms[0];
  const wi=p.airW(r.initialTemperatureC,r.initialRelativeHumidity,mass.ambientPressurePa),wo=p.airW(t,.35,mass.ambientPressurePa);
  r.volumetricAirFlowM3s=r.airMassFlowKgs*p.dryAirSpecificVolume(r.initialTemperatureC,wi,mass.ambientPressurePa);
  volume.outdoor.volumetricAirFlowM3s=volume.outdoor.airMassFlowKgs*p.dryAirSpecificVolume(t,wo,mass.ambientPressurePa);
  const a=new HeatPumpEngine(p,mass).step(.25),b=new HeatPumpEngine(p,volume).step(.25);
  assert.equal(a.diagnostics.fault,null);assert.equal(b.diagnostics.fault,null);assert.ok(Math.abs(a.signedRoomHeatW-b.signedRoomHeatW)<1e-7);assert.ok(Math.abs(a.rooms[0].temperatureC-b.rooms[0].temperatureC)<1e-10);assert.ok(Math.abs(a.outdoor.temperatureC-b.outdoor.temperatureC)<1e-10);assert.ok(Math.abs(b.energy.residualJ)<.01);assert.ok(Math.abs(b.energy.waterResidualKg)<1e-10);
 }
 for(const value of [0,-1,NaN,Infinity]){const c=defaultEngineConfig(1);c.rooms[0].volumetricAirFlowM3s=value;assert.throws(()=>new HeatPumpEngine(p,c),/Volumetric airflow/);}
});
