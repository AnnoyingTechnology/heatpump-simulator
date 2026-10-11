import test from 'node:test';
import assert from 'node:assert/strict';
import Module from './backend.mjs';
import { Properties, HeatPumpEngine, defaultEngineConfig } from './build/index.js';

const p = new Properties(await Module());
const dt = .25;
function healthy(output) {
  assert.equal(output.diagnostics.fault, null);
  assert.ok(Math.abs(output.energy.residualJ) < .01);
  assert.ok(Math.abs(output.energy.waterResidualKg) < 1e-10);
}
function passiveConfig() {
  const c = defaultEngineConfig(1);
  Object.assign(c.rooms[0], { enabled: false, envelopeWK: 0, ventilationACH: 0, airFabricWK: 0, naturalAirConductanceWK: 0 });
  c.outdoor.naturalAirConductanceWK = 0;
  return c;
}

test('session service heat counts heating/cooling HVAC service using the requested-mode sign', () => {
  for (const mode of ['heating', 'cooling']) {
    const c = defaultEngineConfig(1); c.mode = mode;
    if (mode === 'cooling') { c.outdoorTemperatureC = 32; c.rooms[0].initialTemperatureC = 27; c.rooms[0].setpointC = 24; }
    const e = new HeatPumpEngine(p, c); let output = e.snapshot(), measuredServiceJ = 0;
    assert.equal(output.energy.usefulServiceHeatJ, 0); assert.equal(output.energy.electricityJ, 0);
    for (let i = 0; i < 40; i++) {
      output = e.step(dt); healthy(output);
      measuredServiceJ += (mode === 'heating' ? output.signedRoomHeatW : -output.signedRoomHeatW) * dt;
      assert.ok(Math.abs(output.energy.usefulServiceHeatJ - measuredServiceJ) < 1e-7);
    }
    assert.ok(output.energy.usefulServiceHeatJ > 0); assert.ok(output.energy.electricityJ > 0);
    const expectedSign = mode === 'heating' ? 1 : -1;
    assert.equal(output.energy.usefulServiceHeatJ, expectedSign * output.energy.signedRoomHeatJ);
  }
});

test('Off control electricity contributes to the session denominator; internal gains earn no HVAC service', () => {
  const c = passiveConfig(); c.rooms[0].internalGainW = 500;
  const e = new HeatPumpEngine(p, c), output = e.step(2); healthy(output);
  assert.equal(output.energy.electricityJ, 2 * c.control.controlsW);
  assert.equal(output.energy.usefulServiceHeatJ, 0);
  assert.ok(Math.abs(output.energy.storedEnergyChangeJ - 1000) < 1e-6);
  const before = e.snapshot(); assert.deepEqual(e.step(0).energy, before.energy);
  c.control.controlsW = 0; const zeroInput = new HeatPumpEngine(p, c).step(2); healthy(zeroInput);
  assert.equal(zeroInput.energy.electricityJ, 0); assert.equal(zeroInput.energy.usefulServiceHeatJ, 0);
});

test('changing requested mode preserves prior service/electricity history and penalizes retained heat during reversal', () => {
  const c = defaultEngineConfig(1); c.outdoorTemperatureC = 7; c.outdoorRelativeHumidity = .35;
  const e = new HeatPumpEngine(p, c); for (let i = 0; i < 40; i++) healthy(e.step(dt));
  const heating = e.snapshot(); assert.ok(heating.energy.usefulServiceHeatJ > 0);
  c.mode = 'cooling'; c.outdoorTemperatureC = 32; c.rooms[0].setpointC = 18;
  const changed = e.updateConfig(c); healthy(changed);
  assert.equal(changed.energy.usefulServiceHeatJ, heating.energy.usefulServiceHeatJ);
  assert.equal(changed.energy.electricityJ, heating.energy.electricityJ);
  let totalServiceJ = heating.energy.usefulServiceHeatJ, reversedWrongSign = false, cooled = false;
  for (let i = 0; i < 240; i++) {
    const before = e.snapshot(), output = e.step(dt); healthy(output);
    totalServiceJ -= output.signedRoomHeatW * dt;
    assert.ok(Math.abs(output.energy.usefulServiceHeatJ - totalServiceJ) < 1e-7);
    if (output.state === 'reversing' && output.signedRoomHeatW > 0) {
      reversedWrongSign = true; assert.ok(output.energy.usefulServiceHeatJ < before.energy.usefulServiceHeatJ);
    }
    if (output.state === 'running' && output.signedRoomHeatW < 0) { cooled = true; break; }
  }
  assert.ok(reversedWrongSign); assert.ok(cooled);
  const reset = e.reset(c); assert.equal(reset.energy.usefulServiceHeatJ, 0); assert.equal(reset.energy.electricityJ, 0);
});

test('heating defrost with actual negative room heat subtracts from session useful service', () => {
  const c = defaultEngineConfig(3); c.outdoorTemperatureC = -3; c.outdoorRelativeHumidity = .99;
  Object.assign(c.control, { defrostIceThresholdKg: 1e-6, defrostMinHeatingSeconds: 0, reversalSeconds: .5, minOffSeconds: .75 });
  const e = new HeatPumpEngine(p, c); let negativeDefrost = false;
  for (let i = 0; i < 160; i++) {
    const before = e.snapshot(), output = e.step(dt); healthy(output);
    assert.ok(Math.abs(output.energy.usefulServiceHeatJ - output.energy.signedRoomHeatJ) < 1e-7);
    if (output.state === 'defrost' && output.effectiveMode === 'cooling' && output.signedRoomHeatW < 0) {
      assert.ok(output.energy.usefulServiceHeatJ < before.energy.usefulServiceHeatJ);
      assert.ok(output.energy.electricityJ > before.energy.electricityJ);
      negativeDefrost = true; break;
    }
  }
  assert.ok(negativeDefrost, 'reverse-cycle defrost must be observed with actual heat removal from room air');
});

test('a failed native candidate cannot add session useful heat or electricity', () => {
  const c = defaultEngineConfig(1), e = new HeatPumpEngine(p, c);
  for (let i = 0; i < 12; i++) healthy(e.step(dt));
  const before = e.snapshot(), saved = e.checkpoint(), original = p.airRH;
  p.airRH = () => { throw new Error('injected session ledger candidate failure'); };
  let failed; try { failed = e.step(dt); } finally { p.airRH = original; }
  assert.match(failed.diagnostics.fault, /session ledger candidate failure/);
  assert.equal(failed.energy.usefulServiceHeatJ, before.energy.usefulServiceHeatJ);
  assert.equal(failed.energy.electricityJ, before.energy.electricityJ);
  assert.deepEqual(e.checkpoint().ledgers, saved.ledgers);
  assert.equal(failed.simulatedSeconds, before.simulatedSeconds);
});
