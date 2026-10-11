import test from 'node:test';
import assert from 'node:assert/strict';
import Guarded from '../../public/vendor/coolprop-safe/adapter.js';
import Official from '../../public/vendor/coolprop/coolprop.js';
import { Properties, HeatPumpEngine, defaultEngineConfig, REFRIGERANTS } from './build/index.js';
import { solveCycle, conductanceIntegral } from './build/cycle.js';
const module = await Guarded(), oracle = await Official();
const released = Object.values(REFRIGERANTS).filter(f => f.qualification.reference);
const close = (a,b,label) => assert.ok(Math.abs(a-b)<3e-8*Math.max(1,Math.abs(b)),`${label}: ${a} != ${b}`);

test('qualified fluids use their own EOS and recover their identity after native rejection', () => {
  for (const fluid of released) {
    const p = new Properties(module,fluid.id);
    for (const saturationC of [-35,0,40,65]) {
      const pressure = p.pressureAtSaturationC(saturationC), sat = p.saturation(pressure);
      close(pressure,oracle.PropsSI('P','T',saturationC+273.15,'Q',1,fluid.backendFluid),`${fluid.id} saturation`);
      if(fluid.kind==='pure')close(sat.bubbleTemperatureC,sat.dewTemperatureC,`${fluid.id} zero glide`);else assert.ok(sat.dewTemperatureC>sat.bubbleTemperatureC);
      for (const quality of [0,.2,.7,1]) {
        const h = oracle.PropsSI('H','P',pressure,'Q',quality,fluid.backendFluid), state = p.ph(pressure,h);
        close(state.qualityMass,quality,`${fluid.id} quality`);
        for (const [key,output] of [['temperatureC','T'],['densityKgm3','D'],['entropyJkgK','S']])
          close(state[key]+(key==='temperatureC'?273.15:0),oracle.PropsSI(output,'P',pressure,'H',h,fluid.backendFluid),`${fluid.id} ${key}`);
      }
      for (const t of [saturationC-5,saturationC+10]) for (const output of ['H','S','D','C','V','A'])
        close(p.prop(output,'P',pressure,'T',t+273.15),oracle.PropsSI(output,'P',pressure,'T',t+273.15,fluid.backendFluid),`${fluid.id} ${output}`);
    }
    for(let i=0;i<25;i++) {
      p.clearCache(); p.prop('T','P',1e6,'Q',.3);
      assert.throws(()=>p.prop('A','P',1e6,'Q',.3));
      close(p.prop('H','P',1e6,'Q',.3),oracle.PropsSI('H','P',1e6,'Q',.3,fluid.backendFluid),`${fluid.id} getter recovery`);
      assert.throws(()=>p.prop('H','P',1e6,'T',-100));
      close(p.prop('H','P',1e6,'T',320),oracle.PropsSI('H','P',1e6,'T',320,fluid.backendFluid),`${fluid.id} update recovery`);
    }
    assert.throws(()=>p.ph(fluid.domain.maxPressurePa,1e5),/pressure outside/);
    assert.throws(()=>p.pt(1e6,fluid.domain.maxTemperatureC+.1),/outside|failed/);
    p.dispose();
  }
});

test('qualified fluids conserve real EOS heating/cooling and reverse defrost cycles with one, three and five branches', () => {
  for(const fluid of released) {
    const p = new Properties(module,fluid.id);
    for(const count of [1,3,5]) for(const mode of ['heating','cooling']) {
      const c=defaultEngineConfig(count);c.fluid=fluid.id;c.mode=mode;
      const out=solveCycle(p,c,{mode,indoorMetalC:Array(count).fill(mode==='heating'?30:15),outdoorMetalC:mode==='heating'?-3:38,active:Array(count).fill(true),speedRps:40});
      assert.ok(out.closureResidualW<=c.numerics.pressureToleranceW,fluid.id);
      assert.ok(Math.abs(out.massResidualKgs)*250000<=c.numerics.pressureToleranceW,fluid.id);
      assert.ok(Math.abs(out.condenserHeatW-out.evaporatorHeatW-out.compressorWorkW)<1e-6,fluid.id);
      assert.equal(out.suction.phase,'vapor');assert.ok(out.discharge.entropyJkgK>=out.suction.entropyJkgK);
      assert.ok(out.expansionOutlet.entropyJkgK>=out.condenserOutlet.entropyJkgK);
      assert.ok(out.branchCoilHeatW.every(q=>mode==='heating'?q>0:q<0));
      const hotK=(mode==='heating'?30:38)+273.15,coldK=(mode==='heating'?-3:15)+273.15;
      assert.ok(out.condenserHeatW/hotK-out.evaporatorHeatW/coldK>=-1e-6,fluid.id);
    }
    const c=defaultEngineConfig(3);c.fluid=fluid.id;
    const defrost=solveCycle(p,c,{mode:'cooling',defrost:true,indoorMetalC:[25,25,25],outdoorMetalC:-3,active:[true,true,true],speedRps:35});
    assert.ok(defrost.outdoorCoilHeatW>0&&defrost.branchCoilHeatW.every(q=>q<0),fluid.id);
    const pressure=p.pressureAtSaturationC(40),sat=p.saturation(pressure);
    if(fluid.kind==='pure')close(conductanceIntegral(p,pressure,sat.vaporH,sat.liquidH,20),(sat.vaporH-sat.liquidH)/20,`${fluid.id} latent integral`);
    p.dispose();
  }
});

