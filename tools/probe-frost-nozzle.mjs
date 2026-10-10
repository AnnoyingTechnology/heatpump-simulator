/** Current-source frozen-state validation. No public restore or fluid commits. */
import factory from '../public/vendor/coolprop/coolprop.js';
import {readFile,writeFile,mkdtemp,rm} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {tmpdir} from 'node:os';
import {fileURLToPath,pathToFileURL} from 'node:url';
const root=new URL('../',import.meta.url),scratch=await mkdtemp(tmpdir()+'/frost-nozzle-validation-');
let props;
try{
  execFileSync(fileURLToPath(new URL('node_modules/.bin/tsc',root)),
    ['-p',fileURLToPath(new URL('tests/engine/tsconfig.json',root)),'--outDir',scratch],{stdio:'pipe'});
  await writeFile(scratch+'/package.json','{"type":"module"}');
  const {Properties,DomainError}=await import(pathToFileURL(scratch+'/properties.js'));
  const {ChargeCircuit}=await import(pathToFileURL(scratch+'/charge.js'));
  const saved=JSON.parse(await readFile(new URL('research/charge-frost-debug-snapshot.json',root),'utf8'));
  props=new Properties(await factory());
  const geometry=saved.config.inventory.geometry;
  const circuit=()=>new ChargeCircuit(props,geometry,{massKg:saved.config.inventory.initialMassKg,
    fluidTemperatureC:saved.config.inventory.initialFluidTemperatureC});
  const boundary={orientation:saved.fluid.orientation,compressorSpeedRps:saved.output.diagnostics.speedRps,
    enabledRoomIds:geometry.rooms.map(r=>r.id),outdoorMetalC:saved.output.outdoor.metalTemperatureC,
    indoorMetalCById:Object.fromEntries(saved.output.rooms.map(r=>[r.id,r.metalTemperatureC]))};
  const sourceHashes=Object.fromEntries(await Promise.all(['charge','properties'].map(async name=>
    [name+'.ts',createHash('sha256').update(await readFile(new URL(`src/engine/${name}.ts`,root))).digest('hex')])));
  const result={checkedAt:new Date().toISOString(),sourceHashes,steps:[],restrictions:[],rollback:null};
  for(const dt of [.25,.125]){
    const c=circuit(),before=JSON.stringify(c.snapshot()),start=performance.now();
    try{
      const candidate=c.prepareSingle(dt,boundary,saved.fluid);
      const rates=c.evaluation(candidate.snapshot.variables,boundary,candidate.snapshot.openings,saved.fluid.compressorAdmission);
      const local=candidate.snapshot.cells.map((b,i)=>{
        const a=saved.fluid.cells[i],massLimit=1e-10+1e-10*a.massKg;
        return {id:a.id,massResidualKg:b.massKg-a.massKg-dt*rates.dm[i],massLimitKg:massLimit,
          energyResidualJ:b.internalEnergyJ-a.internalEnergyJ-dt*rates.dU[i],
          energyLimitJ:1e-5+1e-9*Math.abs(a.internalEnergyJ)+Math.max(Math.abs(a.state.hJkg),Math.abs(b.state.hJkg))*massLimit};
      });
      const mass=candidate.snapshot.cells.reduce((sum,b,i)=>sum+b.massKg-saved.fluid.cells[i].massKg,0);
      const energy=candidate.snapshot.cells.reduce((sum,b,i)=>sum+b.internalEnergyJ-saved.fluid.cells[i].internalEnergyJ,0)
        -candidate.compressorWorkJ-Object.values(candidate.integratedCoilHeatJ).reduce((a,b)=>a+b,0);
      result.steps.push({dt,accepted:true,wallSeconds:(performance.now()-start)/1000,
        committedStateUnchanged:before===JSON.stringify(c.snapshot()),local,
        aggregateMassResidualKg:mass,aggregateEnergyResidualJ:energy,candidate});
    }catch(error){result.steps.push({dt,accepted:false,wallSeconds:(performance.now()-start)/1000,error:String(error),
      committedStateUnchanged:before===JSON.stringify(c.snapshot())});}
  }
  const c=circuit();
  for(const cell of [saved.fluid.cells[0],saved.fluid.cells[7],saved.fluid.cells[8]])
    for(const span of [1e-12,1e-9,1e-6,.001,.01,.1,.4,.6]){
      try{result.restrictions.push({id:cell.id,span,flowKgs:c.nozzle(cell.state,cell.state.pPa*(1-span),
        geometry.accumulatorInletAreaM2,.65,.1)});}catch(error){result.restrictions.push({id:cell.id,span,error:String(error)});}
    }
  const before=JSON.stringify(c.snapshot()),original=props.prop.bind(props);
  props.prop=(output,a,x,b,y)=>{
    if(output==='D'&&a==='P'&&b==='S'&&x<1e6)throw new DomainError('Injected low-side PS density outage');
    return original(output,a,x,b,y);
  };
  try{c.prepareSingle(.25,boundary,saved.fluid);result.rollback={rejected:false};}
  catch(error){result.rollback={rejected:true,error:String(error),committedStateUnchanged:before===JSON.stringify(c.snapshot())};}
  props.prop=original;
  let noisyCalls=0;
  props.prop=(output,a,x,b,y)=>{
    const value=original(output,a,x,b,y);
    if(output==='D'&&a==='P'&&b==='S'&&x<1e6){noisyCalls++;return value*(1+.1*Math.sin(1000*x));}
    return value;
  };
  try{c.prepareSingle(.25,boundary,saved.fluid);result.unresolvedNoise={rejected:false,noisyCalls};}
  catch(error){result.unresolvedNoise={rejected:true,error:String(error),noisyCalls,
    committedStateUnchanged:before===JSON.stringify(c.snapshot())};}
  props.prop=original;
  await writeFile(new URL('research/frost-nozzle-validation.json',root),JSON.stringify(result,null,2)+'\n');
  console.log({steps:result.steps.map(s=>({dt:s.dt,accepted:s.accepted,mass:s.aggregateMassResidualKg,
    energy:s.aggregateEnergyResidualJ,wallSeconds:s.wallSeconds})),restrictions:result.restrictions.length,
    restrictionRejects:result.restrictions.filter(r=>r.error).length,rollback:result.rollback,unresolvedNoise:result.unresolvedNoise});
}finally{props?.dispose();await rm(scratch,{recursive:true});}
