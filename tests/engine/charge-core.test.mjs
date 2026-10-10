import test from 'node:test';
import assert from 'node:assert/strict';
import factory from '../../public/vendor/coolprop/coolprop.js';
import { Properties } from './build/properties.js';
import { ChargeCircuit, ChargeWorkBudgetError } from './build/charge.js';
import { HeatPumpEngine } from './build/engine.js';
import { configured } from './charge-fixture.mjs';
import { defaultRoomConfig } from './build/defaults.js';
import { readFile } from 'node:fs/promises';

test('opt-in pressure-drop core advances the saved passive balances without public restore or state mutation',async t=>{
  const fixture=JSON.parse(await readFile(new URL('../../research/charge-pilot-results.json',import.meta.url),'utf8')).passiveCorner;
  const previous=fixture.fluid,original=JSON.stringify(previous),props=new Properties(await factory()),results=[];
  const b={orientation:'heating',compressorSpeedRps:0,enabledRoomIds:fixture.config.inventory.geometry.rooms.map(r=>r.id),
    outdoorMetalC:fixture.output.outdoor.metalTemperatureC,
    indoorMetalCById:Object.fromEntries(fixture.output.rooms.map(r=>[r.id,r.metalTemperatureC]))};
  for(const numerics of [{pressureDerivativeRelativeStep:1e-10},{pressureDerivativeRelativeStep:1e-9},
    {pressureDerivativeRelativeStep:1e-8},{pressureDifferenceStepPa:1e-5},{pressureDifferenceStepPa:1e-3}]){
    const c=new ChargeCircuit(props,fixture.config.inventory.geometry,{massKg:1.8,fluidTemperatureC:7},
      {...numerics,pressureDifferenceCoordinates:true}),before=c.snapshot(),start=performance.now();
    assert.deepEqual(before.cells.map(v=>[v.id,v.volumeM3]),previous.cells.map(v=>[v.id,v.volumeM3]));
    // Diagnostic previous-state argument solves real core balances; it neither
    // authenticates/imports this external snapshot nor changes committed state.
    const r=c.prepareSingle(.25,b,previous);results.push(r);
    assert.deepEqual(c.snapshot(),before);assert.ok(Math.abs(r.massResidualKg)<1e-8);assert.ok(Math.abs(r.energyResidualJ)<.001);
    assert.equal(r.compressorWorkJ,0);assert.equal(r.snapshot.compressorAdmission,false);
    t.diagnostic(JSON.stringify({numerics,wallMs:performance.now()-start,iterations:r.nonlinearIterations,p:r.snapshot.variables.slice(0,3)}));
  }
  for(const r of results)for(let j=0;j<3;j++)assert.ok(Math.abs(r.snapshot.variables[j]-results[1].snapshot.variables[j])<.001);
  assert.equal(JSON.stringify(previous),original);props.dispose();
});

test('opt-in pressure-drop core preserves cold start, reversal and transactional budget rollback',async()=>{
  const props=new Properties(await factory()),finals=[];
  for(const pressureDifferenceCoordinates of [false,true]){
    const c=new ChargeCircuit(props,genericGeometry(),{massKg:.6,fluidTemperatureC:20},{pressureDifferenceCoordinates});
    for(let i=0;i<9;i++){
      const before=c.snapshot(),b=i<4?boundary():{...boundary(),orientation:'cooling',compressorSpeedRps:i===4?0:18};
      const r=c.prepareStep(.25,b);assert.deepEqual(c.snapshot(),before);
      assert.ok(Math.abs(r.massResidualKg)<1e-8);assert.ok(Math.abs(r.energyResidualJ)<.001);c.commit(r);
    }
    finals.push(c.snapshot());
  }
  for(let j=0;j<3;j++)assert.ok(Math.abs(finals[0].variables[j]-finals[1].variables[j])<1);
  const g=genericGeometry(),T=20,rv=props.prop('D','T',T+273.15,'Q',1),rl=props.prop('D','T',T+273.15,'Q',0);
  const V=g.outdoorCoilVolumeM3+g.accumulatorVolumeM3+g.rooms.reduce((s,r)=>s+r.coilVolumeM3+
    Math.PI*(r.gasInsideDiameterM**2+r.smallInsideDiameterM**2)*r.lineLengthM/4,0);
  const c=new ChargeCircuit(props,g,{massKg:V*(.97*rl+.03*rv),fluidTemperatureC:T},
    {pressureDifferenceCoordinates:true,maximumAttempts:1}),before=c.snapshot();
  assert.throws(()=>c.prepareStep(.25,boundary()),ChargeWorkBudgetError);assert.deepEqual(c.snapshot(),before);
  props.dispose();
});

