import Module from '../../public/vendor/coolprop/coolprop.js';
import { Properties, HeatPumpEngine, defaultEngineConfig } from './build/index.js';
const backend=await Module(),p=new Properties(backend),records=[];
for(const piping of ['idealized','physical'])for(const count of [1,3,5])for(const mode of ['heating','cooling']) {
  const c=defaultEngineConfig(count);c.mode=mode;
  if(mode==='cooling'){c.outdoorTemperatureC=32;c.rooms.forEach(r=>{r.initialTemperatureC=27;r.setpointC=24;});}
  if(piping==='physical')c.rooms.forEach((r,i)=>{r.pipe.lengthM=[14,6.5,7.5,10,8][i];r.pipe.gasInsideDiameterM=i===0?.00792:.0111;r.pipe.liquidInsideDiameterM=.00475;});
  const e=new HeatPumpEngine(p,c),times=[];let o;
  for(let i=0;i<9;i++){const start=performance.now();o=e.step(.25);times.push(performance.now()-start);if(o.diagnostics.fault)break;}
  const warm=times.slice(1).sort((a,b)=>a-b);
  records.push({piping,count,mode,coldMs:times[0],warmP50Ms:warm[Math.floor(warm.length/2)],warmP95Ms:warm[Math.floor(warm.length*.95)],simulatedSeconds:o.simulatedSeconds,fault:o.diagnostics.fault,energyResidualJ:o.energy.residualJ,waterResidualKg:o.energy.waterResidualKg});
}
p.dispose();console.log(JSON.stringify({context:'Local Node24, pinnedWASM8, maxdt.25s, idealized and finite generic line fixtures; not browser/domain certification',records},null,2));
