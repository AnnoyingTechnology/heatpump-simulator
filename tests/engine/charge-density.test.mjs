import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import factory from './backend.mjs';
import {Properties,DomainError} from './build/properties.js';
import {ChargeCircuit} from './build/charge.js';

const corner=JSON.parse(await readFile(new URL('../../research/charge-frost-debug-snapshot.json',import.meta.url),'utf8'));
const late=JSON.parse(await readFile(new URL('../../research/charge-frost-continuation-progress.json',import.meta.url),'utf8'));
const boundary=(saved,orientation)=>({orientation,compressorSpeedRps:orientation==='heating'?18:0,
  enabledRoomIds:saved.config.inventory.geometry.rooms.map(r=>r.id),outdoorMetalC:saved.output.outdoor.metalTemperatureC,
  indoorMetalCById:Object.fromEntries(saved.output.rooms.map(r=>[r.id,r.metalTemperatureC]))});
const circuit=(props,saved,numerics)=>new ChargeCircuit(props,saved.config.inventory.geometry,
  {massKg:saved.config.inventory.initialMassKg,fluidTemperatureC:saved.config.inventory.initialFluidTemperatureC},numerics);

function originalBalances(c,saved,b,dt,candidate){
  const r=c.evaluation(candidate.snapshot.variables,b,candidate.snapshot.openings,saved.fluid.compressorAdmission,candidate.snapshot.cells);
  let mass=0,energy=0;
  saved.fluid.cells.forEach((a,j)=>{
    const next=candidate.snapshot.cells[j],dm=next.massKg-a.massKg,dU=next.internalEnergyJ-a.internalEnergyJ;
    const massLimit=1e-10+1e-10*a.massKg;
    const energyLimit=1e-5+1e-9*Math.abs(a.internalEnergyJ)+Math.max(Math.abs(a.state.hJkg),Math.abs(next.state.hJkg))*massLimit;
    assert.ok(Math.abs(dm-dt*r.dm[j])<=massLimit,`${a.id} original mass balance`);
    assert.ok(Math.abs(dU-dt*r.dU[j])<=energyLimit,`${a.id} original energy balance`);
    mass+=dm;energy+=dU;
  });
  energy-=candidate.compressorWorkJ+Object.values(candidate.integratedCoilHeatJ).reduce((a,b)=>a+b,0);
  assert.ok(Math.abs(mass)<=5e-11);assert.ok(Math.abs(energy)<=1e-5);assert.ok(Math.abs(dt*r.headerMass)<=1e-10);
}

test('density storage and sparse flux coordinates solve the original saved balances without remapping retained M/U',async t=>{
  const props=new Properties(await factory());
  try{
    for(const saved of [corner,late])for(const orientation of ['heating','cooling']){
      const c=circuit(props,saved,{storageCoordinates:'density',analyticFluxJacobian:true});
      const before=c.snapshot(),input=structuredClone(saved.fluid),b=boundary(saved,orientation),dt=orientation==='heating'?.25:.003;
      const started=performance.now(),candidate=c.prepareSingle(dt,b,input);
      originalBalances(c,saved,b,dt,candidate);assert.deepEqual(c.snapshot(),before);assert.deepEqual(input,saved.fluid);
      assert.ok(Math.abs(candidate.massResidualKg-saved.output.inventory.massResidualKg)<1e-12);
      t.diagnostic(JSON.stringify({savedSeconds:saved.output.simulatedSeconds,orientation,dt,iterations:candidate.nonlinearIterations,
        wallMs:performance.now()-started,massResidualKg:candidate.massResidualKg,energyResidualJ:candidate.energyResidualJ}));
    }
  }finally{props.dispose();}
});

