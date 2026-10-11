import fs from 'node:fs';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
const snapshot=process.argv[2];
if (!snapshot) throw Error('Pass the immutable native regression snapshot');
const root=new URL('../',import.meta.url),build=`${snapshot}/tests/engine/build`;
const {Properties,HeatPumpEngine,defaultEngineConfig}=await import(`${build}/index.js`);
const {ventilationExchange}=await import(`${build}/ventilation.js`);
const {default:Module}=await import(`${snapshot}/public/vendor/coolprop-safe/adapter.js`);
const native=await Module(),properties=new Properties(native),pressure=101325;
const humid=(output,t,w)=>native.HAPropsSI(output,'T',t+273.15,'W',w,'P',pressure);
const cases=[];
for (const [roomC,outdoorC,roomRH,outdoorRH] of [[22,0,.4,.5],[22,35,.4,.6],[22,22,.3,.6],[10,45,1,1]]) {
  const roomWater=properties.airW(roomC,roomRH,pressure),outdoorWater=properties.airW(outdoorC,outdoorRH,pressure);
  const cpRoom=humid('C',roomC,roomWater),cpOutdoor=humid('C',outdoorC,outdoorWater);
  for (const [t,w,cp] of [[roomC,roomWater,cpRoom],[outdoorC,outdoorWater,cpOutdoor]]) {
    // Forward derivative remains inside the gas domain at a saturated inlet.
    const derivative=(humid('H',t+.001,w)-humid('H',t,w))/.001;
    assert.ok(Math.abs(cp-derivative)<.02);
  }
  const flow=.08,gross=flow*(humid('H',outdoorC,outdoorWater)-humid('H',roomC,roomWater));
  const water=flow*(outdoorWater-roomWater),capacity=flow*Math.min(cpRoom,cpOutdoor);
  const efficiencies=[];
  for (const eta of [0,.75,1]) {
    const exchange=ventilationExchange(properties,flow,roomC,roomWater,outdoorC,outdoorWater,pressure,eta);
    const predicted=gross+eta*capacity*(roomC-outdoorC);
    assert.ok(Math.abs(exchange.heatToRoomW-predicted)<1e-10);
    assert.equal(exchange.waterToRoomKgs,water);
    efficiencies.push({eta,heatToRoomW:exchange.heatToRoomW,waterToRoomKgs:exchange.waterToRoomKgs});
  }
  cases.push({roomC,outdoorC,roomWater,outdoorWater,cpRoom,cpOutdoor,efficiencies});
}
const storage=[];
for (const outdoorC of [0,35,45]) {
  const cfg=defaultEngineConfig(1),room=cfg.rooms[0];
  cfg.outdoorTemperatureC=outdoorC;cfg.outdoorRelativeHumidity=outdoorC===45?1:.5;
  cfg.outdoor.naturalAirConductanceWK=0;
  Object.assign(room,{enabled:false,initialTemperatureC:outdoorC===45?10:22,
    initialRelativeHumidity:outdoorC===45?1:.4,envelopeWK:0,ventilationACH:.5,
    airFabricWK:0,naturalAirConductanceWK:0,fanPowerW:0,internalGainW:0,ventilationRecoveryEfficiency:0});
  const single=new HeatPumpEngine(properties,cfg),dualConfig=structuredClone(cfg);
  dualConfig.rooms[0].ventilationRecoveryEfficiency=.75;
  const dual=new HeatPumpEngine(properties,dualConfig),before=single.checkpoint().rooms[0];
  const mass=before.dryAirMassKg,flow=mass*.5/3600,roomC=room.initialTemperatureC;
  const wOutside=properties.airW(outdoorC,cfg.outdoorRelativeHumidity,pressure);
  const recovery=.75*flow*Math.min(humid('C',roomC,before.humidityRatio),humid('C',outdoorC,wOutside))*(roomC-outdoorC);
  const totalWater=s=>mass*s.humidityRatio+(s.retainedWaterKg??0);
  const outputs=[single.step(.25),dual.step(.25)];
  const states=[single.checkpoint().rooms[0],dual.checkpoint().rooms[0]];
  const expectedWater=totalWater(before)+.25*flow*(wOutside-before.humidityRatio);
  states.forEach(s=>assert.ok(Math.abs(totalWater(s)-expectedWater)<1e-11));
  assert.ok(Math.abs(states[1].airEnthalpyJ-states[0].airEnthalpyJ-recovery*.25)<1e-7);
  assert.ok(Math.abs(outputs[1].energy.boundaryEnergyJ-outputs[0].energy.boundaryEnergyJ-recovery*.25)<1e-7);
  outputs.forEach(o=>{assert.equal(o.diagnostics.fault,null);assert.equal(o.signedRoomHeatW,0);
    assert.equal(o.heatingCOP,null);assert.equal(o.coolingCOP,null);assert.equal(o.electrical.compressorW,0);
    assert.equal(o.energy.drainedWaterKg,0);assert.ok(Math.abs(o.energy.residualJ)<.01);
    assert.ok(Math.abs(o.energy.waterResidualKg)<1e-10);});
  let last=outputs[1];
  if(outdoorC===45)for(let i=1;i<40;i++){
    const accepted=dual.checkpoint().rooms[0],expected=totalWater(accepted)+.25*flow*(wOutside-accepted.humidityRatio);
    last=dual.step(.25);assert.equal(last.diagnostics.fault,null);
    assert.ok(Math.abs(totalWater(dual.checkpoint().rooms[0])-expected)<1e-11);
    assert.ok(Math.abs(last.energy.residualJ)<.01);assert.ok(Math.abs(last.energy.waterResidualKg)<1e-10);
  }
  if(outdoorC===45){assert.ok(last.rooms[0].retainedWaterKg>0);assert.equal(last.energy.drainedWaterKg,0);}
  storage.push({outdoorC,firstRecoveryW:recovery,firstRoomStorageDifferenceJ:states[1].airEnthalpyJ-states[0].airEnthalpyJ,
    finalTimeS:last.simulatedSeconds,retainedRoomWaterKg:last.rooms[0].retainedWaterKg,
    energyResidualJ:last.energy.residualJ,waterResidualKg:last.energy.waterResidualKg});
}
const sourceHashes={};
const hash=path=>crypto.createHash('sha256').update(fs.readFileSync(path)).digest('hex');
for (const name of ['engine','types','properties','demand','ventilation','cycle','envelope','drive']) {
  const path=`src/engine/${name}.ts`;
  sourceHashes[path]=hash(`${snapshot}/${path}`);assert.equal(sourceHashes[path],hash(new URL(path,root)));
}
for (const name of ['adapter.js','coolprop.js','coolprop.wasm']){
  const path=`public/vendor/coolprop-safe/${name}`;
  sourceHashes[path]=hash(`${snapshot}/${path}`);assert.equal(sourceHashes[path],hash(new URL(path,root)));
}
const receipt={checkedAt:new Date().toISOString(),snapshot,
  method:'Independent reviewer direct native EOS forward enthalpy derivatives, scalar Cmin reconstruction, frozen-state total H/W accounting and saturated-intake room phase evolution. Shared EOS; no independent experimental calibration.',
  sourceHashes,cases,storage};
fs.writeFileSync(new URL('reviews/average-u-ventilation-independent-results.json',root),JSON.stringify(receipt,null,2)+'\n');
console.log(JSON.stringify({sourceHashes,storage},null,2));
