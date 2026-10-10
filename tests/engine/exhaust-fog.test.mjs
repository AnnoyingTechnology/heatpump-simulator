import test from 'node:test';
import assert from 'node:assert/strict';
import Module from './backend.mjs';
import {Properties} from './build/index.js';
import {airExchange,equilibrateExhaust} from './build/air.js';
import {FUSION_JKG,ICE_CP_JKGK,WATER_CP_JKGK} from './build/film.js';
const p=new Properties(await Module()),ambient=101325;
const reconstruct=s=>p.airH(s.temperatureC,s.vaporWater,ambient)+(s.fogWater-s.fogIceWater)*WATER_CP_JKGK*s.temperatureC+s.fogIceWater*(-FUSION_JKG+ICE_CP_JKGK*s.temperatureC);
test('outdoor exhaust equilibrium closes vapor/ice/liquid and fusion enthalpy without depositing mist',()=>{
 for(const [t,iceFraction] of [[-2,1],[1,0],[0,.4]]){
  const vapor=p.airW(t,1,ambient),fog=.0002,w=vapor+fog;
  const h=p.airH(t,vapor,ambient)+fog*(iceFraction*(-FUSION_JKG+ICE_CP_JKGK*t)+(1-iceFraction)*WATER_CP_JKGK*t);
  const s=equilibrateExhaust(p,h,w,ambient,20);
  assert.ok(Math.abs(s.temperatureC-t)<1e-6);assert.ok(Math.abs(reconstruct(s)-h)<=1e-5+1e-10*Math.abs(h));
  assert.ok(Math.abs(s.vaporWater+s.fogWater-w)<1e-12);assert.ok(s.fogIceWater>=0&&s.fogIceWater<=s.fogWater);
  const fan=equilibrateExhaust(p,h+100,w,ambient,20);assert.ok(Math.abs(reconstruct(fan)-(h+100))<=1e-5+1e-10*Math.abs(h+100));
 }
});
test('supersaturated contact exhaust preserves original contact water/heat and indoor fog stays explicit',()=>{
 const w=p.airW(0,.99,ambient),md=.5,ua=250;
 const a=airExchange(p,0,w,-5,md,ua,ambient,0,false,true);
 assert.ok(a.fogWater>0);assert.ok(Math.abs(a.waterToSurfaceKgs-md*(w-a.totalOutletWater))<1e-12);
 assert.ok(Math.abs(a.heatFromAirW-md*(p.airH(0,w,ambient)-a.totalOutletEnthalpyJkg))<1e-9);
 assert.throws(()=>airExchange(p,0,w,-5,md,ua,ambient,0,false,false),/Indoor air outlet fog/);
});
test('dry/unsaturated exhaust and saturation onset retain total H/W; fan heat evaporates fog',()=>{
 for(const w of [0,p.airW(20,.4,ambient)]){
  const h=p.airH(20,w,ambient),s=equilibrateExhaust(p,h,w,ambient,20);
  assert.equal(s.fogWater,0);assert.ok(Math.abs(s.temperatureC-20)<1e-7);assert.equal(s.totalEnthalpyJkg,h);assert.equal(s.totalWater,w);
 }
 for(const t of [-.01,0,.01,5]){
  const w=p.airW(t,1,ambient),h=p.airH(t,w,ambient);
  for(const delta of [-.01,.01]){const s=equilibrateExhaust(p,h+delta,w,ambient,20);assert.ok(Math.abs(reconstruct(s)-(h+delta))<=1e-5+1e-10*Math.abs(h+delta));}
 }
 const w=p.airW(1,1,ambient)+.0002,h=p.airH(1,w-.0002,ambient)+.0002*WATER_CP_JKGK;
 const heated=equilibrateExhaust(p,h+3000,w,ambient,20);assert.equal(heated.fogWater,0);assert.ok(Math.abs(reconstruct(heated)-(h+3000))<1e-5);
});
test('outdoor fan phase-flash backend failure rolls back thermal stores, clock and drive',async()=>{
 const {HeatPumpEngine,defaultEngineConfig}=await import('./build/index.js');const config=defaultEngineConfig(3);config.outdoorTemperatureC=-6;config.outdoorRelativeHumidity=.99;const e=new HeatPumpEngine(p,config);
 config.outdoorTemperatureC=0;e.updateConfig(config); // Real weather edit leaves a cold outdoor metal store.
 const expectedWater=airExchange(p,0,p.airW(0,.99,config.ambientPressurePa),-6,config.outdoor.airMassFlowKgs,config.outdoor.airConductanceWK,config.ambientPressurePa,0,false,true).totalOutletWater;
 const before=structuredClone(e.checkpoint()),humid=p.humid.bind(p);let dewCalls=0;
 p.humid=(...args)=>{if(args[0]==='D'&&args[3]==='W'&&args[4]===expectedWater&&++dewCalls===2)throw new Error('Injected exhaust fan HA failure');return humid(...args)};
 let out;try{out=e.step(.25)}finally{p.humid=humid}
 assert.equal(dewCalls,2);assert.match(out.diagnostics.fault,/Injected exhaust fan HA failure/);
 const after=e.checkpoint();for(const key of ['rooms','outdoorEnergyJ','outdoorWaterKg','time','stateTime','heatingRuntime','onTime','offTime','active','ledgers','boundaryWater','inventoryDrive'])assert.deepEqual(after[key],before[key],key);
 assert.equal(out.cycle,null);assert.equal(out.electrical.compressorW,0);assert.equal(out.heatingCOP,null);
});
