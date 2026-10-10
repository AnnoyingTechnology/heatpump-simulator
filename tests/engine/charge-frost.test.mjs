import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import factory from '../../public/vendor/coolprop/coolprop.js';
import { Properties } from './build/properties.js';
import { HeatPumpEngine } from './build/engine.js';
import { FUSION_JKG } from './build/film.js';
import { configured } from './charge-fixture.mjs';

// Generic early control trigger and minimum compressor speed make a finite test;
// all coil/room capacities, circuit volumes and safety limits remain the fixture's.
// No film mass/energy is injected, and atmospheric RH remains physically bounded.
// Science-reviewed cumulative accuracy budget: .1 mg R32 and .01 J fluid energy.
// No mass/energy projection or ledger rebase is permitted to satisfy this budget.
test('charged cold humid circuit deposits real ice and supplies finite latent heat during automatic reverse defrost', async () => {
  const sourceHashes = Object.fromEntries(await Promise.all(['charge.js', 'engine.js'].map(async file =>
    [file, createHash('sha256').update(await readFile(new URL(`./build/${file}`, import.meta.url))).digest('hex')])));
  console.log(JSON.stringify({ sourceHashes }));
  const p = new Properties(await factory());
  try {
    const resumedCheckpoint = process.env.CHARGE_FROST_RESUME_SNAPSHOT
      ? JSON.parse(await readFile(process.env.CHARGE_FROST_RESUME_SNAPSHOT, 'utf8')) : null;
    const c = resumedCheckpoint ? structuredClone(resumedCheckpoint.config) : configured();
    const stepSeconds = Number(process.env.CHARGE_FROST_STEP_SECONDS ?? .25);
    assert.ok([.25, .125].includes(stepSeconds), 'supported refinement .25 or .125 s');
    c.numerics.maxStepSeconds = stepSeconds;
    c.outdoorTemperatureC = -1; c.outdoorRelativeHumidity = .9;
    c.inventory.initialFluidTemperatureC = c.outdoorTemperatureC;
    c.control.proportionalSpeedRpsK = 0;
    c.control.defrostSpeedRps = c.compressor.speedMinRps;
    c.control.defrostMinHeatingSeconds = 5;
    c.control.defrostIceThresholdKg = .0001;
    c.control.defrostTerminationMetalC = 1;
    const chargeNumerics = process.env.CHARGE_FROST_PRESSURE_DROP_COORDINATES === '1'
      ? { pressureDifferenceCoordinates: true } : {};
    console.log(JSON.stringify({ stepSeconds, chargeNumerics }));
    const e = new HeatPumpEngine(p, c, chargeNumerics);
    assert.equal(resumedCheckpoint, null, 'Historical continuation requires the isolated reviewed research loader; public restore accepts owned snapshots only.');

    const initial = e.snapshot(), startedAt = performance.now();
    const saveProgress = async output => {
      if (!process.env.CHARGE_FROST_PROGRESS_SNAPSHOT) return;
      await writeFile(process.env.CHARGE_FROST_PROGRESS_SNAPSHOT, JSON.stringify({
        sourceHashes, originalSourceHashes: resumedCheckpoint?.sourceHashes ?? null,
        savedAt: new Date().toISOString(), wallSeconds: (performance.now() - startedAt) / 1000,
        config: e.getConfig(), output, fluid: e.refrigerant.snapshot(),
        controllerCheckpoint: e.checkpoint(), initialEnergyJ: e.initialEnergy, initialWaterKg: e.initialWater,
      }, null, 2) + '\n');
    };
    await saveProgress(initial);
    const identities = initial.inventory.cells.map(cell => ({ id: cell.id, volumeM3: cell.volumeM3 }));
    assert.equal(initial.outdoor.filmMassKg, 0);
    let prior = initial, maximumIce = 0, maximumLiquid = 0, meltedKg = 0, meltEnergyJ = 0;
    let defrostHeatJ = 0, defrostCompressorElectricityJ = 0, depositedKg = 0, drainedKg = 0, sawDefrost = false, completed = false, resumed = false;
    let maximumMassResidualKg = 0, maximumFluidEnergyResidualJ = 0, drainedSnapshot = null, terminationTrigger = null;
    let maximumFluidSubsteps = 1, totalReportedFluidSubsteps = 0;
    const states = new Set(), transitionSeconds = {};
    const phaseSeconds = {};
    for (let i = 0; i < 600 / stepSeconds; i++) {
      const o = e.step(stepSeconds), dt = o.simulatedSeconds - prior.simulatedSeconds;
      if (o.diagnostics.fault) console.log(JSON.stringify({ failure: o.diagnostics.fault, priorOutdoorCell: prior.inventory.cells.find(cell => cell.id === 'outdoor:0'), currentOutdoorCell: o.inventory.cells.find(cell => cell.id === 'outdoor:0') }));
      assert.equal(o.diagnostics.fault, null, `t=${o.simulatedSeconds}: ${o.diagnostics.fault}`);
      assert.equal(dt, stepSeconds);
      const fluidSubsteps = Number(o.diagnostics.warnings.find(w => /Fluid integration accepted/.test(w))?.match(/accepted (\d+)/)?.[1] ?? 1);
      maximumFluidSubsteps = Math.max(maximumFluidSubsteps, fluidSubsteps);
      totalReportedFluidSubsteps += fluidSubsteps;
      assert.ok(Math.abs(o.energy.residualJ) < .01, `system energy residual ${o.energy.residualJ}`);
      assert.ok(Math.abs(o.energy.waterResidualKg) < 1e-9);
      assert.ok(Math.abs(o.inventory.energyResidualJ) < .01);
      maximumMassResidualKg = Math.max(maximumMassResidualKg, Math.abs(o.inventory.massResidualKg));
      maximumFluidEnergyResidualJ = Math.max(maximumFluidEnergyResidualJ, Math.abs(o.inventory.energyResidualJ));
      assert.ok(Math.abs(o.inventory.massResidualKg) <= 1e-7, `t=${o.simulatedSeconds}: R32 mass residual ${o.inventory.massResidualKg}`);
      assert.ok(Math.abs(o.inventory.massKg - initial.inventory.massKg) <= 1e-7);
      assert.deepEqual(o.inventory.cells.map(cell => ({ id: cell.id, volumeM3: cell.volumeM3 })), identities);
      assert.ok(o.outdoor.iceKg >= 0 && o.outdoor.liquidKg >= 0);
      if (!states.has(o.state)) transitionSeconds[o.state] = o.simulatedSeconds;
      states.add(o.state); maximumIce = Math.max(maximumIce, o.outdoor.iceKg);
      maximumLiquid = Math.max(maximumLiquid, o.outdoor.liquidKg);
      if (o.outdoor.iceKg > 0) phaseSeconds.firstIce ??= o.simulatedSeconds;
      if (o.outdoor.liquidKg > 0) phaseSeconds.firstLiquid ??= o.simulatedSeconds;
      if (sawDefrost && prior.outdoor.iceKg > 0 && o.outdoor.iceKg === 0) phaseSeconds.iceExhausted ??= o.simulatedSeconds;
      depositedKg += o.outdoor.depositionKgs * dt;
      drainedKg += o.outdoor.drainageKgs * dt;
      if (o.state === 'defrost') {
        sawDefrost = true;
        assert.equal(o.inventory.orientation, 'cooling');
        // The physical drive may pause compression during restart delay or protection.
        defrostCompressorElectricityJ += o.electrical.compressorW * dt;
        if (o.cycle) assert.equal(o.cycle.mode, 'cooling');
        assert.equal(o.outdoor.fanPowerW, 0);
        assert.ok(o.rooms.every(room => room.fanPowerW === 0));
        defrostHeatJ += o.inventory.coilHeatW.outdoor * dt;
        meltEnergyJ += o.outdoor.meltPowerW * dt;
        meltedKg += Math.max(0, prior.outdoor.iceKg - o.outdoor.iceKg);
      }
      if (o.state !== prior.state) console.log(JSON.stringify({ state: o.state, speedRps: o.diagnostics.speedRps, accumulator: o.inventory.cells.find(cell => cell.id === 'accumulator'), orientation: o.inventory.orientation }));
      await saveProgress(o);
      if (i % (1 / stepSeconds) === 0 || (o.state !== prior.state)) console.log(JSON.stringify({ time: o.simulatedSeconds, wallSeconds: (performance.now() - startedAt) / 1000, state: o.state, iceKg: o.outdoor.iceKg, outdoorMetalC: o.outdoor.temperatureC, massResidualKg: o.inventory.massResidualKg, fluidEnergyResidualJ: o.inventory.energyResidualJ }));
      if (sawDefrost && o.state === 'draining') { completed = true; drainedSnapshot ??= o; terminationTrigger ??= prior; }
      if (completed && o.state === 'running' && o.inventory.orientation === 'heating' &&
          o.electrical.compressorW > 0 && o.inventory.coilHeatW['room-1'] > 0 &&
          o.inventory.coilHeatW.outdoor < 0) { resumed = true; prior = o; break; }
      prior = o;
    }
    assert.ok(maximumIce >= c.control.defrostIceThresholdKg, `maximum deposited ice ${maximumIce}`);
    assert.ok(states.has('reversing') && sawDefrost && completed && resumed, `states ${[...states]}`);
    assert.ok(depositedKg > 0 && meltedKg > 0 && meltEnergyJ > 0 && maximumLiquid > 0 && drainedKg > 0);
    assert.ok(defrostCompressorElectricityJ > 0, 'defrost requires actual compressor operation');
    assert.ok(defrostHeatJ >= meltedKg * FUSION_JKG, 'reverse refrigerant must supply at least the latent melt requirement');
    assert.ok(drainedSnapshot.outdoor.iceKg < 1e-6);
    assert.ok(terminationTrigger.outdoor.temperatureC >= c.control.defrostTerminationMetalC,
      'termination uses the accepted film state before the draining step');
    assert.ok(Math.abs(meltEnergyJ - meltedKg * FUSION_JKG) < .01,
      `latent heat ${meltEnergyJ}, ice decrease ${meltedKg}`);
    assert.ok(Math.abs(depositedKg - drainedKg - prior.outdoor.filmMassKg) < 1e-9,
      'outdoor deposition, retained ice/liquid and drainage must close independently');
    console.log(JSON.stringify({ stepSeconds, transitionSeconds, phaseSeconds, chargeNumerics, wallSeconds: (performance.now() - startedAt) / 1000, resumedFromSeconds: initial.simulatedSeconds, acceptedSeconds: prior.simulatedSeconds, maximumIceKg: maximumIce, maximumLiquidKg: maximumLiquid, meltedKg, meltEnergyJ, defrostHeatJ, defrostCompressorElectricityJ, depositedKg, drainedKg, maximumMassResidualKg, maximumFluidEnergyResidualJ, maximumFluidSubsteps, totalReportedFluidSubsteps }));
  } finally { p.dispose(); }
});