test('pressure-drop coupled recovery preserves stores and rejected thermal candidates roll back fully',async()=>{
  const props=new Properties(await factory()),cfg=configured(),g=cfg.inventory.geometry,T=20;
  const volume=g.outdoorCoilVolumeM3+g.accumulatorVolumeM3+g.rooms.reduce((sum,r)=>sum+r.coilVolumeM3+
    Math.PI*(r.gasInsideDiameterM**2+r.smallInsideDiameterM**2)*r.lineLengthM/4,0);
  cfg.inventory.initialMassKg=volume*(.97*props.prop('D','T',T+273.15,'Q',0)+.03*props.prop('D','T',T+273.15,'Q',1));
  const engine=new HeatPumpEngine(props,cfg,{pressureDifferenceCoordinates:true}),before=engine.snapshot();
  assert.equal(before.inventory.compressorAdmitted,false);
  let recovered;
  for(let i=0;i<8;i++){recovered=engine.step(.25);assert.notEqual(recovered.state,'fault',recovered.diagnostics.fault);
    if(recovered.inventory.compressorAdmitted)break;}
  assert.equal(recovered.inventory.compressorAdmitted,true);
  assert.ok(recovered.simulatedSeconds>0&&recovered.simulatedSeconds<=2);
  assert.ok(Math.abs(recovered.energy.residualJ)<.005);assert.ok(Math.abs(recovered.inventory.massResidualKg)<1e-8);
  assert.ok(Math.abs(recovered.inventory.energyResidualJ)<.001);assert.ok(Math.abs(recovered.energy.waterResidualKg)<1e-9);
  assert.deepEqual(recovered.inventory.cells.map(c=>[c.id,c.volumeM3]),before.inventory.cells.map(c=>[c.id,c.volumeM3]));
  const bad=configured();bad.rooms[0].envelopeWK=1e12;
  const rejected=new HeatPumpEngine(props,bad,{pressureDifferenceCoordinates:true}),initial=rejected.snapshot(),fault=rejected.step(.25);
  assert.equal(fault.state,'fault');assert.equal(fault.simulatedSeconds,0);
  assert.deepEqual(fault.inventory,initial.inventory);assert.deepEqual(fault.rooms,initial.rooms);
  assert.deepEqual(fault.outdoor,initial.outdoor);assert.deepEqual(fault.energy,initial.energy);
  props.dispose();
});

