import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,readdirSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {dirname} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
const root=fileURLToPath(new URL('../../',import.meta.url));
const out=process.env.STARTUP_REPLAY_OUTPUT;assert.ok(out,'output directory is supplied by replay.mjs');
const candidate=root;
const {Properties,HeatPumpEngine,REFRIGERANTS}=await import(pathToFileURL(`${candidate}/tests/engine/build/index.js`)),{default:backend}=await import(pathToFileURL(`${candidate}/public/vendor/coolprop-safe/adapter.js`)),base=JSON.parse(readFileSync(`${root}/reviews/inverter-continuity-browser-results.json`)).diagnostic.initialConfig;
const sha=p=>createHash('sha256').update(readFileSync(p)).digest('hex'),hashes={};function tree(p,prefix){for(const e of readdirSync(p,{withFileTypes:true}))e.isDirectory()?tree(`${p}/${e.name}`,`${prefix}/${e.name}`):hashes[`${prefix}/${e.name}`]=sha(`${p}/${e.name}`)}tree(`${candidate}/src/engine`,'source/engine');tree(`${candidate}/tests/engine/build`,'compiled');tree(`${candidate}/public/vendor/coolprop-safe`,'vendor');hashes.harness=sha(fileURLToPath(import.meta.url));
const selectedFluid=process.argv[2];assert.ok(Object.values(REFRIGERANTS).some(f=>f.qualification.reference&&f.id===selectedFluid));
hashes.browserInputReceipt=sha(`${root}/reviews/inverter-continuity-browser-results.json`);
const results=[];
function finite(x){if(typeof x==='number')assert.ok(Number.isFinite(x));else if(x&&typeof x==='object')Object.values(x).forEach(finite);}
async function run(id,c,dt,plan){const initialConfig=structuredClone(c);const p=new Properties(await backend(),c.fluid),e=new HeatPumpEngine(p,c);let o=e.snapshot(),steps=0,energyResidual=0,waterResidual=0;const samples=[],transitions=[];let faultRollback=null;
 function step(seconds){for(let n=0;n<Math.round(seconds/dt);n++){
  const previous=o,before=structuredClone(e.checkpoint());o=e.step(dt);steps++;finite(o);
  if(o.diagnostics.fault){const strip=x=>Object.fromEntries(Object.entries(x).filter(([k])=>!['state','cycle','lastOutput'].includes(k)));assert.deepEqual(strip(e.checkpoint()),strip(before));faultRollback=true;throw Error(o.diagnostics.fault);}
  assert.ok(Math.abs(o.simulatedSeconds-previous.simulatedSeconds-dt)<1e-9);energyResidual=Math.max(energyResidual,Math.abs(o.energy.residualJ));waterResidual=Math.max(waterResidual,Math.abs(o.energy.waterResidualKg));assert.ok(energyResidual<.01);assert.ok(waterResidual<1e-8);
  if(o.rooms.every(r=>r.thermostatCalling===false)&&!['reversing','defrost'].includes(o.state))assert.equal(o.electrical.compressorW,0);
  if(o.cycle){assert.ok(Math.abs(o.cycle.condenserHeatW-o.cycle.evaporatorHeatW-o.cycle.compressorWorkW+o.cycle.lineHeatToOutdoorW)<1e-6);assert.ok(o.cycle.compressorWorkW>0);assert.ok(Math.abs(o.cycle.closureResidualW)<=c.numerics.pressureToleranceW);assert.ok(Math.abs(o.cycle.massResidualKgs)*250000<=c.numerics.pressureToleranceW);assert.ok(Math.abs(o.cycle.branchMassFlowsKgs.reduce((a,b)=>a+b,0)-o.cycle.totalMassFlowKgs)<1e-9);assert.ok(o.cycle.discharge.temperatureC<=c.compressor.maxDischargeC+1e-8);assert.ok(o.cycle.highPressureBarAbs/o.cycle.lowPressureBarAbs<=c.compressor.maxPressureRatio+1e-8);}
  if(o.simulatedSeconds<=10||o.diagnostics.speedRps>0&&o.diagnostics.speedRps<c.compressor.speedMinRps||o.state==='defrost'&&o.electrical.compressorW>0)samples.push({t:o.simulatedSeconds,state:o.state,speed:o.diagnostics.speedRps,compressorW:o.electrical.compressorW,totalW:o.electrical.totalW,heat:o.signedRoomHeatW,cycleResidual:o.cycle?.closureResidualW});
  if((o.electrical.compressorW>0)!==(previous.electrical.compressorW>0)||o.state!==previous.state)transitions.push({t:o.simulatedSeconds,state:o.state,mode:o.effectiveMode,speed:o.diagnostics.speedRps,W:o.electrical.totalW,protection:o.diagnostics.envelopeProtection});
 }}
 function update(next){const before=e.checkpoint();c=next;o=e.updateConfig(c);assert.equal(o.simulatedSeconds,before.time);assert.equal(o.energy.electricityJ,before.ledgers.electricityJ);}
 try{await plan({e,step,update,samples,transitions,get:()=>o,config:()=>c});results.push({id,outcome:'pass',initialConfig,dt,steps,faultRollback,energyResidual,waterResidual,samples,transitions,final:o});}
 catch(error){results.push({id,outcome:'failed',initialConfig,dt,steps,faultRollback,error:error.message,energyResidual,waterResidual,samples,transitions,final:o});}
 finally{p.dispose();}writeFileSync(`${out}/six-fluid-${selectedFluid}-frost-completion-progress.json`,JSON.stringify({completed:results.length,last:results.at(-1).id,outcome:results.at(-1).outcome,error:results.at(-1).error}));}
for(const fluid of Object.values(REFRIGERANTS).filter(f=>f.qualification.reference&&f.id===selectedFluid)){
 const frost=structuredClone(base);frost.fluid=fluid.id;frost.outdoorTemperatureC=2;frost.outdoorRelativeHumidity=1;frost.rooms.filter(r=>r.enabled).forEach(r=>r.setpointC=26);
 await run(`${fluid.id}-natural-defrost-event-bounded700`,frost,.25,async({step,samples,get,transitions})=>{
  step(500);while(get().simulatedSeconds<700&&!transitions.some(x=>x.t>300&&x.state==='running'&&x.mode==='heating'&&x.speed>0))step(1);
  const admitted=samples.filter(s=>s.state==='defrost'&&s.compressorW>0);assert.ok(admitted.length,'natural700s defrost');assert.equal(admitted[0].speed,35);const returned=transitions.find(x=>x.t>admitted[0].t&&x.state==='running'&&x.mode==='heating'&&x.speed>0);assert.ok(returned,'heating return by700s');assert.equal(returned.speed,.5);assert.ok(get().state==='running'&&get().effectiveMode==='heating');
 });
}
writeFileSync(`${out}/six-fluid-${selectedFluid}-frost-completion-results.json`,JSON.stringify({hashes,method:'Isolated78d5c44 multi-fluid source plus66ca8be inventory startup API with one Reference drive input added: startupFromRest only for ordinary inverter and all idealized lines. Refrigerant equations/guards unchanged; actual native solve at every speed; no display interpolation or watt fitting.',results,passed:results.filter(r=>r.outcome==='pass').length,failed:results.filter(r=>r.outcome!=='pass').length},null,2)+'\n');console.log(JSON.stringify({passed:results.filter(r=>r.outcome==='pass').length,failed:results.filter(r=>r.outcome!=='pass').length,failures:results.filter(r=>r.outcome!=='pass').map(r=>({id:r.id,error:r.error}))}));
