import test from 'node:test';
import assert from 'node:assert/strict';
import Module from './backend.mjs';
import { Properties, HeatPumpEngine, defaultEngineConfig } from './build/index.js';

const p = new Properties(await Module()), dt = .25;
function healthy(output) {
  assert.equal(output.diagnostics.fault, null);
  assert.ok(Math.abs(output.energy.residualJ) < .01);
  assert.ok(Math.abs(output.energy.waterResidualKg) < 1e-10);
}
function wetCooling() {
  const c = defaultEngineConfig(1); c.mode = 'cooling'; c.outdoorTemperatureC = 32; c.outdoorRelativeHumidity = .35;
  Object.assign(c.rooms[0], { initialTemperatureC: 27, initialRelativeHumidity: .7, setpointC: 22, ventilationACH: 0 });
  return c;
}
function runWet() {
  const c = wetCooling(), e = new HeatPumpEngine(p, c), initial = e.checkpoint();
  let drainedWaterKg = 0, output;
  for (let i = 0; i < 240; i++) {
    output = e.step(dt); healthy(output);
    drainedWaterKg += dt * (output.rooms[0].condensateKgs + output.outdoor.drainageKgs);
    assert.ok(Math.abs(output.energy.drainedWaterKg - drainedWaterKg) < 1e-12);
  }
  return { c, e, initial, output };
}

test('cooling cumulative drain matches actual condensate flow and room water-inventory loss', () => {
  const { e, initial, output } = runWet(), final = e.checkpoint();
  assert.ok(output.energy.drainedWaterKg > 0); assert.equal(output.outdoor.filmMassKg, 0);
  const lostRoomWaterKg = initial.rooms[0].dryAirMassKg * (initial.rooms[0].humidityRatio - final.rooms[0].humidityRatio);
  assert.ok(Math.abs(output.energy.drainedWaterKg - lostRoomWaterKg) < 1e-10);
});

test('dry Off operation produces no cumulative drainage and mode/settings edits preserve water history', () => {
  const dry = defaultEngineConfig(1); dry.outdoorTemperatureC = 20; dry.outdoorRelativeHumidity = .2;
  dry.outdoor.naturalAirConductanceWK = 0;
  Object.assign(dry.rooms[0], { enabled: false, initialRelativeHumidity: .2, envelopeWK: 0, ventilationACH: 0,
    airFabricWK: 0, naturalAirConductanceWK: 0 });
  const passive = new HeatPumpEngine(p, dry), dryOutput = passive.step(2); healthy(dryOutput);
  assert.equal(dryOutput.energy.drainedWaterKg, 0);
  const { c, e, output } = runWet();
  c.rooms[0].setpointC = 24;
  assert.equal(e.updateConfig(c).energy.drainedWaterKg, output.energy.drainedWaterKg);
  c.mode = 'heating';
  assert.equal(e.updateConfig(c).energy.drainedWaterKg, output.energy.drainedWaterKg);
  assert.equal(e.step(0).energy.drainedWaterKg, output.energy.drainedWaterKg);
  assert.equal(e.reset(c).energy.drainedWaterKg, 0);
});

test('failed native candidates cannot add water drainage or remove retained room water', () => {
  const { e, output } = runWet(), before = e.checkpoint(), original = p.airRH;
  p.airRH = () => { throw new Error('injected drainage candidate failure'); };
  let failed; try { failed = e.step(dt); } finally { p.airRH = original; }
  assert.match(failed.diagnostics.fault, /drainage candidate failure/);
  assert.equal(failed.energy.drainedWaterKg, output.energy.drainedWaterKg);
  assert.equal(failed.simulatedSeconds, output.simulatedSeconds);
  assert.deepEqual(e.checkpoint().rooms, before.rooms);
  assert.deepEqual(e.checkpoint().ledgers, before.ledgers);
  assert.equal(e.checkpoint().outdoorWaterKg, before.outdoorWaterKg);
});