test('initial EEV fraction changes only actuator initialization and retains closed-system owner startup balances',async t=>{
  const props=new Properties(await factory()),initials=[],last=[];
  for(const initialValveOpening of [.65,0]) {
    const cfg=configured();cfg.rooms=Array.from({length:3},(_,i)=>defaultRoomConfig(i));
    // Current owner-declared attic/upstairs/ground volumes; line and component volumes stay fixed.
    cfg.rooms.forEach((r,i)=>r.volumeM3=[84,155,100][i]);
    cfg.inventory.initialMassKg=1.8;cfg.inventory.initialFluidTemperatureC=7;
    cfg.inventory.initialValveOpening=initialValveOpening;
    cfg.inventory.geometry.rooms=cfg.rooms.map((r,i)=>({...cfg.inventory.geometry.rooms[0],id:r.id,lineLengthM:[14,6.5,7.5][i]}));
    const e=new HeatPumpEngine(props,cfg),before=e.snapshot();initials.push(before.inventory);
    assert.deepEqual(e.refrigerant.snapshot().openings,[initialValveOpening,initialValveOpening,initialValveOpening]);
    const edit=structuredClone(cfg);edit.inventory.initialValveOpening=.2;
    assert.throws(()=>e.updateConfig(edit),/Restart/);assert.deepEqual(e.snapshot(),before);
    let o;for(let i=0;i<4;i++){o=e.step(.25);assert.notEqual(o.state,'fault',o.diagnostics.fault);
      assert.ok(Math.abs(o.inventory.massResidualKg)<1e-8);assert.ok(Math.abs(o.inventory.energyResidualJ)<.001);
      assert.ok(Math.abs(o.energy.residualJ)<.005);assert.ok(Math.abs(o.energy.waterResidualKg)<1e-9);}
    assert.equal(o.simulatedSeconds,1);last.push(o);
    t.diagnostic(JSON.stringify({initialValveOpening,compressorMassFlowKgs:o.inventory.compressorMassFlowKgs,
      totalValveFlowKgs:Object.values(o.inventory.fieldPorts).reduce((s,f)=>s+f.valveMassFlowKgs,0),
      accumulatorMassKg:o.inventory.cells.find(c=>c.id==='accumulator').massKg}));
  }
  assert.deepEqual(initials[0].cells,initials[1].cells);
  assert.equal(initials[0].storedInternalEnergyJ,initials[1].storedInternalEnergyJ);
  // A closed actuator must not be mistaken for removal of pre-existing wet source holdup.
  assert.ok(last[1].inventory.cells.find(c=>c.id==='accumulator').massKg>initials[1].cells.find(c=>c.id==='accumulator').massKg);
  for(const initialValveOpening of[-.1,1.1,NaN,Infinity]) {
    const cfg=configured();cfg.inventory.initialValveOpening=initialValveOpening;
    assert.throws(()=>new HeatPumpEngine(props,cfg),/Initial EEV opening/);
    assert.throws(()=>new ChargeCircuit(props,genericGeometry(),{massKg:.6,fluidTemperatureC:20,valveOpening:initialValveOpening}),/Initial EEV opening/);
  }
  props.dispose();
});

export function genericGeometry(n=1){return {
  rooms:Array.from({length:n},(_,i)=>({id:`room-${i+1}`,coilVolumeM3:Math.PI*.006**2*10/4,refrigerantConductanceWK:350,
    lineLengthM:7.5,gasInsideDiameterM:.00792,smallInsideDiameterM:.00475,maximumValveAreaM2:5e-7})),
  outdoorCoilVolumeM3:Math.PI*.006**2*40/4,outdoorConductanceWK:1000,accumulatorVolumeM3:.0006,
  accumulatorInletAreaM2:1e-4,displacementM3rev:22e-6,volumetricEfficiency:.8,isentropicEfficiency:.7,
  dischargeCoefficient:.65,superheatTargetK:3,maximumDischargeC:145,maximumPressureRatio:8};}
export function boundary(n=1){return {orientation:'heating',compressorSpeedRps:18,
  enabledRoomIds:Array.from({length:n},(_,i)=>`room-${i+1}`),outdoorMetalC:7,
  indoorMetalCById:Object.fromEntries(Array.from({length:n},(_,i)=>[`room-${i+1}`,20]))};}

test('charge circuit starts from exact equal pressure, conservative candidates commit transactionally',async()=>{
  const props=new Properties(await factory()),c=new ChargeCircuit(props,genericGeometry(),{massKg:.6,fluidTemperatureC:20}),initial=c.snapshot();
  assert.equal(initial.variables[0],initial.variables[1]);assert.equal(initial.variables[0],initial.variables[2]);
  let latest;
  for(let i=0;i<4;i++){
    const previous=c.snapshot(),r=c.prepareStep(.25,boundary());
    assert.deepEqual(c.snapshot(),previous);assert.ok(r.compressorMassFlowKgs>0);
    assert.ok(r.compressorWorkJ>=0);assert.ok(Math.abs(r.massResidualKg)<1e-8);assert.ok(Math.abs(r.energyResidualJ)<.001);
    assert.ok(r.snapshot.cells.every(x=>x.massKg>0));c.commit(r);latest=r;
  }
  assert.equal(c.snapshot().timeSeconds,1);assert.throws(()=>c.commit(latest),/Stale/);
  c.restore(initial);assert.deepEqual(c.snapshot(),initial);props.dispose();
});

