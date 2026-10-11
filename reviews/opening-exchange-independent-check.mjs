import fs from 'node:fs';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
const snapshot=process.argv[2];
if(!snapshot)throw Error('Pass immutable opening snapshot');
const root=new URL('../',import.meta.url),build=`${snapshot}/tests/engine/build`;
const {Properties,HeatPumpEngine,defaultEngineConfig}=await import(`${build}/index.js`);
const {interzoneEdgeTransfer,interzoneHeatPowers,interzoneTargetLosses}=await import(`${build}/interzone.js`);
const {default:Module}=await import(`${snapshot}/public/vendor/coolprop-safe/adapter.js`);
const native=await Module(),p=new Properties(native);
const near=(a,b,t=1e-9)=>assert.ok(Math.abs(a-b)<t,`${a} vs ${b}`);
const hash=x=>crypto.createHash('sha256').update(fs.readFileSync(x)).digest('hex');
const sourceHashes={};
for(const file of ['interzone','engine','types','demand','cycle','drive','envelope','air','properties']){
 const path=`src/engine/${file}.ts`;sourceHashes[path]=hash(`${snapshot}/${path}`);assert.equal(sourceHashes[path],hash(new URL(path,root)));
}
for(const file of ['adapter.js','coolprop.js','coolprop.wasm']){
 const path=`public/vendor/coolprop-safe/${file}`;sourceHashes[path]=hash(`${snapshot}/${path}`);assert.equal(sourceHashes[path],hash(new URL(path,root)));
}
const solid=45/(.26+.120/.040),floor={roomA:'low',roomB:'high',conductanceWK:solid,openingExchange:{orientation:'vertical',lowerRoomId:'low',areaM2:4}};
const scalar=[];
for(const [low,high] of [[16,21.5],[21.5,18.5],[18.5,21.5],[21.5,21.5],[40,-10]]){
 // Independent reduced-gravity reconstruction of EnergyPlus13.38 for square DH=sqrt(A).
 const mean=(low+high)/2+273.15,oneWay=.055*Math.sqrt(9.81*Math.max(0,low-high)/mean*2**5);
 const predicted=solid*(low-high)+1.2*1006*oneWay*(low-high),actual=interzoneEdgeTransfer(floor,low,high);
 near(actual.equivalentExchangeM3s,oneWay);near(actual.heatFromAToBW,predicted);
 const reversed={...floor,roomA:'high',roomB:'low'},swapped=interzoneEdgeTransfer(reversed,high,low);
 near(swapped.heatFromAToBW,-predicted);near(swapped.equivalentExchangeM3s,oneWay);
 scalar.push({lowC:low,highC:high,oneWayEquivalentM3s:oneWay,heatFromLowerToUpperW:predicted,state:actual.buoyancyState});
}
// Independent numerical integration of local Bernoulli velocity over one half
// of a rectangular wall aperture. The midpoint rule handles the neutral-plane root.
const wallChecks=[];
for(const [area,height,cd,a,b] of [[4,2,.6,25,15],[2,1.7,.45,15,23]]){
 const n=32768,dy=height/(2*n),width=area/height,mean=273.15+(a+b)/2;
 let oneWay=0;
 for(let i=0;i<n;i++)oneWay+=cd*width*Math.sqrt(2*9.81*Math.abs(a-b)/mean*(i+.5)*dy)*dy;
 const wall={roomA:'a',roomB:'b',conductanceWK:solid,openingExchange:{orientation:'horizontal',areaM2:area,heightM:height,wallDischargeCoefficient:cd}};
 const actual=interzoneEdgeTransfer(wall,a,b),relative=Math.abs(actual.equivalentExchangeM3s-oneWay)/oneWay;
 assert.ok(relative<1e-6);wallChecks.push({areaM2:area,heightM:height,cd,aC:a,bC:b,integratedOneWayM3s:oneWay,implementedOneWayM3s:actual.equivalentExchangeM3s,relativeDifference:relative});
}
const config=defaultEngineConfig(3);config.rooms.forEach((r,i)=>{r.id=['ground','first','attic'][i];r.enabled=i===1;r.setpointC=i===1?23:-500;});
config.interzoneLinks=[{...floor,roomA:'ground',roomB:'first',openingExchange:{...floor.openingExchange,lowerRoomId:'ground'}},{...floor,roomA:'first',roomB:'attic',openingExchange:{...floor.openingExchange,lowerRoomId:'first'}}];
const temperatures=[16,21.5,18.5],powers=interzoneHeatPowers(config,temperatures),losses=interzoneTargetLosses(config,temperatures);
near(powers.reduce((a,b)=>a+b,0),0);
near(losses[1],-interzoneEdgeTransfer(config.interzoneLinks[0],16,23).heatFromAToBW+interzoneEdgeTransfer(config.interzoneLinks[1],23,18.5).heatFromAToBW);
assert.equal(losses[0],0);assert.equal(losses[2],0);
const control={actualTemperaturesC:temperatures,roomPowersW:powers,ownTarget23LossW:losses[1],offTargetsIgnored:true};
const valid=o=>{assert.equal(o.diagnostics.fault,null);assert.ok(Math.abs(o.energy.residualJ)<.01);assert.ok(Math.abs(o.energy.waterResidualKg)<1e-10);assert.equal(o.cycle,null);assert.equal(o.electrical.compressorW,0);assert.equal(o.heatingCOP,null);assert.equal(o.coolingCOP,null);};
const isolate=(ts,volumes,rhs)=>{
 const c=defaultEngineConfig(ts.length);c.outdoorTemperatureC=20;c.outdoorRelativeHumidity=.1;c.outdoor.naturalAirConductanceWK=0;c.control.controlsW=0;
 c.rooms.forEach((r,i)=>Object.assign(r,{enabled:false,id:['low','high','third'][i],volumeM3:volumes[i],initialTemperatureC:ts[i],initialRelativeHumidity:rhs[i],envelopeWK:0,ventilationACH:0,airFabricWK:0,naturalAirConductanceWK:0,fanPowerW:0}));return c;
};
const roomWater=s=>s.dryAirMassKg*s.humidityRatio+(s.retainedWaterKg??0);
const c=isolate([25,15],[60,60],[1,.1]);c.interzoneLinks=[floor];
const e=new HeatPumpEngine(p,c),before=e.checkpoint(),q=interzoneEdgeTransfer(floor,25,15).heatFromAToBW,o=e.step(.25),after=e.checkpoint();valid(o);
before.rooms.forEach((r,i)=>{near(after.rooms[i].airEnthalpyJ-r.airEnthalpyJ,.25*q*(i===0?-1:1),1e-7);near(roomWater(after.rooms[i]),roomWater(r),1e-11);});
assert.ok(after.rooms[0].retainedWaterKg>0,'sensible cooling retains local condensed water without transporting water');
near(o.energy.boundaryEnergyJ,0);near(o.energy.usefulServiceHeatJ,0);near(o.energy.signedRoomHeatJ,0);
const phase={oneIntervalHeatW:q,retainedHotRoomWaterKg:after.rooms[0].retainedWaterKg,energyResidualJ:o.energy.residualJ,waterResidualKg:o.energy.waterResidualKg,eachRoomTotalWaterConserved:true};
const network=isolate([35,5,15],[.08,.13,.05],[.1,.1,.1]);
network.interzoneLinks=[{...floor,openingExchange:{...floor.openingExchange,areaM2:12}},{roomA:'high',roomB:'third',conductanceWK:200,openingExchange:{orientation:'horizontal',areaM2:6,heightM:1.9}},{roomA:'low',roomB:'third',conductanceWK:80}];
const nEngine=new HeatPumpEngine(p,network),advance=nEngine.advance,steps=[];
nEngine.advance=function(dt){steps.push(dt);return advance.call(this,dt);};
let maxEnergy=0,maxWater=0;
for(let i=0;i<4;i++){
 const x=nEngine.step(.1);valid(x);x.rooms.forEach(r=>assert.ok(r.temperatureC>=5-1e-7&&r.temperatureC<=35+1e-7));
 maxEnergy=Math.max(maxEnergy,Math.abs(x.energy.residualJ));maxWater=Math.max(maxWater,Math.abs(x.energy.waterResidualKg));
}
near(steps.reduce((a,b)=>a+b,0),.4,1e-9);assert.ok(steps[0]<.025);
const numerical={acceptedSubsteps:steps.length,firstStepS:steps[0],acceptedTotalS:steps.reduce((a,b)=>a+b,0),finalTemperaturesC:nEngine.snapshot().rooms.map(r=>r.temperatureC),maxEnergyResidualJ:maxEnergy,maxWaterResidualKg:maxWater,noOvershoot:true};
// Sample the declared1000J/kg-dry-air/K numerical capacity estimate separately.
let minCp=Infinity;const cpSamples=[];
for(const t of [-25,0,20,45,80])for(const pressure of [70000,101325,110000])for(const rh of [0,.5,1]){
 const cp=native.HAPropsSI('C','T',t+273.15,'P',pressure,'R',rh);assert.ok(Number.isFinite(cp)&&cp>=1000);minCp=Math.min(minCp,cp);cpSamples.push({tC:t,pressurePa:pressure,rh,cpJkgDryK:cp});
}
for(const file of ['src/types.ts','src/state.ts','src/runtime/config.ts','src/settings.ts','src/scene.ts','research/vertical-room-opening-model.md','tests/engine/opening-exchange.test.mjs'])sourceHashes[file]=hash(new URL(file,root));
const receipt={checkedAt:new Date().toISOString(),snapshot,method:'Reviewer independent reduced-gravity scalar reconstruction, Bernoulli wall half-aperture quadrature, fixed-state feedforward/conservation, native total-H/W phase storage and small-room nonlinear-network boundedness. Shared native EOS; no measured owner/OEM calibration.',sourceHashes,scalar,wallChecks,control,phase,numerical,capacitySampling:{minCpJkgDryK:minCp,samples:cpSamples,limitation:'Finite native samples, not a global proof for arbitrary property states or coupled external/HVAC loads.'}};
fs.writeFileSync(new URL('reviews/opening-exchange-independent-results.json',root),JSON.stringify(receipt,null,2)+'\n');
console.log(JSON.stringify({scalar,wallChecks,control,phase,numerical,minCpJkgDryK:minCp,sourceHashes},null,2));
