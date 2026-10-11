import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
const receipt=JSON.parse(await readFile(new URL('./low-load-cooling-experiment-source.json',import.meta.url)));
const frozen='/tmp/heatpump-valve-science-snapshot-osvyohga';
const Module=(await import(`${frozen}/public/vendor/coolprop-safe/adapter.js`)).default;
const original=await import(`${frozen}/tests/engine/build/index.js`);
const native=await Module(),p=new original.Properties(native);
const project='/home/julien/Documents/Scripts/Agent/heatpump-simulator';
const base=JSON.parse(await readFile(`${project}/tests/engine/fixtures/opening-exchange-robustness/opening-owner-1C-ground17-1200.json`)).config;
const rows=[];
for(const [variant,path] of [['original',`${frozen}/tests/engine/build/index.js`],...Object.entries(receipt.variants).map(([name,x])=>[name,`${x.root}/build/index.js`])]){
  const {solveCycle}=await import(path);
  for(const outside of [35,39])for(const speed of variant==='original'||variant==='both'?[18,8,6,4]:[8]){
    const config=structuredClone(base);config.mode='cooling';config.outdoorTemperatureC=outside;
    config.rooms[1].pipe={...config.rooms[1].pipe,lengthM:6.5,gasInsideDiameterM:.0111,liquidInsideDiameterM:.00475};
    const input={mode:'cooling',indoorMetalC:[10,10,10],outdoorMetalC:outside,active:[false,true,false],allocationWeights:[0,1,0],speedRps:speed,defrost:false};
    const row={variant,outside,speed};
    try{
      const o=solveCycle(p,config,input),local=o.branchOutlets[1];
      assert.ok(o.closureResidualW<=config.numerics.pressureToleranceW);
      assert.ok(Math.abs(o.massResidualKgs)*250000<=config.numerics.pressureToleranceW);
      assert.equal(o.suction.phase,'vapor');assert.ok(local.temperatureC<10);
      assert.ok(o.branchValveInlets[1].pPa>o.branchValveOutlets[1].pPa);
      assert.equal(o.branchValveInlets[1].hJkg,o.branchValveOutlets[1].hJkg);
      const energy=o.condenserHeatW-o.evaporatorHeatW+o.lineHeatToOutdoorW-o.compressorWorkW;
      assert.ok(Math.abs(energy)<1e-6);assert.ok(o.discharge.temperatureC<=config.compressor.maxDischargeC);
      assert.ok(o.highPressureBarAbs/o.lowPressureBarAbs<=config.compressor.maxPressureRatio);
      Object.assign(row,{closed:true,residualW:o.closureResidualW,massResidualKgs:o.massResidualKgs,iterations:o.iterations,
        evaporatingC:o.evaporatingC,condensingC:o.condensingC,suctionC:o.suction.temperatureC,
        localOutletC:local.temperatureC,localOutletPhase:local.phase,localSuperheatK:local.temperatureC-p.saturation(local.pPa).temperatureC,
        capacityW:o.evaporatorHeatW,compressorElectricalW:o.compressorElectricalW,lineHeatToOutdoorW:o.lineHeatToOutdoorW,energyClosureW:energy});
    }catch(error){Object.assign(row,{closed:false,error:error.message});}
    rows.push(row);console.log(JSON.stringify(row));
  }
}
const corrected=await import(`${receipt.variants.both.root}/build/index.js`);
const parity=[];
for(const mode of ['heating','cooling']){
  const c=structuredClone(base);c.outdoorTemperatureC=mode==='heating'?1:35;
  const input={mode,indoorMetalC:c.rooms.map(()=>mode==='heating'?35:10),outdoorMetalC:c.outdoorTemperatureC,active:[false,true,false],allocationWeights:[0,1,0],speedRps:8};
  const old=original.solveCycle(p,c,input),next=corrected.solveCycle(p,c,input);
  assert.deepEqual(next,old);parity.push({mode,topology:'idealized',exactParity:true});
}
const c=structuredClone(base);c.outdoorTemperatureC=1;c.rooms[1].pipe.lengthM=6.5;
const input={mode:'heating',indoorMetalC:[35,35,35],outdoorMetalC:1,active:[false,true,false],allocationWeights:[0,1,0],speedRps:8};
assert.deepEqual(corrected.solveCycle(p,c,input),original.solveCycle(p,c,input));
parity.push({mode:'heating',topology:'physical',exactParity:true});
const rejected=[];
for(const [name,change] of [['hard-pressure-ratio',c=>{c.compressor.maxPressureRatio=1.1;}],['cold-outside-domain',c=>{}],['long-pipe-authority',c=>{c.rooms[1].pipe.lengthM=300;}]]){
  const c=structuredClone(base);c.mode='cooling';c.outdoorTemperatureC=35;c.rooms[1].pipe.lengthM=6.5;change(c);
  const input={mode:'cooling',indoorMetalC:c.rooms.map(()=>name==='cold-outside-domain'?-40:10),outdoorMetalC:35,active:[false,true,false],speedRps:8};
  let error;try{corrected.solveCycle(p,c,input);}catch(e){error=e.message;}
  assert.ok(error,`Expected explicit rejection for ${name}`);rejected.push({name,error});
}
for(const outside of [35,39]){
  assert.equal(rows.find(r=>r.variant==='original'&&r.outside===outside&&r.speed===8).closed,false);
  assert.equal(rows.find(r=>r.variant==='bound-only'&&r.outside===outside).closed,false);
  assert.equal(rows.find(r=>r.variant==='seed-only'&&r.outside===outside).closed,false);
  const eight=rows.find(r=>r.variant==='both'&&r.outside===outside&&r.speed===8);
  assert.equal(eight.closed,true);assert.equal(eight.localOutletPhase,'vapor');assert.ok(eight.localSuperheatK>0);
}
const output={status:'PASS',scope:'Two-line isolated experimental source correction only. Original branch-loop, pressure cap, iterations, tolerance, shared suction SH3 and all EOS/transport/pinch/authority equations retained. No production change or global8rps envelope acceptance.',experimentSource:receipt,rows,unchangedParity:parity,negativeChecks:rejected};
await writeFile(new URL('./low-load-cooling-source-results.json',import.meta.url),JSON.stringify(output,null,2)+'\n');
console.log(JSON.stringify({status:'PASS',negativeChecks:rejected.map(x=>x.name),unchangedParity:parity}));
p.dispose();native.dispose();