test('all Off retains physical charge and local enthalpy leak closes open inventory',async()=>{
  const props=new Properties(await factory()),c=new ChargeCircuit(props,genericGeometry(),{massKg:.6,fluidTemperatureC:20});
  const b={...boundary(),compressorSpeedRps:0,enabledRoomIds:[],leak:{physicalCellId:'room-1:gas',rateKgs:1e-5}};
  for(let i=0;i<4;i++){const r=c.prepareStep(.25,b);assert.equal(r.compressorWorkJ,0);assert.equal(r.compressorMassFlowKgs,0);
    assert.ok(Math.abs(r.massResidualKg)<1e-8);assert.ok(Math.abs(r.energyResidualJ)<.001);c.commit(r);}
  const s=c.snapshot();assert.ok(Math.abs(s.leakedMassKg-1e-5)<1e-14);
  assert.ok(s.leakedEnthalpyJ>0);assert.equal(s.cells.length,9);props.dispose();
});

test('geometry/candidate mutation and foreign restore cannot alter validated inventory',async()=>{
  const props=new Properties(await factory()),g=genericGeometry(),c=new ChargeCircuit(props,g,{massKg:.6,fluidTemperatureC:20});
  g.rooms[0].coilVolumeM3*=2;g.isentropicEfficiency=.1;
  assert.equal(c.geometry.isentropicEfficiency,.7);assert.equal(c.geometry.rooms[0].coilVolumeM3,genericGeometry().rooms[0].coilVolumeM3);
  const r=c.prepareStep(.25,boundary());assert.throws(()=>{r.snapshot.variables[0]=1;},TypeError);
  assert.throws(()=>{r.snapshot.cells[0].massKg=5;},TypeError);c.commit(r);
  const foreign=new ChargeCircuit(props,genericGeometry(),{massKg:.4,fluidTemperatureC:20}).snapshot();
  assert.throws(()=>c.restore(foreign),/issued by this circuit/);
  assert.throws(()=>new ChargeCircuit(props,{...genericGeometry(),rooms:[{...genericGeometry().rooms[0],id:'outdoor'}]},
    {massKg:.6,fluidTemperatureC:20}));props.dispose();
});

test('owner-like 3-branch generic charge cold-start and switched topology retain physical cells',async()=>{
  const props=new Properties(await factory()),g=genericGeometry(3);
  [14,6.5,7.5].forEach((L,i)=>g.rooms[i].lineLengthM=L);
  const c=new ChargeCircuit(props,g,{massKg:1.8,fluidTemperatureC:7});
  const b={...boundary(3),compressorSpeedRps:38};
  for(let i=0;i<8;i++){const r=c.prepareStep(.25,b);assert.ok(r.compressorMassFlowKgs>0);
    assert.ok(Math.abs(r.massResidualKg)<1e-8);assert.ok(Math.abs(r.energyResidualJ)<.001);c.commit(r);}
  const before=c.snapshot(),reverse={...b,orientation:'cooling',compressorSpeedRps:0};
  const candidate=c.prepareStep(.25,reverse);assert.deepEqual(c.snapshot(),before);
  assert.deepEqual(candidate.snapshot.cells.map(x=>[x.id,x.volumeM3]),before.cells.map(x=>[x.id,x.volumeM3]));
  assert.equal(candidate.compressorWorkJ,0);assert.ok(Math.abs(candidate.massResidualKg)<1e-8);
  assert.ok(Math.abs(candidate.energyResidualJ)<.001);c.commit(candidate);props.dispose();
});

