// Explicit generic owner-sized geometry/history qualifier. No OEM performance
// fitting, observed idle allocation or external data import is implied.
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import factory from './backend.mjs';
import {Properties} from './build/properties.js';
import {HeatPumpEngine} from './build/engine.js';
const args=Object.fromEntries(process.argv.slice(2).map(s=>s.replace(/^--/,'').split('=')));
const number=(key,fallback)=>args[key]===undefined?fallback:Number(args[key]);
const options={cells:number('cells',6),mass:number('mass',1.8),dt:number('dt',.25),soak:number('soak',120),run:number('run',900),
  mode:args.mode??'heating',controller:args.controller??'pi',kp:number('kp',.03),ki:number('ki',.001),initial:number('initial',20)};
if(!['heating','cooling'].includes(options.mode)||![options.dt,options.mass].every(v=>Number.isFinite(v)&&v>0)||options.dt>.25)throw new Error('Invalid qualification arguments');
const config=JSON.parse(fs.readFileSync(new URL('../../research/charge-owner-generic-configuration.json',import.meta.url)));
config.mode=options.mode;config.control.strategy='inverter';config.inventory.initialMassKg=options.mass;
config.inventory.initialFluidTemperatureC=options.initial;config.inventory.initialValveOpening=0;
config.outdoorTemperatureC=options.mode==='heating'?1:35;config.outdoorRelativeHumidity=options.mode==='heating'?.95:.55;
config.rooms.forEach((r,j)=>{r.enabled=false;r.initialTemperatureC=options.mode==='heating'?[18,21.5,18.3][j]:28;r.setpointC=options.mode==='heating'?22:24;});
if(options.controller==='pi')config.inventory.geometry.eevController={proportionalOpeningPerK:options.kp,integralOpeningPerKs:options.ki,slewOpeningPerSecond:.1};
else if(options.controller!=='integral')throw new Error('Unknown controller');
const numerics={storageCoordinates:'density',analyticFluxJacobian:true,eliminateInternalFlows:true,polynomialThroatSearch:true,coilCells:options.cells,coilReconstruction:'mc'};
const props=new Properties(await factory()),engine=new HeatPumpEngine(props,config,numerics),trace=[],checkpoints=[],started=performance.now();
const sources=['src/engine/charge.ts','src/engine/charge-valve.ts','src/engine/charge-faces.ts','src/engine/charge-isentrope.ts','src/engine/engine.ts','public/vendor/coolprop-safe/coolprop.wasm'];
const hashes=Object.fromEntries(sources.map(p=>[p,createHash('sha256').update(fs.readFileSync(new URL(`../../${p}`,import.meta.url))).digest('hex')]));
const result={status:'running research qualification',options,config,numerics,hashes,trace,checkpoints};
const output=args.output??'/tmp/charge-owner-history-results.json';let priorState=null,priorAdmission=null,firstRestart=true;
const save=()=>fs.writeFileSync(output,JSON.stringify(result,null,2)+'\n');
function record(stage,o,checkpoint=false){
 const fluid=engine.refrigerant.snapshot(),acc=fluid.cells.find(c=>c.id==='accumulator'),gas=o.inventory.coilPorts.outdoor.gasCellState;
 const p={stage,t:o.simulatedSeconds,wallSeconds:(performance.now()-started)/1000,state:o.state,admitted:o.inventory.compressorAdmitted,
  speedRps:o.diagnostics.speedRps,openings:fluid.openings,integralBias:fluid.valveIntegralBias,
  compressorFlowKgs:o.inventory.compressorMassFlowKgs,valveFlowsKgs:Object.fromEntries(Object.entries(o.inventory.fieldPorts).map(([id,p])=>[id,p.valveMassFlowKgs])),
  evaporatorGas:options.mode==='heating'?gas:Object.fromEntries(config.rooms.map(r=>[r.id,o.inventory.coilPorts[r.id].gasCellState])),
  accumulator:{massKg:acc.massKg,energyJ:acc.internalEnergyJ,...acc.state},heatW:o.inventory.coilHeatW,compressorW:o.electrical.compressorW,
  outdoor:o.outdoor,massResidualKg:o.inventory.massResidualKg,fluidEnergyResidualJ:o.inventory.energyResidualJ,
  systemEnergyResidualJ:o.energy.residualJ,waterResidualKg:o.energy.waterResidualKg,usefulServiceHeatJ:o.energy.usefulServiceHeatJ,
  fault:o.diagnostics.fault};trace.push(p);console.log(JSON.stringify(p));
 if(checkpoint)checkpoints.push({stage,t:o.simulatedSeconds,checkpoint:engine.checkpoint(),output:o});
 save();
}
try{
 record('initial',engine.snapshot(),true);
 for(let j=0;j<Math.round(options.soak/options.dt);j++){
  const o=engine.step(options.dt);if((j+1)%Math.round(10/options.dt)===0||o.diagnostics.fault)record('off',o);
  if(o.diagnostics.fault)throw new Error(o.diagnostics.fault);
 }
 record('end-soak',engine.snapshot(),true);const on=structuredClone(config);on.rooms.forEach(r=>r.enabled=true);engine.updateConfig(on);
 for(let j=0;j<Math.round(options.run/options.dt);j++){
  const o=engine.step(options.dt),transition=o.state!==priorState||o.inventory.compressorAdmitted!==priorAdmission;
  if(firstRestart||transition||(j+1)%Math.round(10/options.dt)===0||o.diagnostics.fault)record('active',o,firstRestart||transition||(j+1)%Math.round(60/options.dt)===0);
  firstRestart=false;priorState=o.state;priorAdmission=o.inventory.compressorAdmitted;if(o.diagnostics.fault)throw new Error(o.diagnostics.fault);
 }
 result.status='completed research trajectory; release criteria require independent assessment';record('final',engine.snapshot(),true);
}catch(error){result.status='rejected/incomplete trajectory';result.failure=String(error);save();process.exitCode=1;}
finally{props.dispose();save();}
