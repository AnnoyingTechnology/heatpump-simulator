import test from 'node:test';
import assert from 'node:assert/strict';
import Module from '../../public/vendor/coolprop/coolprop.js';
import { createPropertyService } from './build/properties.js';
import { defaultEngineConfig } from './build/defaults.js';
import { conductanceIntegral, solveCycle } from './build/cycle.js';
const properties = createPropertyService(await Module());
test('real R32 EOS shared-pressure cycle: one to five branches and both directions', () => {
  for (const count of [1, 3, 5]) for (const mode of ['heating', 'cooling']) {
    const config = defaultEngineConfig(count); config.mode = mode;
    const out = solveCycle(properties, config, { mode, indoorMetalC: Array(count).fill(mode === 'heating' ? 30 : 15), outdoorMetalC: mode === 'heating' ? -3 : 38, active: Array(count).fill(true), speedRps: 40 });
    assert.ok(out.highPressureBarAbs > out.lowPressureBarAbs);
    assert.ok(Math.abs(out.condenserHeatW - out.evaporatorHeatW - out.compressorWorkW) < 1e-7);
    assert.ok(out.closureResidualW <= .1);
    assert.ok(Math.abs(out.massResidualKgs) < .1 / 250000);
    assert.ok(out.branchCoilHeatW.every(q => mode === 'heating' ? q > 0 : q < 0));
    assert.ok(out.suction.phase === 'vapor' && out.expansionOutlet.phase === 'two-phase');
    assert.ok(Math.abs(out.expansionOutlet.hJkg - out.condenserOutlet.hJkg) < 1e-7);
    assert.ok(out.discharge.entropyJkgK >= out.suction.entropyJkgK);
  }
});
test('heat exchanger pinches fail explicitly', () => {
  const p = properties.pressureAtSaturationC(40), a = properties.pt(p, 70), b = properties.pt(p, 37);
  assert.throws(() => conductanceIntegral(properties, p, a.hJkg, b.hJkg, 38), /pinch/);

});
test('phase-aware integral latent zone agrees with analytical UA requirement', () => {
  const p = properties.pressureAtSaturationC(40), sat = properties.saturation(p);
  const actual = conductanceIntegral(properties, p, sat.vaporH, sat.liquidH, 20);
  assert.ok(Math.abs(actual - (sat.vaporH - sat.liquidH) / 20) < 1e-6);
});

test('real field lines close momentum/enthalpy in heating and cooling, including two-phase small pipe', () => {
  for (const mode of ['heating', 'cooling']) {
    const config = defaultEngineConfig(3); config.mode = mode;
    config.rooms.forEach((room, i) => { room.pipe.lengthM = [14, 6.5, 7.5][i]; });
    const args = { mode, indoorMetalC: [30,30,30], outdoorMetalC: mode === 'heating' ? -3 : 40, active: [true,true,true], speedRps: 40 };
    const physical = solveCycle(properties, config, args);
    assert.ok(physical.pressureDropsPa.every(p => p > 0));
    assert.ok(Math.abs(physical.condenserHeatW - physical.evaporatorHeatW + physical.lineHeatToOutdoorW - physical.compressorWorkW) < 1e-6);
    if (mode === 'cooling') assert.ok(physical.branchInlets.every(s => s.phase === 'two-phase'));
    config.rooms.forEach(room => { room.pipe.lengthM = 0; });
    const ideal = solveCycle(properties, config, args);
    assert.ok(Math.abs(physical.lineHeatToOutdoorW) > .1);
    assert.ok(physical.branchInlets.some((s,i)=>Math.abs(s.pPa - ideal.branchInlets[i].pPa)>1));
  }
});
test('cold reverse-cycle defrost floats subcooling and retains physical heat signs', () => {
  const config = defaultEngineConfig(3);
  const result = solveCycle(properties, config, { mode: 'cooling', defrost: true, indoorMetalC: [25,25,25], outdoorMetalC: -3, active: [true,true,true], speedRps: config.control.defrostSpeedRps });
  assert.ok(result.condenserOutlet.temperatureC > -3 && result.condenserOutlet.temperatureC < 0);
  assert.ok(result.outdoorCoilHeatW > 0 && result.branchCoilHeatW.every(q => q < 0));
  assert.ok(Math.abs(result.condensingC - result.evaporatingC - 8) < 1e-8);
});
test('heterogeneous idealized cooling conserves mixed-return enthalpy/entropy and valve allocation',()=>{
  const config=defaultEngineConfig(5),metal=[13.94,13.92,13.93,20,20];
  const args={mode:'cooling',indoorMetalC:metal,outdoorMetalC:38,active:Array(5).fill(true),speedRps:65};
  const out=solveCycle(properties,config,args),mixtureH=out.branchOutlets.reduce((s,state,i)=>s+state.hJkg*out.branchMassFlowsKgs[i],0)/out.totalMassFlowKgs;
  assert.ok(Math.abs(mixtureH-out.suction.hJkg)<1e-7);assert.equal(out.suction.phase,'vapor');
  const incomingS=out.branchOutlets.reduce((s,state,i)=>s+state.entropyJkgK*out.branchMassFlowsKgs[i],0);
  assert.ok(out.totalMassFlowKgs*out.suction.entropyJkgK-incomingS>=-1e-8);
  assert.ok(Math.abs(out.massResidualKgs)<.1/250000);
  const reversed=solveCycle(properties,config,{...args,indoorMetalC:[...metal].reverse()});assert.ok(Math.abs(reversed.evaporatingC-out.evaporatingC)<1e-6);assert.ok(Math.abs(reversed.condensingC-out.condensingC)<1e-6);
  const inactive=solveCycle(properties,config,{...args,active:[true,true,true,true,false]});assert.equal(inactive.branchMassFlowsKgs[4],0);
});
