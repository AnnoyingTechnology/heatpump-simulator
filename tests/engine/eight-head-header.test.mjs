import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import Module from './backend.mjs';
import { Properties, solveCycle } from './build/index.js';
import { conductanceIntegral, coilOutletH } from './build/cycle.js';
const properties = new Properties(await Module());
const fixture = JSON.parse(await readFile(new URL('./fixtures/eight-head-shared-header.json', import.meta.url), 'utf8'));
// Independently partitioned inverse over the whole crossed enthalpy interval.
function bisectedCondenser(inlet, flow, ua, metal) {
  const saturationC = properties.saturation(inlet.pPa).temperatureC;
  const terminalC = metal + 1e-5;
  let terminal = properties.prop('H', 'P', inlet.pPa, terminalC < saturationC ? 'T|liquid' : 'T|gas', terminalC + 273.15), origin = inlet.hJkg;
  if (conductanceIntegral(properties, inlet.pPa, origin, terminal, metal) * flow <= ua) return terminal;
  for (let i = 0; i < 45; i++) {
    const mid = .5 * (terminal + origin);
    if (conductanceIntegral(properties, inlet.pPa, inlet.hJkg, mid, metal) * flow > ua) terminal = mid; else origin = mid;
  }
  return .5 * (terminal + origin);
}

test('saved eight-head edits close finite-UA branches and a liquid mixed header, including sensible-only hot branches', () => {
  let sensibleOnly = false;
  for (const { label, input } of fixture.cases) {
    const out = solveCycle(properties, fixture.config, input);
    assert.ok(out.closureResidualW <= fixture.config.numerics.pressureToleranceW, label);
    assert.ok(Math.abs(out.massResidualKgs) * 250000 <= fixture.config.numerics.pressureToleranceW, label);
    assert.ok(out.compressorWorkW > 0);
    assert.ok(out.discharge.temperatureC <= fixture.config.compressor.maxDischargeC);
    assert.ok(out.highPressureBarAbs / out.lowPressureBarAbs <= fixture.config.compressor.maxPressureRatio);
    assert.equal(out.condenserOutlet.phase, 'liquid');
    assert.equal(out.suction.phase, 'vapor');
    const mixedH = out.branchOutlets.reduce((h, state, i) => h + out.branchMassFlowsKgs[i] * state.hJkg, 0) / out.totalMassFlowKgs;
    assert.ok(Math.abs(mixedH - out.condenserOutlet.hJkg) < 1e-7);
    assert.ok(Math.abs(mixedH - out.expansionOutlet.hJkg) < 1e-7);
    assert.ok(Math.abs(out.condenserHeatW - out.evaporatorHeatW - out.compressorWorkW) < 1e-7);
    const incomingEntropy = out.branchOutlets.reduce((s, state, i) => s + out.branchMassFlowsKgs[i] * state.entropyJkgK, 0);
    assert.ok(out.totalMassFlowKgs * out.condenserOutlet.entropyJkgK - incomingEntropy >= -1e-9, 'header entropy production');
    out.branchMassFlowsKgs.forEach((flow, i) => {
      if (!input.active[i]) { assert.equal(flow, 0); return; }
      const metal = input.indoorMetalC[i], inlet = out.branchInlets[i], outlet = out.branchOutlets[i];
      assert.ok(out.branchCoilHeatW[i] > 0);
      assert.ok(inlet.temperatureC > outlet.temperatureC && outlet.temperatureC > metal);
      assert.ok(flow * (outlet.entropyJkgK - inlet.entropyJkgK) + out.branchCoilHeatW[i] / (metal + 273.15) >= -1e-9, 'branch entropy production');
      const ua = fixture.config.rooms[i].refrigerantConductanceWK;
      const referenceH = bisectedCondenser(inlet, flow, ua, metal);
      assert.ok(Math.abs(outlet.hJkg - referenceH) * flow <= 1e-4, 'finite-UA outlet heat agrees with independently partitioned inverse');
      if (metal > out.condensingC) { sensibleOnly = true; assert.equal(outlet.phase, 'vapor'); }
    });
  }
  assert.ok(sensibleOnly, 'the retained trigger exercises a branch above shared saturation');
});

test('known-phase EOS integration resolves both sides of a condenser saturation pinch without moving temperatures', () => {
  const pressure = properties.pressureAtSaturationC(38), sat = properties.saturation(pressure);
  const inlet = properties.pt(pressure, 90).hJkg;
  for (const offset of [-.001, .001]) {
    const metal = 38 + offset, flow = .001, ua = 350;
    const outletH = coilOutletH(properties, pressure, inlet, flow, ua, metal, true);
    const outlet = properties.ph(pressure, outletH);
    assert.ok(outlet.temperatureC > metal);
    assert.ok(outletH < inlet);
    if (offset > 0) assert.ok(outletH > sat.vaporH, 'sensible-only branch remains vapor');
    const required = conductanceIntegral(properties, pressure, inlet, outletH, metal) * flow;
    assert.ok(required <= ua + 1e-4);
    assert.ok(Math.abs(required - ua) * (90 - metal) <= 1e-4 || outlet.temperatureC - metal <= 2e-5);
  }
  assert.throws(() => coilOutletH(properties, pressure, inlet, .001, 350, 95, true), /intended direction/);
});
