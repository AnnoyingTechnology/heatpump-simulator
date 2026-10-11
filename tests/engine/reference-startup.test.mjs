import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import Module from './backend.mjs';
import {Properties,HeatPumpEngine,REFRIGERANTS} from './build/index.js';

const module=await Module();
const owner=JSON.parse(readFileSync(new URL('./fixtures/published-owner-startup-146/published-owner-1C-ground17-600.json',import.meta.url))).config;
function config(fluid='R32',mode='heating'){
 const c=structuredClone(owner);c.fluid=fluid;c.mode=mode;c.compressor.speedMinRps=8;
 Object.assign(c.control,{inverterRampUpRpsPerSecond:2,inverterRampDownRpsPerSecond:4});
 if(mode==='cooling'){
  c.outdoorTemperatureC=39;
  c.rooms.forEach(r=>Object.assign(r,{enabled:true,initialTemperatureC:26,setpointC:24}));
 }
 return c;
}
function trajectory(c){
 const p=new Properties(module,c.fluid),e=new HeatPumpEngine(p,c);let before=e.snapshot();
 function step(){
  const o=e.step(.25);assert.equal(o.diagnostics.fault,null);
  assert.ok(Math.abs(o.energy.residualJ)<.01);assert.ok(Math.abs(o.energy.waterResidualKg)<1e-8);
  assert.ok(Math.abs(o.energy.electricityJ-before.energy.electricityJ-o.electrical.totalW*.25)<1e-7,'accepted actual electrical work enters the ledger');
  if(o.cycle){
   const q=o.cycle;assert.ok(q.totalMassFlowKgs>0);
   assert.ok(Math.abs(q.condenserHeatW-q.evaporatorHeatW-q.compressorWorkW+q.lineHeatToOutdoorW)<1e-6);
   assert.ok(q.closureResidualW<=c.numerics.pressureToleranceW);
   assert.ok(Math.abs(q.massResidualKgs)*250000<=c.numerics.pressureToleranceW);
   assert.ok(Math.abs(q.branchMassFlowsKgs.reduce((a,b)=>a+b,0)-q.totalMassFlowKgs)<1e-9);
   assert.ok(q.discharge.temperatureC<=c.compressor.maxDischargeC);
   assert.ok(q.highPressureBarAbs/q.lowPressureBarAbs<=c.compressor.maxPressureRatio);
   assert.ok(Math.abs(o.electrical.compressorW-q.compressorWorkW/c.compressor.driveEfficiency)<1e-8,'startup watts come from the actual cycle');
   if(c.control.strategy==='inverter'&&o.state==='running'){
    const change=o.diagnostics.speedRps-before.diagnostics.speedRps;
    assert.ok(change<=c.control.inverterRampUpRpsPerSecond*.25+1e-9);
    assert.ok(change>=-c.control.inverterRampDownRpsPerSecond*.25-1e-9);
   }
  }else assert.equal(o.electrical.compressorW,0);
  before=o;return o;
 }
 function update(next){const energy=before.energy.electricityJ,time=before.simulatedSeconds;c=next;before=e.updateConfig(c);assert.equal(before.energy.electricityJ,energy);assert.equal(before.simulatedSeconds,time);return before;}
 return {step,update,snapshot:()=>before,dispose:()=>p.dispose()};
}

for(const fluid of Object.values(REFRIGERANTS).filter(f=>f.qualification.reference))for(const mode of ['heating','cooling']){
 test(`${fluid.id} ${mode} starts with actual conserved subminimum throughput and reaches8rps`,()=>{
  const c=config(fluid.id,mode),run=trajectory(c);
  try{
   const first=run.step();assert.equal(first.diagnostics.speedRps,.5);assert.ok(first.electrical.compressorW>0);
   assert.ok(first.diagnostics.speedRps<c.compressor.speedMinRps);
   let reached=false;for(let i=1;i<24;i++){const o=run.step();assert.equal(o.state,'running');assert.equal(o.diagnostics.envelopeProtection,null);reached ||= o.diagnostics.speedRps>=8;}
   assert.ok(reached,'valid startup reaches the declared steady-operation minimum');
  }finally{run.dispose();}
 });
}

test('R32 retained warm coils restart through solved low speeds after Off and the full dwell',()=>{
 const c=config();c.rooms.filter(r=>r.enabled).forEach(r=>r.setpointC=26);const run=trajectory(c);
 try{
  for(let i=0;i<1200;i++)run.step();
  assert.ok(Math.max(...run.snapshot().rooms.map(r=>r.metalTemperatureC))>35,'warm storage comes from actual running heat');
  const off=structuredClone(c);off.rooms.forEach(r=>r.enabled=false);
  assert.equal(run.update(off).electrical.compressorW,0);
  for(let i=0;i<40;i++)assert.equal(run.step().electrical.compressorW,0);
  run.update(c);
  for(let i=0;i<76;i++)assert.equal(run.step().electrical.compressorW,0,'restart cannot evade the30s off dwell');
  let first=null,reached=false;
  for(let i=0;i<24;i++){const o=run.step();if(o.electrical.compressorW>0){first??=o;reached ||= o.diagnostics.speedRps>=8;}}
  assert.ok(first);assert.equal(first.diagnostics.speedRps,.5);assert.ok(reached);
  assert.equal(run.update(off).electrical.compressorW,0);assert.equal(run.step().electrical.compressorW,0);
 }finally{run.dispose();}
});

test('natural R32 frost keeps the dedicated defrost command then ramps actual heating return',()=>{
 const c=config();c.outdoorTemperatureC=2;c.outdoorRelativeHumidity=1;c.rooms.filter(r=>r.enabled).forEach(r=>r.setpointC=26);
 const run=trajectory(c);let admitted=false,returned=false;
 try{
  for(let i=0;i<2000;i++){
   const o=run.step();
   if(o.state==='defrost'&&o.electrical.compressorW>0){if(!admitted)assert.equal(o.diagnostics.speedRps,c.control.defrostSpeedRps);admitted=true;}
   if(admitted&&o.state==='running'&&o.effectiveMode==='heating'&&o.electrical.compressorW>0){assert.equal(o.diagnostics.speedRps,.5);returned=true;break;}
  }
  assert.ok(admitted,'natural frost admits conserved reverse-cycle defrost');assert.ok(returned,'useful heating returns within the bounded event window');
 }finally{run.dispose();}
});

test('fixed-speed Reference keeps its explicit18rps starting command',()=>{
 const c=config();c.control.strategy='on-off';c.control.fixedSpeedRps=18;const run=trajectory(c);
 try{const first=run.step();assert.equal(first.diagnostics.speedRps,18);assert.ok(first.electrical.compressorW>0);}finally{run.dispose();}
});
