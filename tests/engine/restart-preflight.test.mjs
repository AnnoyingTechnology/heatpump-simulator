import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import Module from './backend.mjs';
import { Properties, HeatPumpEngine } from './build/index.js';
import { driveStep, newDriveState } from './build/drive.js';
const properties = new Properties(await Module());

test('thermal-boundary hold survives unknown and Off intervals and releases only on an available current-mode boundary', () => {
  const input = { demandRps: 35, minimumRps: 18, maximumRps: 75, maximumRatio: 8, maximumDischargeC: 145,
    minimumOffSeconds: 30, pressureRatio: 3, predictedDischargeC: 80, pickupAvailable: true };
  let drive = driveStep(newDriveState(), .25, { ...input, thermalBoundaryAvailable: false });
  assert.equal(drive.protection, 'thermal boundary');
  assert.equal(drive.speedRps, 0);
  drive = driveStep(drive, 40, { ...input, demandRps: 0, predictedDischargeC: null, pickupAvailable: false });
  assert.equal(drive.thermalBoundaryHold, true);
  assert.equal(drive.speedRps, 0);
  drive = driveStep(drive, .25, { ...input, coolingMode: false });
  assert.equal(drive.thermalBoundaryHold, true, 'a mode label alone supplies no current boundary evidence');
  drive = driveStep(drive, .25, { ...input, coolingMode: false, thermalBoundaryAvailable: true });
  assert.equal(drive.thermalBoundaryHold, false);
  assert.equal(drive.protection, null);
  assert.equal(drive.speedRps, 18);
  drive = driveStep(drive, .25, { ...input, thermalBoundaryAvailable: false, predictedDischargeC: 140 });
  drive = driveStep({ ...drive, offSeconds: 60 }, .25, { ...input, thermalBoundaryAvailable: true, predictedDischargeC: null });
  assert.equal(drive.thermalBoundaryHold, false);
  assert.equal(drive.dischargeHold, true, 'boundary recovery preserves independent discharge recovery');
  assert.equal(drive.speedRps, 0);
});

async function retainedEngine(sequence, ordinary = false) {
  const id = typeof sequence === 'number' ? `sequence-${sequence}` : sequence;
  const fixtureFolder = ordinary ? 'robustness-ordinary-UA' : 'robustness-20261012';
  const reviewFolder = ordinary ? 'robustness-ordinary-UA-counterexamples' : 'robustness-final-seeded-failures';
  const scenario = JSON.parse(await readFile(new URL(`./fixtures/${fixtureFolder}/${id}.json`, import.meta.url), 'utf8'));
  const receipt = JSON.parse(await readFile(new URL(`../../reviews/${reviewFolder}/${id}.json`, import.meta.url), 'utf8'),
    (_, value) => value?.nonfinite === 'Infinity' ? Infinity : value?.nonfinite === '-Infinity' ? -Infinity : value).result;
  const engine = new HeatPumpEngine(properties, scenario.config);
  engine.updateConfig(receipt.config);
  // Restore the immutable preceding accepted transaction; the original initial
  // scenario preserves the energy/water ledger origins through those edits.
  engine.restoreCheckpoint(structuredClone(receipt.acceptedCheckpoint));
  return { engine, config: receipt.config, checkpoint: receipt.acceptedCheckpoint };
}

test('saved hot-source restart uses a visible thermal hold, evolves fan/thermal stores and freshly resumes', async () => {
  const { engine, config, checkpoint } = await retainedEngine(16);
  const before = engine.snapshot();
  let output = engine.step(.25), holds = 0;
  assert.equal(output.diagnostics.fault, null);
  assert.equal(output.diagnostics.envelopeProtection, 'thermal boundary');
  assert.equal(output.cycle, null);
  assert.equal(output.electrical.compressorW, 0);
  assert.equal(output.electrical.outdoorFanW, config.outdoor.fanPowerW);
  assert.ok(output.electrical.indoorFansW > 0);
  assert.ok(output.outdoor.metalTemperatureC < before.outdoor.metalTemperatureC);
  assert.ok(engine.checkpoint().outdoorEnergyJ < checkpoint.outdoorEnergyJ);
  while (output.simulatedSeconds < checkpoint.time + 120) {
    assert.equal(output.diagnostics.fault, null);
    assert.ok(Math.abs(output.energy.residualJ) < .01);
    assert.ok(Math.abs(output.energy.waterResidualKg) < 1e-10);
    if (output.diagnostics.envelopeProtection === 'thermal boundary') holds++;
    if (output.cycle) {
      assert.ok(holds > 0);
      assert.equal(output.diagnostics.envelopeProtection, null);
      assert.ok(output.cycle.closureResidualW <= config.numerics.pressureToleranceW);
      assert.ok(Math.abs(output.cycle.massResidualKgs) * 250000 <= config.numerics.pressureToleranceW);
      assert.ok(output.cycle.compressorWorkW > 0);
      assert.ok(output.cycle.discharge.temperatureC < config.compressor.maxDischargeC);
      return;
    }
    assert.equal(output.electrical.compressorW, 0);
    output = engine.step(.25);
  }
  assert.fail('the retained warm source did not recover and freshly close within 120 s');
});

test('saved cold-source starts explicitly hold discharge before requesting an unsolved cycle', async () => {
  for (const sequence of [22, 28]) {
    const { engine } = await retainedEngine(sequence);
    const output = engine.step(.25);
    assert.equal(output.diagnostics.fault, null, `sequence-${sequence}`);
    assert.equal(output.diagnostics.envelopeProtection, 'discharge temperature');
    assert.equal(output.cycle, null);
    assert.equal(output.electrical.compressorW, 0);
    assert.ok(Math.abs(output.energy.residualJ) < .01);
    assert.ok(Math.abs(output.energy.waterResidualKg) < 1e-10);
  }
});

test('saved warm-source crossover seeds close with in-domain one-sided derivatives at the minimum lift', async () => {
  for (const fixture of ['grid-heating-45-0', 'sequence-11']) {
    const { engine, config } = await retainedEngine(fixture, true);
    for (let i = 0; i < 8; i++) {
      const output = engine.step(.25);
      assert.equal(output.diagnostics.fault, null, fixture);
      assert.ok(output.cycle, 'a new accepted cycle closes at the retained crossover');
      assert.ok(output.cycle.closureResidualW <= config.numerics.pressureToleranceW);
      assert.ok(Math.abs(output.cycle.massResidualKgs) * 250000 <= config.numerics.pressureToleranceW);
      assert.ok(output.cycle.condensingC - output.cycle.evaporatingC >= 1 - 1e-12);
      assert.ok(output.cycle.compressorWorkW > 0);
      assert.ok(Math.abs(output.energy.residualJ) < .01);
      assert.ok(Math.abs(output.energy.waterResidualKg) < 1e-10);
    }
  }
});