test('equal-pressure startup is insensitive to one-decade pressure Jacobian changes and timestep-refines',async()=>{
  const props=new Properties(await factory()),out=[];
  for(const eps of [1e-10,1e-9,1e-8]){
    const c=new ChargeCircuit(props,genericGeometry(),{massKg:.6,fluidTemperatureC:20},{pressureDerivativeRelativeStep:eps});
    for(let i=0;i<4;i++){const r=c.prepareStep(.25,boundary());assert.ok(Math.abs(r.massResidualKg)<1e-8);
      assert.ok(Math.abs(r.energyResidualJ)<.001);c.commit(r);}
    out.push(c.snapshot());
  }
  for(const s of out)for(let i=0;i<3;i++)assert.ok(Math.abs(s.variables[i]-out[1].variables[i])<.02);
  const pressures=[];
  for(const dt of [.25,.125,.0625,.03125]){const c=new ChargeCircuit(props,genericGeometry(),{massKg:.6,fluidTemperatureC:20});
    for(let t=0;t<1-1e-12;t+=dt)c.commit(c.prepareStep(dt,boundary()));pressures.push(c.snapshot().variables.slice(0,3));}
  for(let i=0;i<3;i++){
    const a=Math.abs(pressures[1][i]-pressures[0][i]),b=Math.abs(pressures[2][i]-pressures[1][i]);
    const fine=Math.abs(pressures[3][i]-pressures[2][i]);
    assert.ok(b<a*.65);assert.ok(fine<b*.65);assert.ok(fine/pressures[3][i]<.003);
  }
  props.dispose();
});

test('reversal retains charge, transfers at low lift and returns to positive compression',async()=>{
  const props=new Properties(await factory()),c=new ChargeCircuit(props,genericGeometry(),{massKg:.6,fluidTemperatureC:20});
  let b=boundary(),seenLowLift=false,seenPositiveAfterTransfer=false;
  for(let i=0;i<40;i++){
    if(i===8)b={...b,orientation:'cooling',compressorSpeedRps:0};
    if(i===12)b={...b,compressorSpeedRps:18};
    const previous=c.snapshot(),r=c.prepareStep(.25,b);
    assert.deepEqual(c.snapshot(),previous);
    assert.deepEqual(r.snapshot.cells.map(x=>[x.id,x.volumeM3]),previous.cells.map(x=>[x.id,x.volumeM3]));
    assert.ok(Math.abs(r.massResidualKg)<1e-8);assert.ok(Math.abs(r.energyResidualJ)<.001);
    if(b.compressorSpeedRps===0){assert.equal(r.compressorMassFlowKgs,0);assert.equal(r.compressorWorkJ,0);}
    if(r.lowLiftTransfer){
      seenLowLift=true;assert.ok(r.diagnostics.some(s=>s.includes('no-load electrical draw excluded')));
      if(r.compressorDischarge.pPa<r.compressorSuction.pPa){
        assert.equal(r.compressorDischarge.hJkg,r.compressorSuction.hJkg);
        assert.ok(r.compressorSuction.phase==='vapor'||r.compressorSuction.qualityMass===1);
        assert.ok(r.compressorDischarge.entropyJkgK>=r.compressorSuction.entropyJkgK-1e-6);
      }
    }else if(seenLowLift&&r.compressorWorkJ>0)seenPositiveAfterTransfer=true;
    c.commit(r);
  }
  assert.ok(seenLowLift);assert.ok(seenPositiveAfterTransfer);assert.equal(c.snapshot().timeSeconds,10);props.dispose();
});

test('coupled high charge passes former single-phase PH Jacobian regression within compressor domain',async()=>{
  const props=new Properties(await factory()),cfg=configured();cfg.rooms[0].setpointC=24;cfg.inventory.initialMassKg=.9;
  const engine=new HeatPumpEngine(props,cfg);
  for(let i=0;i<13;i++){
    const o=engine.step(.25);assert.notEqual(o.state,'fault',o.diagnostics.fault);
    assert.ok(Math.abs(o.inventory.massResidualKg)<1e-8);assert.ok(Math.abs(o.inventory.energyResidualJ)<.001);
    assert.ok(Math.abs(o.energy.residualJ)<.005);assert.ok(o.inventory.cells.every(c=>c.massKg>0));
  }
  assert.equal(engine.snapshot().simulatedSeconds,3.25);props.dispose();
});

