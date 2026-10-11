// Reviewer-only native checks. Does not compile or modify implementation files.
import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import path from 'node:path';
const project=path.resolve(new URL('..',import.meta.url).pathname);
const snapshot=process.argv[2]??'/tmp/heatpump-inverter-control-final-tests';
const manifest=JSON.parse(await readFile(path.join(snapshot,'source-hashes.json')));
const digest=async file=>createHash('sha256').update(await readFile(file)).digest('hex');
for(const [file,expected] of Object.entries(manifest)){
 const actual=await digest(file.startsWith('compiled/')?path.join(snapshot,'build',file.slice(9)):path.join(project,file));
 assert.equal(actual,expected,`frozen artifact ${file}`);
}
const Module=(await import(pathToFileURL(path.join(project,'public/vendor/coolprop-safe/adapter.js')))).default;
const {Properties,HeatPumpEngine,defaultEngineConfig}=await import(pathToFileURL(path.join(snapshot,'build/index.js')));
const {roomDemand}=await import(pathToFileURL(path.join(snapshot,'build/demand.js')));
const {driveStep,newDriveState}=await import(pathToFileURL(path.join(snapshot,'build/drive.js')));
const p=new Properties(await Module()),checks=[];
for(const mode of ['heating','cooling']){
 const c=defaultEngineConfig(2);c.mode=mode;c.outdoorTemperatureC=mode==='heating'?1:35;
 const engine=new HeatPumpEngine(p,c),rooms=engine.checkpoint().rooms,sign=mode==='heating'?1:-1;
 const temperatures=c.rooms.map((room,i)=>room.setpointC+sign*(i===0?-.5:.5));
 for(const direction of ['upper','lower']){
  const result=roomDemand(c,rooms,temperatures,[true,true],[10,10],.25,true,direction);
  if(direction==='upper'){assert.equal(result.integralW[0],10);assert.ok(result.integralW[1]<10);}
  else{assert.ok(result.integralW[0]>10);assert.equal(result.integralW[1],10);}
 }
 checks.push({check:'directional antiwindup for opposite room errors',mode,pass:true});
}
const input={demandRps:20,minimumRps:8,maximumRps:75,maximumRatio:8,maximumDischargeC:145,minimumOffSeconds:30,pressureRatio:2,predictedDischargeC:70,pickupAvailable:true,inverterSlew:{upRpsPerSecond:2,downRpsPerSecond:4}};
for(const dt of [.25,.05]){
 let drive=driveStep(newDriveState(),dt,input);assert.equal(drive.speedRps,8);
 for(let t=0;t<3-1e-10;t+=dt)drive=driveStep(drive,dt,input);
 assert.ok(Math.abs(drive.speedRps-14)<1e-9);
 const stopped=driveStep(drive,dt,{...input,demandRps:0});assert.equal(stopped.speedRps,0);
 checks.push({check:'admitted startup, immediate ramp and explicit Off',dt,pass:true});
}
const c=defaultEngineConfig(1);c.compressor.speedMinRps=8;c.rooms[0].setpointC=23;
const engine=new HeatPumpEngine(p,c);
for(let i=0;i<160;i++){
 const o=engine.step(.25);assert.equal(o.diagnostics.fault,null);assert.ok(Math.abs(o.energy.residualJ)<.01);assert.ok(Math.abs(o.energy.waterResidualKg)<1e-10);
}
const before=structuredClone(engine.checkpoint()),makeOutput=engine.makeOutput;
let throwOnce=true,historyChangedBeforeFailure=false;
engine.makeOutput=function(...args){
 const output=makeOutput.apply(this,args);
 if(throwOnce){throwOnce=false;historyChangedBeforeFailure=JSON.stringify(this.demandIntegralW)!==JSON.stringify(before.demandIntegralW);throw new Error('independent post-candidate publication failure');}
 return output;
};
let fault;try{fault=engine.step(.25);}finally{engine.makeOutput=makeOutput;}
assert.match(fault.diagnostics.fault,/independent post-candidate/);
assert.ok(historyChangedBeforeFailure,'fault is injected after the new integral was computed');
const after=engine.checkpoint();
for(const key of ['time','rooms','ledgers','boundaryWater','outdoorEnergyJ','outdoorWaterKg','thermostatCalls','demandIntegralW','inventoryDrive','lastCycle'])assert.deepEqual(after[key],before[key],key);
assert.equal(fault.electrical.compressorW,0);assert.ok(fault.rooms.every(room=>room.fanSpeedFraction===0));
checks.push({check:'native40s storage conservation then failure after candidate integral/energy acceptance rolls back whole transaction',pass:true});
const receipt={status:'PASS',scope:'Independent controller checks against final frozen native/compiled hashes; separate from implementer1200s and broad release campaigns.',sourceHashes:manifest,runtimeConfigSha256:await digest(path.join(project,'src/runtime/config.ts')),scriptSha256:await digest(new URL(import.meta.url)),checks};
await writeFile(path.join(project,'reviews/low-load-controller-independent-results.json'),JSON.stringify(receipt,null,2)+'\n');
console.log(JSON.stringify({status:receipt.status,checks}));
