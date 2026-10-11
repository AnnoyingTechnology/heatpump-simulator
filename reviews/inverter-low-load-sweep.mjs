import {readFileSync,writeFileSync} from 'node:fs';
import {Properties,solveCycle} from '/tmp/heatpump-inverter-low-load-build/index.js';
import backend from '/home/julien/Documents/Scripts/Agent/heatpump-simulator/public/vendor/coolprop-safe/adapter.js';
const root='/home/julien/Documents/Scripts/Agent/heatpump-simulator',base=JSON.parse(readFileSync(`${root}/tests/engine/fixtures/opening-exchange-robustness/opening-owner-1C-ground17-1200.json`)).config;
const p=new Properties(await backend()),rows=[];
for(const boundary of [{name:'mild8 heating warm coil',mode:'heating',outside:8,inside:40},{name:'mild12 heating warm coil',mode:'heating',outside:12,inside:40},{name:'35 cooling cold coil',mode:'cooling',outside:35,inside:10},{name:'39 cooling cold coil',mode:'cooling',outside:39,inside:10}]){
 for(const piping of ['idealized','physical'])for(const speed of [18,8,6,4]){
  const c=structuredClone(base);c.mode=boundary.mode;c.outdoorTemperatureC=boundary.outside;
  if(piping==='physical')c.rooms[1].pipe={...c.rooms[1].pipe,lengthM:6.5,gasInsideDiameterM:.0111,liquidInsideDiameterM:.00475};
  const row={boundary:boundary.name,piping,speed};
  try{const o=solveCycle(p,c,{mode:boundary.mode,indoorMetalC:c.rooms.map(()=>boundary.inside),outdoorMetalC:boundary.outside,active:[false,true,false],allocationWeights:[0,1,0],speedRps:speed,defrost:false});Object.assign(row,{capacity:boundary.mode==='heating'?o.condenserHeatW:o.evaporatorHeatW,compressorElectricalW:o.compressorElectricalW,totalWithKnownFansW:o.compressorElectricalW+85+15+6.103515625,condensingC:o.condensingC,evaporatingC:o.evaporatingC,ratio:o.highPressureBarAbs/o.lowPressureBarAbs,dischargeC:o.discharge.temperatureC,residualW:o.closureResidualW,massResidualKgs:o.massResidualKgs});}catch(e){row.error=e.message;}
  rows.push(row);console.log(JSON.stringify(row));
 }
}
writeFileSync('/tmp/inverter-low-load-bounded-sweep.json',JSON.stringify({method:'Fresh guarded HEOS fixed metal boundary algebraic sweep, not steady operating map. Physical pipe approximation is declared.',rows},null,2));p.dispose();