test('finite passage approaches viscous flow at zero lift and preserves the HEM choking plateau',async()=>{
  const props=new Properties(await factory()),c=new ChargeCircuit(props,genericGeometry(),{massKg:.6,fluidTemperatureC:20});
  const up=props.pt(800000,5),area=1e-6,length=.1,mu=props.prop('V','P',up.pPa,'H',up.hJkg);
  const resistance=8*Math.PI*mu*length/(up.densityKgm3*area**2);
  for(const drop of [1e-3,1e-4,1e-5]){
    const m=c.nozzle(up,up.pPa-drop,area,.65,length);
    assert.ok(m>0);assert.ok(Math.abs(resistance*m/drop-1)<3e-5);
  }
  const a=c.nozzle(up,.4*up.pPa,area,.65,length),b=c.nozzle(up,.2*up.pPa,area,.65,length);
  assert.ok(Math.abs(a/b-1)<1e-8);
  assert.ok(c.nozzle(up,.4*up.pPa,area,.65,2*length)<a);
  assert.ok(c.nozzle(up,.4*up.pPa,area,.65,0)>=a);
  assert.equal(c.nozzle(up,up.pPa,area),0);assert.equal(c.nozzle(up,.4*up.pPa,0),0);props.dispose();
});

test('submerged protection retains exact equilibrium and finite headspace recovers transactionally',async()=>{
  const props=new Properties(await factory()),g=genericGeometry(),pressure=props.pressureAtSaturationC(20);
  const rl=props.prop('D','P',pressure,'Q',0),rv=props.prop('D','P',pressure,'Q',1);
  const volume=g.outdoorCoilVolumeM3+g.accumulatorVolumeM3+g.rooms.reduce((sum,r)=>sum+r.coilVolumeM3+
    Math.PI*(r.gasInsideDiameterM**2+r.smallInsideDiameterM**2)*r.lineLengthM/4,0);
  const make=alpha=>new ChargeCircuit(props,g,{massKg:volume*((1-alpha)*rl+alpha*rv),fluidTemperatureC:20});
  const protectedCircuit=make(.01),initial=protectedCircuit.snapshot();
  const exact=protectedCircuit.prepareStep(.25,{...boundary(),outdoorMetalC:20});
  assert.equal(exact.nonlinearIterations,0);assert.equal(exact.snapshot.compressorAdmission,false);
  assert.equal(exact.compressorMassFlowKgs,0);assert.equal(exact.compressorWorkJ,0);
  assert.ok(Math.abs(exact.snapshot.openings[0]-(initial.openings[0]-.025))<1e-14);
  assert.ok(exact.snapshot.variables.every((v,i)=>v===initial.variables[i]));assert.deepEqual(protectedCircuit.snapshot(),initial);
  protectedCircuit.commit(exact);assert.equal(protectedCircuit.snapshot().timeSeconds,.25);
  for(let i=0;i<25;i++)protectedCircuit.commit(protectedCircuit.prepareStep(.25,{...boundary(),outdoorMetalC:20}));
  assert.equal(protectedCircuit.snapshot().openings[0],0);
  const held=protectedCircuit.prepareStep(.25,{...boundary(),outdoorMetalC:20});
  assert.equal(held.snapshot.openings[0],0);assert.equal(held.compressorMassFlowKgs,0);
  assert.deepEqual(held.snapshot.cells,initial.cells);
  const circuit=make(.03),before=circuit.snapshot(),candidate=circuit.prepareStep(.25,boundary());
  assert.equal(before.compressorAdmission,false);assert.equal(candidate.snapshot.compressorAdmission,true);
  assert.ok(candidate.compressorWorkJ>0);assert.ok(candidate.diagnostics.some(s=>s.includes('restores vapor admission')));
  assert.deepEqual(circuit.snapshot(),before);assert.ok(Math.abs(candidate.massResidualKg)<1e-8);
  assert.ok(Math.abs(candidate.energyResidualJ)<.001);
  assert.throws(()=>{candidate.snapshot.compressorAdmission=false;},TypeError);
  circuit.commit(candidate);circuit.restore(before);assert.deepEqual(circuit.snapshot(),before);
  const off=circuit.prepareStep(.25,{...boundary(),compressorSpeedRps:0,enabledRoomIds:[],outdoorMetalC:20});
  assert.equal(off.snapshot.compressorAdmission,false);assert.equal(off.compressorWorkJ,0);
  assert.throws(()=>circuit.prepareStep(.25,{...boundary(),indoorMetalCById:{'room-1':NaN}}));
  assert.deepEqual(circuit.snapshot(),before);props.dispose();
});

