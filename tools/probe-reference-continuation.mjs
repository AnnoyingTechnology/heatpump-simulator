// Isolated research only: load an accepted Reference checkpoint without changing public APIs.
import {readFile,writeFile,rename} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {resolve} from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import factory from '../public/vendor/coolprop-safe/adapter.js';
const [buildPath,inputPath,progressPath,resultPath,targetArg='600']=process.argv.slice(2);
if(!resultPath)throw new Error('Usage: node tools/probe-reference-continuation.mjs scratchBuild acceptedJson scratchProgress resultJson [targetSeconds]');
const saved=JSON.parse(await readFile(inputPath,'utf8'));
assert.ok(!saved.config.inventory);assert.equal(saved.checkpoint.time,saved.output.simulatedSeconds);
assert.equal(saved.checkpoint.state,saved.output.state);assert.equal(saved.output.diagnostics.fault,null);
const {Properties,HeatPumpEngine}=await import(pathToFileURL(resolve(buildPath,'index.js')));
const p=new Properties(await factory()),e=new HeatPumpEngine(p,saved.config);
e.restoreCheckpoint(structuredClone(saved.checkpoint));
assert.deepEqual(e.snapshot(),saved.output);
assert.ok(Math.abs(e.totalEnergy()-e.initialEnergy-e.ledgers.boundaryEnergyJ-saved.output.energy.residualJ)<1e-7);
const start=performance.now(),target=Number(targetArg),transitions=[];let last=saved.output,nextSaved=Math.floor(last.simulatedSeconds)+1;
while(last.simulatedSeconds<target && performance.now()-start<90000){
 const before=structuredClone(e.checkpoint()),out=e.step(.25);
 if(out.diagnostics.fault) await writeFile(progressPath+'.fault.json',JSON.stringify({config:saved.config,checkpoint:before,output:out}));
 assert.equal(out.diagnostics.fault,null,out.diagnostics.fault);
 assert.ok(out.simulatedSeconds>last.simulatedSeconds);assert.ok(Math.abs(out.energy.residualJ)<.01);assert.ok(Math.abs(out.energy.waterResidualKg)<1e-10);
 if(out.cycle){assert.ok(out.cycle.discharge.temperatureC<saved.config.compressor.maxDischargeC);assert.ok(out.cycle.closureResidualW<=saved.config.numerics.pressureToleranceW);}
 if(out.state!==last.state){transitions.push({time:out.simulatedSeconds,state:out.state,iceKg:out.outdoor.iceKg});console.log(transitions.at(-1));}
 last=out;
 if(out.simulatedSeconds>=nextSaved){await writeFile(progressPath+'.tmp',JSON.stringify({config:saved.config,checkpoint:e.checkpoint(),output:out}));await rename(progressPath+'.tmp',progressPath);nextSaved++;}
}
const hashes={};for(const name of ['air','engine','cycle'])hashes[name]=createHash('sha256').update(await readFile(new URL(`../src/engine/${name}.ts`,import.meta.url))).digest('hex');
const result={startSeconds:saved.output.simulatedSeconds,endSeconds:last.simulatedSeconds,targetSeconds:target,wallSeconds:(performance.now()-start)/1000,transitions,finalIceKg:last.outdoor.iceKg,finalSignedRoomHeatW:last.signedRoomHeatW,finalHeatingCOP:last.heatingCOP,finalCompressorSpeedRps:last.diagnostics.speedRps,finalEnergyResidualJ:last.energy.residualJ,finalWaterResidualKg:last.energy.waterResidualKg,sourceHashes:hashes,progressPath};
await writeFile(resultPath,JSON.stringify(result,null,2));console.log(result);p.dispose();
