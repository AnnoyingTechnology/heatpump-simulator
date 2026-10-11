import test from 'node:test';
import assert from 'node:assert/strict';
import factory from './backend.mjs';
import {Properties,DomainError} from './build/properties.js';
import {ChargeCircuit} from './build/charge.js';
import {HeatPumpEngine} from './build/engine.js';
import {eevPiStep} from './build/charge-valve.js';
import {configured} from './charge-fixture.mjs';
const control={proportionalOpeningPerK:.03,integralOpeningPerKs:.001,slewOpeningPerSecond:.1};

test('PI bias retains memory and antiwindup includes actual valve slew and position limits',()=>{
  const initial={opening:.2,integralBias:.2};
  const limited=eevPiStep(initial,100,.25,control,false);
  assert.equal(limited.opening,.225);assert.equal(limited.integralBias,.2);
  const feasible=eevPiStep(initial,.5,.25,control,false);
  assert.ok(Math.abs(feasible.integralBias-.200125)<1e-12);assert.ok(feasible.opening>.2);
  const returning=eevPiStep({opening:.2,integralBias:2},-2,.25,control,false);
  assert.ok(returning.integralBias<2,'integral action toward feasibility remains admitted');
  const lower=eevPiStep({opening:0,integralBias:-1},-3,.25,control,false);
  assert.equal(lower.opening,0);assert.equal(lower.integralBias,-1);
  assert.deepEqual(initial,{opening:.2,integralBias:.2});
});

test('proposed integral action cannot itself cross upper/lower position or slew feasibility',()=>{
  for(const [opening,error] of [[.99,110],[.99,200],[.01,-110],[.01,-200],[.5,110],[.5,-110]]){
    const initial={opening,integralBias:opening-control.proportionalOpeningPerK*error};
    const next=eevPiStep(initial,error,.25,control,false),raw=next.integralBias+control.proportionalOpeningPerK*error;
    const low=Math.max(0,opening-.025),high=Math.min(1,opening+.025);
    assert.ok(raw>=low-1e-12&&raw<=high+1e-12);assert.ok(next.opening>=low-1e-12&&next.opening<=high+1e-12);
    if(error>0)assert.ok(next.integralBias<0,'signed negative bias is retained');
  }
});

test('inactive and reversal tracking are bumpless, signed bias is retained and actuator time refinement agrees',()=>{
  const initial={opening:.8,integralBias:-2};
  const off=eevPiStep(initial,100,.25,control,true);
  assert.equal(off.opening,.775);assert.ok(off.integralBias<0);
  const rearmed=eevPiStep(off,100,.25,control,false);
  assert.ok(Math.abs(rearmed.opening-off.opening)<=.025+1e-12);
  const reversed=eevPiStep(off,-50,.25,control,false,true);
  assert.ok(Math.abs(reversed.opening-off.opening)<=.025+1e-12);
  const advance=dt=>{let state={opening:.8,integralBias:.8};for(let j=0;j<Math.round(2/dt);j++)state=eevPiStep(state,-20,dt,control,false);return state;};
  const a=advance(.25),b=advance(.125),c=advance(.0625);
  assert.ok(Math.abs(b.opening-c.opening)<=Math.abs(a.opening-b.opening)+1e-12);
  assert.throws(()=>eevPiStep(initial,NaN,.25,control,false),/Invalid/);
});

test('accepted PI state advances transactionally and actual backend failure rolls back every bias/opening/store',async()=>{
  const props=new Properties(await factory()),config=configured();config.inventory.geometry.eevController=control;
  const circuit=new ChargeCircuit(props,config.inventory.geometry,{massKg:.6,fluidTemperatureC:20},{storageCoordinates:'density',analyticFluxJacobian:true,eliminateInternalFlows:true,polynomialThroatSearch:true});
  const b={orientation:'heating',compressorSpeedRps:18,enabledRoomIds:['room-1'],outdoorMetalC:7,indoorMetalCById:{'room-1':20}};
  try{
    const before=circuit.snapshot(),candidate=circuit.prepareStep(.25,b);
    assert.deepEqual(circuit.snapshot(),before);assert.notDeepEqual(candidate.snapshot.openings,before.openings);
    assert.ok(candidate.snapshot.valveIntegralBias);circuit.commit(candidate);const accepted=circuit.snapshot();
    props.pd=()=>{throw new DomainError('Injected PI physical flash outage');};
    assert.throws(()=>circuit.prepareStep(.25,b),/Injected PI physical flash outage/);
    assert.deepEqual(circuit.snapshot(),accepted);circuit.restore(before);assert.deepEqual(circuit.snapshot(),before);
  }finally{props.dispose();}
});

test('parent thermal rejection rolls back persistent PI bias with all coupled finite stores',async()=>{
  const props=new Properties(await factory()),config=configured();config.inventory.geometry.eevController=control;config.rooms[0].envelopeWK=1e12;
  try{
    const engine=new HeatPumpEngine(props,config),before=engine.refrigerant.snapshot(),o=engine.step(.25);
    assert.equal(o.state,'fault');assert.equal(o.simulatedSeconds,0);assert.deepEqual(engine.refrigerant.snapshot(),before);
    assert.equal(o.energy.electricityJ,0);
  }finally{props.dispose();}
});