test('analytic storage derivatives match independent EOS differences in single and two-phase states',async()=>{
  const props=new Properties(await factory()),c=new ChargeCircuit(props,genericGeometry(),{massKg:.6,fluidTemperatureC:20});
  const pressure=809641.239883,sat=props.saturation(pressure),volume=.0011309733552923255/3;
  const enthalpies=[sat.liquidH-2000,...[.05,.5,.95].map(q=>sat.liquidH+q*(sat.vaporH-sat.liquidH)),sat.vaporH+2000];
  const state=(p,h)=>{const s=props.ph(p,h),mass=s.densityKgm3*volume;return {
    id:'probe',volumeM3:volume,state:s,massKg:mass,internalEnergyJ:mass*h-p*volume};};
  for(const h of enthalpies){
    const cell=state(pressure,h),derivatives=c.storageDerivatives(cell),dp=10,dh=.1;
    const pl=state(pressure-dp,h),ph=state(pressure+dp,h),hl=state(pressure,h-dh),hh=state(pressure,h+dh);
    for(const [name,finite] of Object.entries({massP:(ph.massKg-pl.massKg)/(2*dp),energyP:(ph.internalEnergyJ-pl.internalEnergyJ)/(2*dp),
      massH:(hh.massKg-hl.massKg)/(2*dh),energyH:(hh.internalEnergyJ-hl.internalEnergyJ)/(2*dh)}))
      assert.ok(Math.abs(derivatives[name]-finite)<Math.abs(derivatives[name])*.002+1e-10,
        JSON.stringify({h,phase:cell.state.phase,name,analytic:derivatives[name],finite}));
    for(const [name,finite] of Object.entries({temperatureP:(ph.state.temperatureC-pl.state.temperatureC)/(2*dp),
      temperatureH:(hh.state.temperatureC-hl.state.temperatureC)/(2*dh)}))
      assert.ok(Math.abs(derivatives[name]-finite)<Math.abs(derivatives[name])*.003+2e-7/(name==='temperatureP'?dp:dh),
        JSON.stringify({h,phase:cell.state.phase,name,analytic:derivatives[name],finite}));
  }
  props.dispose();
});

test('analytic storage Jacobian retains finite-difference physical solutions and event recovery',async()=>{
  const props=new Properties(await factory()),snapshots=[];
  for(const analyticStorageJacobian of [false,true]){
    const c=new ChargeCircuit(props,genericGeometry(),{massKg:.6,fluidTemperatureC:20},{analyticStorageJacobian});
    for(let i=0;i<4;i++)c.commit(c.prepareStep(.25,boundary()));snapshots.push(c.snapshot());
  }
  for(let i=0;i<3;i++)assert.ok(Math.abs(snapshots[0].variables[i]-snapshots[1].variables[i])<.02);
  for(let i=0;i<snapshots[0].cells.length;i++)assert.ok(Math.abs(snapshots[0].cells[i].state.hJkg-snapshots[1].cells[i].state.hJkg)<.01);
  const g=genericGeometry(),p=props.pressureAtSaturationC(20),rl=props.prop('D','P',p,'Q',0),rv=props.prop('D','P',p,'Q',1);
  const volume=g.outdoorCoilVolumeM3+g.accumulatorVolumeM3+g.rooms.reduce((s,r)=>s+r.coilVolumeM3+
    Math.PI*(r.gasInsideDiameterM**2+r.smallInsideDiameterM**2)*r.lineLengthM/4,0);
  const c=new ChargeCircuit(props,g,{massKg:volume*(.97*rl+.03*rv),fluidTemperatureC:20},{analyticStorageJacobian:true}),before=c.snapshot();
  const recovery=c.prepareStep(.25,boundary());assert.equal(recovery.snapshot.compressorAdmission,true);
  assert.ok(recovery.compressorWorkJ>0);assert.ok(Math.abs(recovery.massResidualKg)<1e-8);
  assert.ok(Math.abs(recovery.energyResidualJ)<.001);assert.deepEqual(c.snapshot(),before);props.dispose();
});

