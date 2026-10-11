import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import factory from './backend.mjs';
import {Properties,DomainError} from './build/properties.js';
import {ChargeCircuit} from './build/charge.js';
const saved=JSON.parse(await readFile(new URL('../../research/charge-frost-debug-snapshot.json',import.meta.url),'utf8'));
const geometry=saved.config.inventory.geometry;
const boundary={orientation:saved.fluid.orientation,compressorSpeedRps:saved.output.diagnostics.speedRps,
  enabledRoomIds:geometry.rooms.map(r=>r.id),outdoorMetalC:saved.output.outdoor.metalTemperatureC,
  indoorMetalCById:Object.fromEntries(saved.output.rooms.map(r=>[r.id,r.metalTemperatureC]))};
const circuit=props=>new ChargeCircuit(props,geometry,{massKg:saved.config.inventory.initialMassKg,
  fluidTemperatureC:saved.config.inventory.initialFluidTemperatureC});

test('saved frost corner solves original local/global balances without importing or mutating state',async t=>{
  const props=new Properties(await factory());
  try{
    for(const dt of [.25,.125]){
      const c=circuit(props),before=c.snapshot(),previous=structuredClone(saved.fluid),original=JSON.stringify(previous);
      const start=performance.now(),candidate=c.prepareSingle(dt,boundary,previous);
      assert.deepEqual(c.snapshot(),before);assert.equal(JSON.stringify(previous),original);
      const r=c.evaluation(candidate.snapshot.variables,boundary,candidate.snapshot.openings,previous.compressorAdmission);
      let mass=0,energy=0;
      for(let i=0;i<previous.cells.length;i++){
        const a=previous.cells[i],b=candidate.snapshot.cells[i],dm=b.massKg-a.massKg,dU=b.internalEnergyJ-a.internalEnergyJ;
        const massLimit=1e-10+1e-10*a.massKg;
        const energyLimit=1e-5+1e-9*Math.abs(a.internalEnergyJ)+Math.max(Math.abs(a.state.hJkg),Math.abs(b.state.hJkg))*massLimit;
        assert.ok(Math.abs(dm-dt*r.dm[i])<=massLimit,`${a.id} original local mass allowance`);
        assert.ok(Math.abs(dU-dt*r.dU[i])<=energyLimit,`${a.id} original local energy allowance`);
        mass+=dm;energy+=dU;
      }
      energy-=candidate.compressorWorkJ+Object.values(candidate.integratedCoilHeatJ).reduce((a,b)=>a+b,0);
      assert.ok(Math.abs(mass)<=5e-11);assert.ok(Math.abs(energy)<=1e-5);
      assert.ok(Math.abs(dt*r.headerMass)<=1e-10);
      t.diagnostic(JSON.stringify({dt,iterations:candidate.nonlinearIterations,mass,energy,wallMs:performance.now()-start}));
    }
  }finally{props.dispose();}
});

test('real-EOS nozzle handles rounded endpoint sampling and vapor-to-wet isentropes',async()=>{
  const props=new Properties(await factory()),c=circuit(props);
  try{
    for(const cell of [saved.fluid.cells[0],saved.fluid.cells[7],saved.fluid.cells[8]]){
      for(const span of [1e-12,1e-9,1e-6,.001,.01,.1,.4,.6]){
        const flow=c.nozzle(cell.state,cell.state.pPa*(1-span),geometry.accumulatorInletAreaM2,.65,.1);
        assert.ok(Number.isFinite(flow)&&flow>0,`${cell.id} span ${span}`);
      }
      assert.equal(c.nozzle(cell.state,cell.state.pPa,geometry.accumulatorInletAreaM2),0);
      assert.equal(c.nozzle(cell.state,cell.state.pPa/2,0),0);
    }
    const up=saved.fluid.cells[0].state,area=1e-6,mu=props.prop('V','P',up.pPa,'H',up.hJkg);
    const resistance=8*Math.PI*mu*.1/(up.densityKgm3*area**2);
    for(const span of [1e-15,3e-16,1e-16]){
      const down=up.pPa*(1-span),flow=c.nozzle(up,down,area,.65,.1);
      assert.ok(up.pPa>down&&flow>0,'representable pressure drop remains finite');
      assert.ok(Math.abs(resistance*flow/(up.pPa-down)-1)<3e-5);
    }
    for(const drop of [1e-3,1e-4,1e-5]){
      const flow=c.nozzle(up,up.pPa-drop,area,.65,.1);
      assert.ok(Math.abs(resistance*flow/drop-1)<3e-5,'Poiseuille limit without formula switch');
    }
  }finally{props.dispose();}
});

