import {readFileSync,writeFileSync,readdirSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {Properties,HeatPumpEngine,solveCycle} from '/tmp/heatpump-inverter-low-load-build/index.js';
import {roomDemand,inverterAllocationWeights} from '/tmp/heatpump-inverter-low-load-build/demand.js';
import backend from '/home/julien/Documents/Scripts/Agent/heatpump-simulator/public/vendor/coolprop-safe/adapter.js';
const root='/home/julien/Documents/Scripts/Agent/heatpump-simulator';
const config=JSON.parse(readFileSync(`${root}/tests/engine/fixtures/opening-exchange-robustness/opening-owner-1C-ground17-1200.json`)).config;
const duration=Number(process.argv[2]??3600),minimum=Number(process.argv[3]??18);
config.compressor.speedMinRps=minimum;
const p=new Properties(await backend()),engine=new HeatPumpEngine(p,config);
const sources=Object.fromEntries(readdirSync(`${root}/src/engine`).filter(f=>f.endsWith('.ts')).map(f=>[f,createHash('sha256').update(readFileSync(`${root}/src/engine/${f}`)).digest('hex')]));
const data={config,sources,compiled:Object.fromEntries(readdirSync('/tmp/heatpump-inverter-low-load-build').filter(f=>f.endsWith('.js')).map(f=>[f,createHash('sha256').update(readFileSync(`/tmp/heatpump-inverter-low-load-build/${f}`)).digest('hex')])),duration,minimum,transitions:[],samples:[],maxEnergyResidualJ:0,maxWaterResidualKg:0,starts:0,protectionSeconds:{},runningSeconds:0,minRunningSpeed:Infinity,maxRunningSpeed:0};
let output=engine.snapshot(),lastRunning=false,start=performance.now();
function sample(reason){const checkpoint=engine.checkpoint(),demand=roomDemand(config,checkpoint.rooms,output.rooms.map(r=>r.temperatureC),checkpoint.thermostatCalls,checkpoint.demandIntegralW,.25,false);return {reason,time:output.simulatedSeconds,state:output.state,electrical:output.electrical,speed:output.diagnostics.speedRps,demandSpeed:output.diagnostics.demandSpeedRps,protection:output.diagnostics.envelopeProtection,heat:output.signedRoomHeatW,capacity:output.cycle?.condenserHeatW,request:demand.heatW,integrals:checkpoint.demandIntegralW,roomT:output.rooms.map(r=>r.temperatureC),fabricT:output.rooms.map(r=>r.fabricTemperatureC),metalT:output.rooms.map(r=>r.metalTemperatureC),fan:output.rooms.map(r=>r.fanSpeedFraction),calls:output.rooms.map(r=>r.thermostatCalling),actualHeat:output.rooms.map(r=>r.sensibleRoomHeatW),coilHeat:output.cycle?.branchCoilHeatW,links:output.interzoneTransfers};}
for(let step=0;step<duration*4;step++){
 const before=output;output=engine.step(.25);if(output.diagnostics.fault){data.fault=output.diagnostics.fault;break;}
 data.maxEnergyResidualJ=Math.max(data.maxEnergyResidualJ,Math.abs(output.energy.residualJ));data.maxWaterResidualKg=Math.max(data.maxWaterResidualKg,Math.abs(output.energy.waterResidualKg));
 const running=output.electrical.compressorW>0;
 if(running){data.runningSeconds+=.25;data.minRunningSpeed=Math.min(data.minRunningSpeed,output.diagnostics.speedRps);data.maxRunningSpeed=Math.max(data.maxRunningSpeed,output.diagnostics.speedRps);if(!lastRunning)data.starts++;}
 data.protectionSeconds[output.diagnostics.envelopeProtection??'none']=(data.protectionSeconds[output.diagnostics.envelopeProtection??'none']??0)+.25;
 if(running!==lastRunning||output.rooms.some((r,i)=>r.thermostatCalling!==before.rooms[i].thermostatCalling)){const row=sample('transition');data.transitions.push(row);console.log(JSON.stringify(row));}
 if(output.simulatedSeconds%300===0){const row=sample('periodic');data.samples.push(row);console.log(JSON.stringify(row));writeFileSync(`/tmp/inverter-low-load-${minimum}.progress.json`,JSON.stringify(data,null,2));}
 lastRunning=running;
}
data.completedSeconds=output.simulatedSeconds;data.wallSeconds=(performance.now()-start)/1000;data.meanElectricalW=output.energy.electricityJ/output.simulatedSeconds;data.final=sample('final');
data.counterfactual=[];
if(minimum===18){const cp=engine.checkpoint(),d=roomDemand(config,cp.rooms,output.rooms.map(r=>r.temperatureC),cp.thermostatCalls,cp.demandIntegralW,.25,false),weights=inverterAllocationWeights(config,d.active,d.heatW);
 for(const speedRps of [18,12,8,6,4]){try{const c=solveCycle(p,config,{mode:'heating',indoorMetalC:cp.rooms.map(r=>r.metalTemperatureC),outdoorMetalC:output.outdoor.metalTemperatureC,active:d.active,allocationWeights:weights,speedRps,defrost:false});data.counterfactual.push({speedRps,capacity:c.condenserHeatW,electrical:c.compressorElectricalW,ratio:c.highPressureBarAbs/c.lowPressureBarAbs,discharge:c.discharge.temperatureC});}catch(e){data.counterfactual.push({speedRps,error:e.message});}}
}
writeFileSync(`/tmp/inverter-low-load-${minimum}.json`,JSON.stringify(data,null,2));console.log(JSON.stringify({completed:data.completedSeconds,starts:data.starts,meanElectrical:data.meanElectricalW,wall:data.wallSeconds,fault:data.fault,final:data.final,counterfactual:data.counterfactual}));p.dispose();