test('qualified R32 physical field-line modes conserve cycles', () => {
  for(const fluid of released) {
    const p=new Properties(module,fluid.id);
    for(const mode of fluid.qualification.physicalLineModes) {
      const c=defaultEngineConfig(3);c.fluid=fluid.id;c.mode=mode;
      c.rooms.forEach((r,i)=>r.pipe.lengthM=[14,6.5,7.5][i]);
      const o=solveCycle(p,c,{mode,indoorMetalC:[30,30,30],outdoorMetalC:mode==='heating'?-3:40,active:[true,true,true],speedRps:40});
      assert.ok(o.pressureDropsPa.every(dp=>dp>0),fluid.id);
      assert.ok(Math.abs(o.condenserHeatW-o.evaporatorHeatW+o.lineHeatToOutdoorW-o.compressorWorkW)<1e-6,fluid.id);
      if(mode==='cooling')assert.ok(o.branchInlets.every(s=>s.phase==='two-phase'),fluid.id);
    }
    p.dispose();
  }
});

test('coupled moisture, frost/reversal, inverter and Off transitions conserve energy and water for released fluids', () => {
  for(const fluid of released) for(const mode of ['heating','cooling']) {
    const p=new Properties(module,fluid.id),c=defaultEngineConfig(1);c.fluid=fluid.id;c.mode=mode;
    c.outdoorTemperatureC=mode==='heating'?-5:32;c.outdoorRelativeHumidity=.95;
    Object.assign(c.rooms[0],{initialTemperatureC:mode==='heating'?20:27,initialRelativeHumidity:.85,setpointC:mode==='heating'?24:23});
    Object.assign(c.control,{defrostMinHeatingSeconds:5,defrostIceThresholdKg:.0001});
    const e=new HeatPumpEngine(p,c);let ice=false,condensate=false,reversed=false;
    for(let i=0;i<120;i++) {
      const o=e.step(.5);assert.equal(o.diagnostics.fault,null,`${fluid.id} ${mode} ${o.simulatedSeconds}`);
      assert.ok(Math.abs(o.energy.residualJ)<.01,fluid.id);assert.ok(Math.abs(o.energy.waterResidualKg)<1e-9,fluid.id);
      ice ||= o.outdoor.iceKg>0;condensate ||= o.rooms[0].condensateKgs>0;reversed ||= o.state==='reversing'||o.state==='defrost';
      if(o.cycle)assert.ok(o.cycle.closureResidualW<=c.numerics.pressureToleranceW);
    }
    if(mode==='heating'){assert.ok(ice,fluid.id);assert.ok(reversed,fluid.id);}else assert.ok(condensate,fluid.id);
    c.rooms[0].enabled=false;e.updateConfig(c);const stopped=e.step(.5);assert.equal(stopped.electrical.compressorW,0);assert.equal(stopped.cycle,null);
    assert.ok(Math.abs(stopped.energy.residualJ)<.01);p.dispose();
  }
});

test('unknown fluids, inventory changes and unresolved blend circuits fail closed', () => {
  assert.throws(()=>new Properties(module,'unknown'),/Unknown refrigerant/);
  const p=new Properties(module,'R22'),c=defaultEngineConfig(1);
  assert.throws(()=>new HeatPumpEngine(p,c),/Restart/);c.fluid='R22';
  c.inventory={initialMassKg:1.8,initialFluidTemperatureC:20,geometry:{}};
  assert.throws(()=>new HeatPumpEngine(p,c),/R32 only/);p.dispose();
  for(const id of ['R407C']) {
    const q=new Properties(module,id),c=defaultEngineConfig(1);c.fluid=id;
    assert.equal(REFRIGERANTS[id].kind,'zeotropic');assert.throws(()=>new HeatPumpEngine(q,c),/pending/);assert.throws(()=>solveCycle(q,c,{}),/pending/);q.dispose();
  }
});