test('sparse compressor/header/nozzle/advective derivatives match an independent complete PD residual difference',async t=>{
  const props=new Properties(await factory()),c=circuit(props,corner,{storageCoordinates:'density',analyticFluxJacobian:true});
  try{
    for(const orientation of ['heating','cooling']){
      const b=boundary(corner,orientation),z=corner.fluid.variables,opening=corner.fluid.openings,size=z.length,source=orientation==='heating'?0:1;
      const scales=z.map((_,j)=>j===2?1:j<3?1e6:j<c.flowOffset?500:.01);
      const coordinate=z.map((v,j)=>(j>=3&&j<c.flowOffset?corner.fluid.cells[j-3].massKg/c.definitions[j-3].volume:v)/scales[j]);
      coordinate[2]-=z[source];
      const evaluate=values=>{
        const state=values.map((v,j)=>v*scales[j]);state[2]+=state[source];
        const cells=c.definitions.map((definition,j)=>{
          const fluid=props.pd(state[definition.pressureIndex],state[3+j]),mass=definition.volume*fluid.densityKgm3;state[3+j]=fluid.hJkg;
          return {id:definition.id,volumeM3:definition.volume,group:['outdoor','indoor','accumulator'][definition.pressureIndex],massKg:mass,internalEnergyJ:mass*fluid.hJkg-fluid.pPa*definition.volume,state:fluid};
        });
        return {z:state,r:c.evaluation(state,b,opening,true,cells)};
      };
      const base=evaluate(coordinate),analytic=c.fluxDerivatives(base.z,b,opening,true,base.r,scales);
      let worst=0;
      for(let j=0;j<size;j++){
        const epsilon=j===2?.001:j<3?1e-5:j<c.flowOffset?1e-7:1e-6;
        const plus=[...coordinate],minus=[...coordinate];plus[j]+=epsilon;minus[j]-=epsilon;
        const a=evaluate(plus).r,d=evaluate(minus).r;
        for(const [name,nodes] of [['dm',analytic.dm],['dU',analytic.dU]])for(let k=0;k<nodes.length;k++){
          const finite=(a[name][k]-d[name][k])/(2*epsilon),actual=nodes[k].gradient[j];
          // A resolved choked throat has exactly zero downstream derivative,
          // while an independent golden search retains last-bit plateau noise.
          // Propagate the declared 4e-11 kg/s constitutive comparison allowance
          // through this finite difference; this is not a balance tolerance.
          const hScale=Math.max(...base.r.cells.map(cell=>Math.abs(cell.state.hJkg)));
          const noise=8e-11/epsilon*(name==='dm'?1:hScale);
          const allowance=noise+.003*Math.max(name==='dm'?1e-6:.05,Math.abs(actual),Math.abs(finite));
          const error=Math.abs(actual-finite)/allowance;worst=Math.max(worst,error);
          assert.ok(error<=1,`${orientation} ${name} cell ${k} column ${j}: ${actual} vs ${finite}, normalized allowance ${error}`);
        }
      }
      t.diagnostic(JSON.stringify({orientation,maximumScaledDerivativeDifference:worst}));
    }
  }finally{props.dispose();}
});

test('density-coordinate backend outage preserves all committed fluid storage and numerical ownership',async()=>{
  const props=new Properties(await factory()),c=circuit(props,corner,{storageCoordinates:'density',analyticFluxJacobian:true}),before=c.snapshot();
  try{
    props.pd=()=>{throw new DomainError('Injected density flash outage');};
    assert.throws(()=>c.prepareStep(.25,boundary(corner,'heating')),/Injected density flash outage/);
    assert.deepEqual(c.snapshot(),before);c.restore(before);assert.deepEqual(c.snapshot(),before);
  }finally{props.dispose();}
});

test('eliminating internal face unknowns solves every original saved mass/energy row with no inventory projection',async t=>{
  const props=new Properties(await factory());
  try{
    for(const saved of [corner,late])for(const orientation of ['heating','cooling']){
      const c=circuit(props,saved,{storageCoordinates:'density',analyticFluxJacobian:true,eliminateInternalFlows:true,polynomialThroatSearch:true});
      const before=c.snapshot(),input=structuredClone(saved.fluid),b=boundary(saved,orientation),dt=orientation==='heating'?.25:.003;
      const started=performance.now(),candidate=c.prepareSingle(dt,b,input);
      originalBalances(c,saved,b,dt,candidate);assert.deepEqual(c.snapshot(),before);assert.deepEqual(input,saved.fluid);
      assert.equal(candidate.snapshot.variables.length,saved.fluid.variables.length);
      t.diagnostic(JSON.stringify({eliminatedFlows:true,savedSeconds:saved.output.simulatedSeconds,orientation,dt,
        originalUnknowns:saved.fluid.variables.length,solvedUnknowns:c.flowOffset,iterations:candidate.nonlinearIterations,
        wallMs:performance.now()-started,massResidualKg:candidate.massResidualKg,energyResidualJ:candidate.energyResidualJ}));
    }
  }finally{props.dispose();}
});