test('bubble and dew storage slopes follow the actual one-sided pressure and enthalpy branch',async()=>{
  const props=new Properties(await factory()),c=new ChargeCircuit(props,genericGeometry(),{massKg:.6,fluidTemperatureC:20});
  const p=809641.239883,V=.0011309733552923255/3;
  const cell=(pressure,h)=>{const state=props.ph(pressure,h),massKg=state.densityKgm3*V;
    return {id:'endpoint',volumeM3:V,state,massKg,internalEnergyJ:massKg*h-pressure*V};};
  for(const q of[0,1]){
    const h=props.prop('H','P',p,'Q',q),base=cell(p,h);assert.equal(base.state.qualityMass,q);
    for(const [axis,step] of [['P',-10],['P',10],['H',-10],['H',10]]){
      const trial=cell(axis==='P'?p+step:p,axis==='H'?h+step:h),homogeneous=trial.state.qualityMass===null;
      const d=c.storageDerivatives(base,homogeneous),mass=axis==='P'?d.massP:d.massH,energy=axis==='P'?d.energyP:d.energyH;
      const finiteM=(trial.massKg-base.massKg)/step,finiteU=(trial.internalEnergyJ-base.internalEnergyJ)/step;
      const massPrecision=1e-10+1e-10*base.massKg;
      assert.ok(Math.abs(finiteM-mass)<Math.abs(mass)*.003+2*massPrecision/Math.abs(step),JSON.stringify({q,axis,step,mass,finiteM}));
      assert.ok(Math.abs(finiteU-energy)<Math.abs(energy)*.003+2*(1e-5+Math.abs(h)*massPrecision)/Math.abs(step),
        JSON.stringify({q,axis,step,energy,finiteU}));
      const temperature=axis==='P'?d.temperatureP:d.temperatureH,finiteT=(trial.state.temperatureC-base.state.temperatureC)/step;
      assert.ok(Math.abs(finiteT-temperature)<Math.abs(temperature)*.003+2e-7/Math.abs(step),
        JSON.stringify({q,axis,step,temperature,finiteT}));
    }
  }
  props.dispose();
});

test('numerical work exhaustion rejects the whole fluid transaction without a physical protection claim',async()=>{
  const props=new Properties(await factory()),g=genericGeometry(),p=props.pressureAtSaturationC(20);
  const volume=g.outdoorCoilVolumeM3+g.accumulatorVolumeM3+g.rooms.reduce((s,r)=>s+r.coilVolumeM3+
    Math.PI*(r.gasInsideDiameterM**2+r.smallInsideDiameterM**2)*r.lineLengthM/4,0);
  const mass=volume*(.97*props.prop('D','P',p,'Q',0)+.03*props.prop('D','P',p,'Q',1));
  for(const numerics of [{maximumAttempts:1},{maximumSubsteps:1}]){
    const c=new ChargeCircuit(props,g,{massKg:mass,fluidTemperatureC:20},numerics),before=c.snapshot();
    assert.throws(()=>c.prepareStep(.25,boundary()),error=>error instanceof ChargeWorkBudgetError&&
      error.requestedSeconds===.25&&error.provisionalSeconds>=0&&error.provisionalSeconds<.25&&error.attempts>0);
    assert.deepEqual(c.snapshot(),before);
  }
  assert.throws(()=>new ChargeCircuit(props,g,{massKg:.6,fluidTemperatureC:20},{maximumAttempts:0}));props.dispose();
});