test('released alternate fluids reject physical field lines and preserve their configured hardware',()=>{
  for(const fluid of released.filter(f=>f.id!=='R32')) for(const mode of ['heating','cooling']) {
    const p=new Properties(module,fluid.id),c=defaultEngineConfig(1);c.fluid=fluid.id;c.mode=mode;c.rooms[0].pipe.lengthM=5;
    const pipe=structuredClone(c.rooms[0].pipe);assert.throws(()=>new HeatPumpEngine(p,c),/physical .* field lines are not qualified/);assert.deepEqual(c.rooms[0].pipe,pipe);p.dispose();
  }
});

test('R410A retains its documented pseudo-pure glide in coil pinches and equilibrium temperature inverses',()=>{
  const p=new Properties(module,'R410A'),pressure=p.pressureAtSaturationC(40,'bubble'),sat=p.saturation(pressure),glide=sat.dewTemperatureC-sat.bubbleTemperatureC;
  assert.ok(glide>.05&&glide<.3);
  const metalC=sat.bubbleTemperatureC-.05;
  const expected=(sat.vaporH-sat.liquidH)/glide*Math.log((sat.dewTemperatureC-metalC)/(sat.bubbleTemperatureC-metalC));
  close(conductanceIntegral(p,pressure,sat.vaporH,sat.liquidH,metalC),expected,'R410A glide integral');
  const zeroGlide=(sat.vaporH-sat.liquidH)/(sat.dewTemperatureC-metalC);
  assert.ok(Math.abs(expected/zeroGlide-1)>.2);
  for(const fraction of [.1,.4,.9]) {
    const target=sat.bubbleTemperatureC+fraction*glide,h=p.equilibriumH(pressure,target);
    assert.ok(Math.abs(p.ph(pressure,h).temperatureC-target)<1e-7);
  }
  assert.throws(()=>conductanceIntegral(p,pressure,sat.vaporH,sat.liquidH,sat.bubbleTemperatureC+.5*glide),/pinch/);p.dispose();
});

test('R407C fixed mass composition resolves nonlinear phase equilibrium and explicit mass quality without releasing its circuit',()=>{
  const p=new Properties(module,'R407C'),pressure=p.pressureAtSaturationC(40,'bubble'),sat=p.saturation(pressure);
  assert.ok(sat.dewTemperatureC-sat.bubbleTemperatureC>4);
  const molar=Object.entries(REFRIGERANTS.R407C.massFractions).map(([f,y])=>[f,y/oracle.PropsSI('molar_mass','',0,'',0,f)]);
  const total=molar.reduce((s,[,n])=>s+n,0),composition='HEOS::'+molar.map(([f,n])=>`${f}[${n/total}]`).join('&');
  const h=p.prop('H','P',pressure,'Q',.5),state=p.ph(pressure,h);
  for(const [field,output] of [['temperatureC','T'],['densityKgm3','D'],['entropyJkgK','S'],['qualityMass','Qmass']])
    close(state[field]+(field==='temperatureC'?273.15:0),oracle.PropsSI(output,'P',pressure,'H',h,composition),`R407C ${field}`);
  assert.ok(Math.abs(state.qualityMass-.5)>.001);
  const fraction=(h-sat.liquidH)/(sat.vaporH-sat.liquidH),linear=sat.bubbleTemperatureC+fraction*(sat.dewTemperatureC-sat.bubbleTemperatureC);
  assert.ok(Math.abs(state.temperatureC-linear)>.005);
  assert.equal(REFRIGERANTS.R407C.qualification.reference,false);p.dispose();
});

test('released idealized refrigerants close direct zero-to-minimum startup points at unchanged tolerances',()=>{
  for(const fluid of released){const p=new Properties(module,fluid.id);for(const mode of ['heating','cooling'])for(const speedRps of [.05,.5,2]){
    const c=defaultEngineConfig(3);c.fluid=fluid.id;c.mode=mode;
    const o=solveCycle(p,c,{mode,indoorMetalC:Array(3).fill(mode==='heating'?20:27),outdoorMetalC:mode==='heating'?-5:32,active:[true,true,true],speedRps});
    assert.ok(o.closureResidualW<=c.numerics.pressureToleranceW,`${fluid.id} ${mode} ${speedRps}`);
    assert.ok(Math.abs(o.massResidualKgs)*250000<=c.numerics.pressureToleranceW);
    assert.ok(Math.abs(o.condenserHeatW-o.evaporatorHeatW-o.compressorWorkW)<1e-6);
    assert.ok(o.compressorWorkW>0);assert.equal(o.suction.phase,'vapor');
  }p.dispose();}
});
