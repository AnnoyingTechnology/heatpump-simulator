import fs from 'node:fs';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
const snapshot=process.argv[2];
if(!snapshot)throw Error('Pass immutable focused snapshot');
const root=new URL('../',import.meta.url),build=`${snapshot}/tests/engine/build`;
const {Properties,HeatPumpEngine,defaultEngineConfig}=await import(`${build}/index.js`);
const {thermostatDemand,thermostatFanFraction}=await import(`${build}/thermostat.js`);
const {airExchange,equilibrateRoomAir}=await import(`${build}/air.js`);
const {default:Module}=await import(`${snapshot}/public/vendor/coolprop-safe/adapter.js`);
const p=new Properties(await Module()),dt=.25;
const hash=x=>crypto.createHash('sha256').update(fs.readFileSync(x)).digest('hex');
const sourceHashes={};
for(const file of ['thermostat','demand','engine','types','cycle','drive','envelope','air','ventilation','properties','defaults']){
 const path=`src/engine/${file}.ts`;sourceHashes[path]=hash(`${snapshot}/${path}`);
 assert.equal(sourceHashes[path],hash(new URL(path,root)));
}
for(const file of ['adapter.js','coolprop.js','coolprop.wasm']){
 const path=`public/vendor/coolprop-safe/${file}`;sourceHashes[path]=hash(`${snapshot}/${path}`);
 assert.equal(sourceHashes[path],hash(new URL(path,root)));
}
const scalar=[];
for(const prior of [false,true])for(const error of [-1.001,-1,-.999,-.001,0,.001,.999,1,1.001]){
 const expected=prior?error>-1:error>=1;
 assert.equal(thermostatDemand(true,error,prior,1),expected);
 assert.equal(thermostatDemand(false,error,prior,1),false);
 if(expected){const fraction=thermostatFanFraction(true,error,1);assert.equal(fraction,.25+.75*Math.max(0,Math.min(1,(error+1)/2)));}
 scalar.push({prior,error,expected});
}
const runs=[];
const valid=(o,c)=>{assert.equal(o.diagnostics.fault,null);assert.ok(Math.abs(o.energy.residualJ)<.01);assert.ok(Math.abs(o.energy.waterResidualKg)<1e-10);if(o.cycle){assert.ok(o.cycle.closureResidualW<=c.numerics.pressureToleranceW);assert.ok(o.cycle.discharge.temperatureC<c.compressor.maxDischargeC);assert.ok(o.cycle.highPressureBarAbs/o.cycle.lowPressureBarAbs<c.compressor.maxPressureRatio);}else assert.equal(o.electrical.compressorW,0);};
for(const mode of ['heating','cooling']){
 const c=defaultEngineConfig(2),sign=mode==='heating'?1:-1;
 c.mode=mode;c.outdoorTemperatureC=mode==='heating'?7:32;c.outdoorRelativeHumidity=.4;
 c.rooms.forEach(r=>Object.assign(r,{initialTemperatureC:mode==='heating'?21:26,initialRelativeHumidity:mode==='heating'?.65:1,cleanFraction:.6,ventilationACH:0,envelopeWK:0,airFabricWK:0,naturalAirConductanceWK:0}));
 c.rooms[0].setpointC=c.rooms[0].initialTemperatureC;
 c.rooms[0].internalGainW=mode==='heating'?10000:0;
 c.rooms[1].setpointC=c.rooms[1].initialTemperatureC+sign*3;
 const initialConfig=structuredClone(c),e=new HeatPumpEngine(p,c),before=e.checkpoint(),o=e.step(dt);valid(o,c);
 assert.ok(o.cycle);assert.deepEqual(o.rooms.map(r=>r.thermostatCalling),[true,true]);
 assert.ok(Math.abs(o.rooms[0].fanSpeedFraction-.625)<1e-12);assert.ok(o.cycle.branchMassFlowsKgs[0]>0);
 const s=before.rooms[0],r=c.rooms[0],f=.625,md=r.airMassFlowKgs*f*r.cleanFraction;
 const air=airExchange(p,r.initialTemperatureC,s.humidityRatio,s.metalTemperatureC,md,r.airConductanceWK*f*r.cleanFraction,c.ambientPressurePa,0,true,true);
 const fan=r.fanPowerW*f**3,next=e.checkpoint().rooms[0];
 assert.ok(Math.abs(o.rooms[0].fanPowerW-fan)<1e-10);
 assert.ok(Math.abs(o.rooms[0].signedRoomHeatW-air.signedHeatToAirW-fan)<1e-9);
 assert.ok(Math.abs(next.airEnthalpyJ-s.airEnthalpyJ-dt*(air.signedHeatToAirW+fan+(r.internalGainW??0)))<1e-7);
 const totalWater=x=>x.dryAirMassKg*x.humidityRatio+(x.retainedWaterKg??0);
 assert.ok(Math.abs(totalWater(next)-totalWater(s)+dt*air.waterToSurfaceKgs)<1e-11);
 assert.ok(Math.abs(next.metalTemperatureC-s.metalTemperatureC-dt*(o.cycle.branchCoilHeatW[0]+air.heatFromAirW-air.drainEnthalpyW)/r.metalCapacityJK)<1e-12);
 const first={fanFraction:f,fanW:fan,branchMassKgs:o.cycle.branchMassFlowsKgs[0],closureW:o.cycle.closureResidualW,energyResidualJ:o.energy.residualJ,waterResidualKg:o.energy.waterResidualKg};
 let wetInterval=null;
 if(mode==='cooling'){
  const wetBefore=e.checkpoint().rooms[0],t=wetBefore.retainedWaterKg>0?equilibrateRoomAir(p,wetBefore.airEnthalpyJ/wetBefore.dryAirMassKg,wetBefore.humidityRatio+wetBefore.retainedWaterKg/wetBefore.dryAirMassKg,c.ambientPressurePa,wetBefore.fabricTemperatureC).temperatureC:p.airT(wetBefore.airEnthalpyJ/wetBefore.dryAirMassKg,wetBefore.humidityRatio,c.ambientPressurePa),error=sign*(c.rooms[0].setpointC-t);
  const fraction=.25+.75*Math.max(0,Math.min(1,(error+1)/2)),wetFan=c.rooms[0].fanPowerW*fraction**3;
  const exchange=airExchange(p,t,wetBefore.humidityRatio,wetBefore.metalTemperatureC,c.rooms[0].airMassFlowKgs*fraction*c.rooms[0].cleanFraction,c.rooms[0].airConductanceWK*fraction*c.rooms[0].cleanFraction,c.ambientPressurePa,0,true,true);
  const wet=e.step(dt),wetAfter=e.checkpoint().rooms[0];valid(wet,c);assert.ok(exchange.waterToSurfaceKgs>0);
  assert.ok(Math.abs(wetAfter.airEnthalpyJ-wetBefore.airEnthalpyJ-dt*(exchange.signedHeatToAirW+wetFan))<1e-7,JSON.stringify({t,error,fraction,wetFan,actualFan:wet.rooms[0].fanPowerW,actualQ:wet.rooms[0].signedRoomHeatW,predictedQ:exchange.signedHeatToAirW+wetFan,delta:wetAfter.airEnthalpyJ-wetBefore.airEnthalpyJ,expectedDelta:dt*(exchange.signedHeatToAirW+wetFan)}));
  assert.ok(Math.abs(totalWater(wetAfter)-totalWater(wetBefore)+dt*exchange.waterToSurfaceKgs)<1e-11);
  assert.ok(Math.abs(wet.rooms[0].condensateKgs-exchange.waterToSurfaceKgs)<1e-12);
  wetInterval={condensateKgs:exchange.waterToSurfaceKgs,fanW:wetFan,energyResidualJ:wet.energy.residualJ,waterResidualKg:wet.energy.waterResidualKg};
 }
 // Force a thermostat transition inside a failed transaction, then inspect rollback.
 c.rooms[0].setpointC=o.rooms[0].temperatureC-sign*1.2;e.updateConfig(c);
 const accepted=e.checkpoint(),original=p.airH;p.airH=()=>{throw Error('reviewer injected humid-air failure');};
 try{assert.match(e.step(dt).diagnostics.fault,/reviewer injected/);}finally{p.airH=original;}
 const failed=e.checkpoint();
 for(const key of ['time','rooms','thermostatCalls','active','demandIntegralW','inventoryDrive','ledgers','outdoorEnergyJ','outdoorWaterKg'])assert.deepEqual(failed[key],accepted[key],key);
 // Test ordinary stopping/dwell separately from explicit fault recovery.
 const ordinary=new HeatPumpEngine(p,initialConfig),running=ordinary.step(dt);valid(running,initialConfig);
 const stopConfig=structuredClone(initialConfig);
 stopConfig.rooms.forEach((r,i)=>{r.setpointC=running.rooms[i].temperatureC-sign*1.2;});
 const oldStores=ordinary.checkpoint().rooms;ordinary.updateConfig(stopConfig);
 ordinary.checkpoint().rooms.forEach((r,i)=>{assert.ok(Math.abs(r.metalTemperatureC-oldStores[i].metalTemperatureC)<1e-10);assert.ok(Math.abs(r.airEnthalpyJ-oldStores[i].airEnthalpyJ)<1e-7);});
 const stopped=ordinary.step(dt);valid(stopped,stopConfig);
 assert.deepEqual(stopped.rooms.map(r=>r.thermostatCalling),[false,false]);assert.equal(stopped.cycle,null);
 assert.equal(stopped.electrical.indoorFansW,0);assert.equal(stopped.electrical.outdoorFanW,0);
 ordinary.checkpoint().rooms.forEach((r,i)=>assert.equal(r.metalTemperatureC,oldStores[i].metalTemperatureC,'isolated passive metal retains its stored energy'));
 const stoppedAt=stopped.simulatedSeconds;
 stopConfig.rooms[0].setpointC=stopped.rooms[0].temperatureC+sign*1.2;ordinary.updateConfig(stopConfig);
 const dwelling=ordinary.step(dt);valid(dwelling,stopConfig);assert.equal(dwelling.cycle,null);assert.equal(dwelling.rooms[0].thermostatCalling,true);
 const diagnosticEngine=new HeatPumpEngine(p,initialConfig),diagnosticBefore=diagnosticEngine.step(dt);valid(diagnosticBefore,initialConfig);
 const savedAirT=p.airT;p.airT=()=>{throw Error('reviewer forced output inverse failure');};
 let diagnostic;
 try{diagnostic=diagnosticEngine.step(dt);}finally{p.airT=savedAirT;}
 assert.match(diagnostic.diagnostics.fault,/reviewer forced output/);
 diagnostic.rooms.forEach((r,i)=>{assert.equal(r.active,false);assert.equal(r.fanPowerW,0);assert.equal(r.fanSpeedFraction,0);assert.equal(r.thermostatCalling,diagnosticBefore.rooms[i].thermostatCalling);});
 runs.push({mode,first,wetInterval,rollback:true,allCallsOff:true,restartHeldByDwell:true,faultFallbackFanCommandZero:true,stoppedAt});
}
const receipt={checkedAt:new Date().toISOString(),snapshot,method:'Reviewer independent threshold table and frozen native two-mode interval heat/water/metal reconstruction; fault-transition rollback and stopped/dwell checks. Shared EOS and air-exchange implementation, no experimental calibration.',sourceHashes,scalar,runs};
fs.writeFileSync(new URL('reviews/indoor-comfort-independent-results.json',root),JSON.stringify(receipt,null,2)+'\n');
console.log(JSON.stringify({runs,sourceHashes},null,2));
