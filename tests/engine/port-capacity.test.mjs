import test from 'node:test';
import assert from 'node:assert/strict';
import Factory from './backend.mjs';
import { Properties, HeatPumpEngine, defaultEngineConfig } from './build/index.js';

const properties = new Properties(await Factory());
const ledger = output => {
  assert.equal(output.diagnostics.fault, null);
  assert.ok(Math.abs(output.energy.residualJ) < 1e-5, `energy residual ${output.energy.residualJ} J`);
  assert.ok(Math.abs(output.energy.waterResidualKg) < 1e-12, `water residual ${output.energy.waterResidualKg} kg`);
};

test('connection count follows explicit port capacity and invalid declarations reject before property queries', () => {
  let queries = 0;
  const unavailable = { airW() { queries++; throw new Error('Unexpected property query'); } };
  const rejected = (config, pattern) => { assert.throws(() => new HeatPumpEngine(unavailable, config), pattern); assert.equal(queries, 0); };
  assert.equal(defaultEngineConfig().indoorPortCapacity, 5);
  for (const capacity of [0, -1, 1.5, NaN, Infinity]) {
    const config = defaultEngineConfig(1); config.indoorPortCapacity = capacity; rejected(config, /capacity must be a positive finite integer/);
  }
  const legacy = defaultEngineConfig(1); delete legacy.indoorPortCapacity;
  rejected(legacy, /capacity must be a positive finite integer/); // Old unversioned objects need an explicit caller declaration.
  rejected(defaultEngineConfig(6), /within declared indoor port capacity/);
  rejected(defaultEngineConfig(0), /at least one/);
  const duplicate = defaultEngineConfig(2); duplicate.rooms[1].id = duplicate.rooms[0].id; rejected(duplicate, /IDs must be unique/);
});

test('six idealized branches use real R32 heating/cooling states and conservative dynamics', () => {
  for (const mode of ['heating', 'cooling']) {
    const config = defaultEngineConfig(6); config.indoorPortCapacity = 6; config.mode = mode;
    if (mode === 'cooling') { config.outdoorTemperatureC = 32; config.outdoorRelativeHumidity = .5; config.rooms.forEach(room => { room.initialTemperatureC = 27; room.setpointC = 24; }); }
    const engine = new HeatPumpEngine(properties, config);
    for (const seconds of [.25, .75]) {
      const output = engine.step(seconds); ledger(output); assert.equal(output.state, 'running');
      const cycle = output.cycle; assert.ok(cycle); assert.equal(output.rooms.length, 6);
      assert.equal(cycle.branchInlets.length, 6); assert.equal(cycle.branchOutlets.length, 6);
      assert.ok(cycle.branchMassFlowsKgs.every(flow => flow > 0));
      assert.ok(cycle.branchCoilHeatW.every(heat => mode === 'heating' ? heat > 0 : heat < 0));
      assert.ok(Math.abs(cycle.branchMassFlowsKgs.reduce((a, b) => a + b, 0) - cycle.totalMassFlowKgs) < 1e-12);
      assert.ok(Math.abs(cycle.massResidualKgs) < 1e-6);
      assert.ok(Math.abs(cycle.condenserHeatW - cycle.evaporatorHeatW - cycle.compressorWorkW) < 1e-6);
      assert.equal(cycle.suction.phase, 'vapor');
      for (const state of [...cycle.branchInlets, ...cycle.branchOutlets]) {
        assert.ok(Number.isFinite(state.temperatureC) && Number.isFinite(state.hJkg));
        assert.ok(Math.abs(properties.ph(state.pPa, state.hJkg).temperatureC - state.temperatureC) < 1e-7);
      }
      console.log(JSON.stringify({ mode, simulatedSeconds: output.simulatedSeconds, pLowBarA: cycle.lowPressureBarAbs, pHighBarA: cycle.highPressureBarAbs, energyResidualJ: output.energy.residualJ, waterResidualKg: output.energy.waterResidualKg }));
    }
  }
});

test('removing a sixth room retains remaining inventories/time and exports its declared storage boundary', () => {
  const config = defaultEngineConfig(6); config.indoorPortCapacity = 6;
  const engine = new HeatPumpEngine(properties, config), before = engine.step(.5); ledger(before);
  const removedConfig = config.rooms[5], removed = before.rooms[5];
  const initialW = properties.airW(removedConfig.initialTemperatureC, removedConfig.initialRelativeHumidity, config.ambientPressurePa);
  const dryMass = removedConfig.volumeM3 / properties.dryAirSpecificVolume(removedConfig.initialTemperatureC, initialW, config.ambientPressurePa);
  const removedEnergy = dryMass * properties.airH(removed.temperatureC, removed.humidityRatio, config.ambientPressurePa)
    + removedConfig.fabricCapacityJK * removed.fabricTemperatureC + removedConfig.metalCapacityJK * removed.metalTemperatureC;
  config.rooms = config.rooms.slice(0, 5); config.indoorPortCapacity = 5;
  const edited = engine.updateConfig(config); ledger(edited);
  assert.equal(edited.simulatedSeconds, before.simulatedSeconds); assert.equal(edited.outdoor.filmMassKg, before.outdoor.filmMassKg); assert.equal(edited.outdoor.filmEnthalpyJ, before.outdoor.filmEnthalpyJ);
  assert.ok(Math.abs(edited.energy.configurationEnergyJ - before.energy.configurationEnergyJ + removedEnergy) < 1e-5);
  assert.ok(Math.abs(edited.energy.storedEnergyChangeJ - before.energy.storedEnergyChangeJ + removedEnergy) < 1e-5);
  edited.rooms.forEach((room, i) => {
    assert.equal(room.id, before.rooms[i].id); assert.equal(room.metalTemperatureC, before.rooms[i].metalTemperatureC); assert.equal(room.fabricTemperatureC, before.rooms[i].fabricTemperatureC);
    assert.equal(room.humidityRatio, before.rooms[i].humidityRatio); assert.ok(Math.abs(room.temperatureC - before.rooms[i].temperatureC) < 1e-8);
  });
  const invalid = structuredClone(config); invalid.indoorPortCapacity = 4;
  assert.throws(() => engine.updateConfig(invalid), /within declared indoor port capacity/); assert.deepEqual(engine.snapshot(), edited);
  const continued = engine.step(.25); ledger(continued); assert.equal(continued.state, 'running'); assert.equal(continued.rooms.length, 5); assert.equal(continued.simulatedSeconds, before.simulatedSeconds + .25);
});
