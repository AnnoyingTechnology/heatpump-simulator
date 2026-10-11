import {createHash} from 'node:crypto';
import {cpSync,existsSync,mkdirSync,readFileSync,readdirSync,writeFileSync} from 'node:fs';
import {dirname} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import assert from 'node:assert/strict';
const out=dirname(fileURLToPath(import.meta.url)),root='/home/julien/Documents/Scripts/Agent/heatpump-simulator',frozen='/tmp/heatpump-inverter-full-119tzqi8',snapshot=`${out}/snapshot`;
if(!existsSync(snapshot)){mkdirSync(snapshot);cpSync(`${frozen}/tests/engine/build`,`${snapshot}/build`,{recursive:true});cpSync(`${frozen}/public/vendor/coolprop-safe`,`${snapshot}/vendor`,{recursive:true});writeFileSync(`${snapshot}/package.json`,'{"type":"module"}\n');}
const sha=p=>createHash('sha256').update(readFileSync(p)).digest('hex'),hashes={};function tree(p,prefix){for(const e of readdirSync(p,{withFileTypes:true}))e.isDirectory()?tree(`${p}/${e.name}`,`${prefix}/${e.name}`):hashes[`${prefix}/${e.name}`]=sha(`${p}/${e.name}`)}
tree(`${frozen}/src/engine`,'source/engine');tree(`${snapshot}/build`,'compiled');tree(`${snapshot}/vendor`,'vendor');hashes.harness=sha(fileURLToPath(import.meta.url));assert.equal(sha(`${root}/src/engine/cycle.ts`),hashes['source/engine/cycle.ts']);
const receiptPath=`${root}/reviews/inverter-continuity-browser-results.json`,browser=JSON.parse(readFileSync(receiptPath)),base=browser.diagnostic.initialConfig;hashes.ownerInputReceipt=sha(receiptPath);
const scenes=[{id:'owner-cold-heat-single',mode:'heating',outdoor:1,metals:[18.3,21.5,18],outsideMetal:1,active:[false,true,false],weights:[0,1,0]},
{id:'owner-hot-restart-heat-single',mode:'heating',outdoor:1,metals:[18.3,40,38],outsideMetal:-3,active:[false,true,false],weights:[0,1,0]},
{id:'owner-hot-restart-heat-two',mode:'heating',outdoor:1,metals:[18.3,40,38],outsideMetal:-3,active:[false,true,true],weights:[0,.95,.05]},
{id:'owner-cold-cool-all',mode:'cooling',outdoor:35,metals:[26,25,26],outsideMetal:35,active:[true,true,true],weights:[1,1,1]},
{id:'owner-cold-restart-cool-all',mode:'cooling',outdoor:39,metals:[12,10,11],outsideMetal:44,active:[true,true,true],weights:[1,1,1]},
{id:'warm-restart-cool-single',mode:'cooling',outdoor:39,metals:[12,10,11],outsideMetal:44,active:[false,true,false],weights:[0,1,0]}];
const {Properties,solveCycle}=await import(pathToFileURL(`${snapshot}/build/index.js`)),{default:backend}=await import(pathToFileURL(`${snapshot}/vendor/adapter.js`)),p=new Properties(await backend()),rows=[];
for(const s of scenes)for(const lines of ['idealized','physical'])for(const speedRps of [.05,.1,.25,.5,1,2,4,6,8,18]){
 const c=structuredClone(base);c.mode=s.mode;c.outdoorTemperatureC=s.outdoor;c.rooms.forEach((r,i)=>r.pipe.lengthM=lines==='physical'?browser.config.pipes[i].lengthM:0);
 const input={mode:s.mode,indoorMetalC:s.metals,outdoorMetalC:s.outsideMetal,active:s.active,allocationWeights:s.weights,speedRps,defrost:false};const row={scene:s.id,lines,speedRps,config:c,input};
 try{const r=solveCycle(p,c,input);assert.ok(Math.abs(r.closureResidualW)<=c.numerics.pressureToleranceW);assert.ok(Math.abs(r.massResidualKgs)*250000<=c.numerics.pressureToleranceW);assert.ok(Math.abs(r.branchMassFlowsKgs.reduce((a,b)=>a+b,0)-r.totalMassFlowKgs)<1e-9);assert.ok(r.discharge.temperatureC<=c.compressor.maxDischargeC+1e-8);assert.ok(r.highPressureBarAbs/r.lowPressureBarAbs<=c.compressor.maxPressureRatio+1e-8);
 const firstLaw=r.condenserHeatW-r.evaporatorHeatW-r.compressorWorkW+r.lineHeatToOutdoorW;assert.ok(Math.abs(firstLaw)<1e-7);Object.assign(row,{outcome:'closed',electricalW:r.compressorElectricalW,condenserW:r.condenserHeatW,evaporatorW:r.evaporatorHeatW,massFlow:r.totalMassFlowKgs,residualW:r.closureResidualW,firstLawW:firstLaw,ratio:r.highPressureBarAbs/r.lowPressureBarAbs,native:r});
 }catch(e){Object.assign(row,{outcome:e.name==='AssertionError'?'invariant-failure':'rejected',error:e.message});}
 rows.push(row);writeFileSync(`${out}/progress.json`,JSON.stringify({completed:rows.length,scene:s.id,lines,speedRps,outcome:row.outcome,error:row.error}));
}
p.dispose();writeFileSync(`${out}/low-speed-cycle-results.json`,JSON.stringify({hashes,scenes,method:'Fresh unchanged native EOS at actual low speed, with original closure, mass, header, caps and first-law guards. Static instantaneous coil boundary cases; no hydraulic/refrigerant storage or zero-rps solve invented.',rows},null,2)+'\n');console.log(JSON.stringify({closed:rows.filter(r=>r.outcome==='closed').length,rejected:rows.filter(r=>r.outcome==='rejected').length,invariantFailures:rows.filter(r=>r.outcome==='invariant-failure').length}));