test('PS outage during saved-state quadrature rejects the candidate and preserves committed M/U',async()=>{
  const props=new Properties(await factory()),c=circuit(props),before=c.snapshot(),original=props.prop.bind(props);
  try{
    props.prop=(output,a,x,b,y)=>{
      if(output==='D'&&a==='P'&&b==='S'&&x<1e6)throw new DomainError('Injected PS density outage');
      return original(output,a,x,b,y);
    };
    assert.throws(()=>c.prepareSingle(.25,boundary,saved.fluid),/Injected PS density outage/);
    assert.deepEqual(c.snapshot(),before);
  }finally{props.dispose();}
});

test('unresolved single-phase EOS density noise stops bounded quadrature without committing a partial fluid step',async()=>{
  const props=new Properties(await factory()),c=circuit(props),before=c.snapshot(),original=props.prop.bind(props);
  let noisyCalls=0;
  try{
    props.prop=(output,a,x,b,y)=>{
      const value=original(output,a,x,b,y);
      if(output==='D'&&a==='P'&&b==='T'&&x<1e6){
        noisyCalls++;return value*(1+.1*Math.sin(1000*x));
      }
      return value;
    };
    assert.throws(()=>c.prepareSingle(.25,boundary,saved.fluid),/work budget|quadrature error/);
    assert.ok(noisyCalls>0&&noisyCalls<=65536,'backend noise cannot cause unbounded work');
    assert.deepEqual(c.snapshot(),before);
  }finally{props.dispose();}
});

test('polynomial throat search agrees with independent real-EOS search without changing corrected-flow allowance',async t=>{
  const module=await factory(),props=new Properties(module);
  const original=circuit(props),optimized=new ChargeCircuit(props,geometry,{massKg:saved.config.inventory.initialMassKg,
    fluidTemperatureC:saved.config.inventory.initialFluidTemperatureC},{polynomialThroatSearch:true});
  try{
    let maximumDifference=0;
    for(const cell of [saved.fluid.cells[0],saved.fluid.cells[7],saved.fluid.cells[8]])for(const span of [1e-12,1e-9,1e-6,.001,.01,.1,.4,.6]){
      const down=cell.state.pPa*(1-span),a=original.nozzle(cell.state,down,geometry.accumulatorInletAreaM2,.65,.1),
        b=optimized.nozzle(cell.state,down,geometry.accumulatorInletAreaM2,.65,.1);
      maximumDifference=Math.max(maximumDifference,Math.abs(a-b));
      assert.ok(Math.abs(a-b)<=4e-11,`${cell.id}, span ${span}: native ${a} vs polynomial ${b}`);
    }
    t.diagnostic(JSON.stringify({independentNozzleSearchMaximumDifferenceKgs:maximumDifference,allowanceKgs:4e-11}));
  }finally{props.dispose();}
});

// Conservative Off/restart reached this wet restriction without state resets.
test('wet restart throat resolves corrected flow at strict allowance across the former search interval failure',async t=>{
  const props=new Properties(await factory()),native=circuit(props),fast=new ChargeCircuit(props,geometry,
    {massKg:saved.config.inventory.initialMassKg,fluidTemperatureC:saved.config.inventory.initialFluidTemperatureC},{polynomialThroatSearch:true});
  try{
    const up=props.ph(1987040.3023543248,241124.22321107646),area=1.5053326760407502e-7;
    const a=native.nozzle(up,448448.75821199635,area,.65,.005),b=fast.nozzle(up,448448.75821199635,area,.65,.005);
    assert.ok(a>0&&b>0);assert.ok(Math.abs(a-b)<=4e-11);
    t.diagnostic(JSON.stringify({wetRestartNativeFlowKgs:a,polynomialFlowKgs:b,allowanceKgs:4e-11}));
  }finally{props.dispose();}
});
