import test from 'node:test';
import assert from 'node:assert/strict';
import Module from './backend.mjs';
import { Properties, HeatPumpEngine, defaultEngineConfig } from './build/index.js';
import { ventilationExchange } from './build/ventilation.js';
import { roomDemand } from './build/demand.js';
const properties = new Properties(await Module()), pressure = 101325;
const conservative = output => {
  assert.equal(output.diagnostics.fault, null);
  assert.ok(Math.abs(output.energy.residualJ) < .01);
  assert.ok(Math.abs(output.energy.waterResidualKg) < 1e-10);
};

test('native humid-gas cp uses the same dry-air basis as the room enthalpy derivative', () => {
  for (const [temperature, water] of [[5, .001], [22, .006], [35, .012]]) {
    const derivative = (properties.airH(temperature + .01, water, pressure) - properties.airH(temperature - .01, water, pressure)) / .02;
    const cp = properties.airCp(temperature, water, pressure);
    assert.ok(cp > 1000);
    assert.ok(Math.abs(cp - derivative) < .01, 'C and H must share a kg-dry-air basis');
  }
});

test('sensible recovery reduces winter and summer thermal exchange while retaining gross vapor exchange and latent-only loads', () => {
  for (const outside of [0, 35]) {
    const room = 22, roomWater = .006, outsideWater = outside === 0 ? .001 : .014, flow = .08;
    const single = ventilationExchange(properties, flow, room, roomWater, outside, outsideWater, pressure);
    const dual = ventilationExchange(properties, flow, room, roomWater, outside, outsideWater, pressure, .8);
    const ideal = ventilationExchange(properties, flow, room, roomWater, outside, outsideWater, pressure, 1);
    const sign = outside === 0 ? 1 : -1;
    assert.ok(sign * (dual.heatToRoomW - single.heatToRoomW) > 0);
    assert.ok(sign * (ideal.heatToRoomW - dual.heatToRoomW) > 0);
    assert.equal(dual.waterToRoomKgs, single.waterToRoomKgs);
    assert.equal(ideal.waterToRoomKgs, single.waterToRoomKgs);
    const sensibleLimit = flow * Math.min(properties.airCp(room, roomWater, pressure), properties.airCp(outside, outsideWater, pressure)) * (room - outside);
    assert.ok(Math.abs(ideal.recoveredSensibleW - sensibleLimit) < 1e-10);
    assert.ok(Math.abs(dual.recoveredSensibleW - .8 * sensibleLimit) < 1e-10);
  }
  const latentSingle = ventilationExchange(properties, .08, 22, .004, 22, .009, pressure);
  const latentDual = ventilationExchange(properties, .08, 22, .004, 22, .009, pressure, 1);
  assert.deepEqual(latentDual, latentSingle);
  assert.ok(latentDual.heatToRoomW > 0 && latentDual.waterToRoomKgs > 0, 'eta=1 retains unequal-humidity exchange');
});

function passive(outdoor = 0, effectiveness = 0) {
  const config = defaultEngineConfig(1);
  config.outdoorTemperatureC = outdoor; config.outdoorRelativeHumidity = .2;
  config.outdoor.naturalAirConductanceWK = 0;
  Object.assign(config.rooms[0], { enabled: false, initialTemperatureC: 22, initialRelativeHumidity: .2,
    envelopeWK: 0, ventilationACH: .5, ventilationRecoveryEfficiency: effectiveness,
    airFabricWK: 0, naturalAirConductanceWK: 0, fanPowerW: 0, internalGainW: 0 });
  return config;
}

test('frozen-state recovery enters only the ventilation energy boundary and leaves total exchanged water unchanged', () => {
  for (const outdoor of [0, 35]) {
    const single = new HeatPumpEngine(properties, passive(outdoor, 0));
    const dual = new HeatPumpEngine(properties, passive(outdoor, .8));
    const before = single.checkpoint(), config = single.getConfig(), room = before.rooms[0], flow = room.dryAirMassKg * .5 / 3600;
    const outsideWater = properties.airW(outdoor, .2, pressure);
    const recovered = .8 * flow * Math.min(properties.airCp(22, room.humidityRatio, pressure), properties.airCp(outdoor, outsideWater, pressure)) * (22 - outdoor);
    const singleOutput = single.step(.25), dualOutput = dual.step(.25);
    conservative(singleOutput); conservative(dualOutput);
    const singleState = single.checkpoint(), dualState = dual.checkpoint();
    assert.ok(Math.abs(dualState.rooms[0].airEnthalpyJ - singleState.rooms[0].airEnthalpyJ - recovered * .25) < 1e-7);
    assert.ok(Math.abs(dualOutput.energy.boundaryEnergyJ - singleOutput.energy.boundaryEnergyJ - recovered * .25) < 1e-7);
    const expectedWater = room.dryAirMassKg * room.humidityRatio + .25 * flow * (outsideWater - room.humidityRatio);
    for (const state of [singleState, dualState]) {
      assert.ok(Math.abs(state.rooms[0].dryAirMassKg * state.rooms[0].humidityRatio - expectedWater) < 1e-12);
      assert.equal(state.rooms[0].retainedWaterKg, 0);
      assert.equal(state.rooms[0].retainedIceKg, 0);
    }
    assert.equal(singleState.rooms[0].humidityRatio, dualState.rooms[0].humidityRatio);
    assert.equal(singleOutput.signedRoomHeatW, 0); assert.equal(dualOutput.signedRoomHeatW, 0);
    assert.equal(dualOutput.heatingCOP, null); assert.equal(dualOutput.coolingCOP, null);
    assert.equal(dualOutput.electrical.totalW, config.control.controlsW);
  }
});

test('recovery feeds the sensible demand estimate and remains conservative during active heating and cooling', () => {
  for (const mode of ['heating', 'cooling']) {
    const config = defaultEngineConfig(3); config.mode = mode;
    config.outdoorTemperatureC = mode === 'heating' ? 7 : 33;
    config.outdoorRelativeHumidity = .35;
    config.rooms.forEach(room => Object.assign(room, { initialTemperatureC: mode === 'heating' ? 17 : 28,
      setpointC: mode === 'heating' ? 22 : 24, initialRelativeHumidity: .3,
      ventilationACH: .5, ventilationRecoveryEfficiency: .8 }));
    const engine = new HeatPumpEngine(properties, config), states = engine.checkpoint().rooms;
    const targets = config.rooms.map(room => room.setpointC);
    const single = structuredClone(config); single.rooms.forEach(room => { room.ventilationRecoveryEfficiency = 0; });
    const active = config.rooms.map(() => true), integral = config.rooms.map(() => 0);
    const singleDemand = roomDemand(single, states, targets, active, integral, .25, false);
    const dualDemand = roomDemand(config, states, targets, active, integral, .25, false);
    config.rooms.forEach((room, i) => {
      const expectedReduction = .8 * states[i].dryAirMassKg * .5 / 3600 * 1006 * Math.abs(room.setpointC - config.outdoorTemperatureC);
      assert.ok(Math.abs(singleDemand.heatW[i] - dualDemand.heatW[i] - expectedReduction) < 1e-8);
    });
    let running = false;
    for (let i = 0; i < 80; i++) {
      const output = engine.step(.25); conservative(output);
      if (output.cycle) { running = true; assert.ok(output.cycle.closureResidualW <= config.numerics.pressureToleranceW); }
    }
    assert.ok(running);
  }
});

test('omitted recovery equals single-flow and recovery edits preserve accepted stores while rejecting invalid effectiveness', () => {
  const config = passive(7); delete config.rooms[0].ventilationRecoveryEfficiency;
  const explicit = structuredClone(config); explicit.rooms[0].ventilationRecoveryEfficiency = 0;
  const engine = new HeatPumpEngine(properties, config);
  assert.deepEqual(engine.step(2), new HeatPumpEngine(properties, explicit).step(2));
  const before = engine.snapshot();
  const editedConfig = engine.getConfig(); editedConfig.rooms[0].ventilationRecoveryEfficiency = .8;
  const edited = engine.updateConfig(editedConfig);
  assert.equal(edited.simulatedSeconds, before.simulatedSeconds);
  assert.equal(edited.energy.electricityJ, before.energy.electricityJ);
  assert.equal(edited.energy.drainedWaterKg, before.energy.drainedWaterKg);
  assert.ok(Math.abs(edited.rooms[0].temperatureC - before.rooms[0].temperatureC) < 1e-9);
  assert.ok(Math.abs(edited.energy.configurationEnergyJ - before.energy.configurationEnergyJ) < 1e-6);
  const accepted = engine.snapshot(), acceptedConfig = engine.getConfig();
  for (const invalid of [-.1, 1.1, NaN, Infinity, null, '.8']) {
    const candidate = structuredClone(acceptedConfig); candidate.rooms[0].ventilationRecoveryEfficiency = invalid;
    assert.throws(() => engine.updateConfig(candidate), /ventilation recovery/);
    assert.deepEqual(engine.snapshot(), accepted); assert.deepEqual(engine.getConfig(), acceptedConfig);
  }
});

test('hot saturated intake with high sensible effectiveness keeps gross water and phase storage without a virtual supply flash', () => {
  for (const effectiveness of [.8, 1]) {
    const config = passive(45, effectiveness); config.mode = 'cooling';
    config.outdoorRelativeHumidity = 1;
    config.rooms[0].initialTemperatureC = 10;
    config.rooms[0].initialRelativeHumidity = 1;
    const engine = new HeatPumpEngine(properties, config), before = engine.checkpoint();
    const mass = before.rooms[0].dryAirMassKg, initialWater = mass * before.rooms[0].humidityRatio;
    const outsideWater = properties.airW(45, 1, pressure);
    let output;
    for (let i = 0; i < 40; i++) {
      const current = engine.checkpoint().rooms[0];
      const water = mass * current.humidityRatio + (current.retainedWaterKg ?? 0);
      const expected = water + .25 * mass * .5 / 3600 * (outsideWater - current.humidityRatio);
      output = engine.step(.25); conservative(output);
      const accepted = engine.checkpoint().rooms[0];
      assert.ok(Math.abs(mass * accepted.humidityRatio + (accepted.retainedWaterKg ?? 0) - expected) < 1e-12);
    }
    assert.ok(output.rooms[0].retainedWaterKg > 0, 'supersaturated mixing retains actual room condensate');
    assert.ok(mass * output.rooms[0].humidityRatio + output.rooms[0].retainedWaterKg > initialWater);
    assert.equal(output.energy.drainedWaterKg, 0, 'ventilation recovery invents no exchanger drainage');
  }
});
