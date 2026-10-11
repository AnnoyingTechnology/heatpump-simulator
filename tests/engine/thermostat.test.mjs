import test from 'node:test';
import assert from 'node:assert/strict';
import { thermostatDemand } from './build/thermostat.js';
import Module from './backend.mjs';
import { Properties, HeatPumpEngine, defaultEngineConfig } from './build/index.js';

test('thermostat holds off through sub-degree fluctuations and stops at the target in both modes', () => {
  for (const mode of ['heating', 'cooling']) {
    const target = 21, direction = mode === 'heating' ? -1 : 1;
    let active = false;
    for (const [offset, expected] of [[0, false], [.8, false], [.99, false], [1, true], [.6, true], [.01, true], [0, false], [.5, false], [1, true]]) {
      const room = target + direction * offset;
      const error = mode === 'heating' ? target - room : room - target;
      active = thermostatDemand(true, error, active, 1);
      assert.equal(active, expected, `${mode}, room ${room}`);
    }
    assert.equal(thermostatDemand(false, 10, true, 1), false, 'manual Off overrides demand');
  }
});

const properties = new Properties(await Module());
test('actual heating and cooling restart only beyond the one-degree margin and minimum-off dwell', () => {
  for (const mode of ['heating', 'cooling']) {
    const c = defaultEngineConfig(1), sign = mode === 'heating' ? 1 : -1;
    c.mode = mode; c.outdoorTemperatureC = mode === 'heating' ? 7 : 32; c.outdoorRelativeHumidity = .35;
    c.rooms[0].initialTemperatureC = mode === 'heating' ? 20 : 27;
    c.rooms[0].setpointC = c.rooms[0].initialTemperatureC + sign * 5;
    const e = new HeatPumpEngine(properties, c);
    let o = e.step(35);
    assert.equal(o.diagnostics.fault, null); assert.ok(o.cycle);
    c.rooms[0].setpointC = o.rooms[0].temperatureC - sign;
    e.updateConfig(c); o = e.step(.25);
    assert.equal(o.state, 'idle'); assert.equal(o.cycle, null);
    const stoppedAt = o.simulatedSeconds;
    c.rooms[0].setpointC = o.rooms[0].temperatureC + sign * .5;
    e.updateConfig(c); o = e.step(31);
    assert.equal(o.state, 'idle'); assert.equal(o.cycle, null, 'dwell expiry does not override restart margin');
    c.rooms[0].setpointC = o.rooms[0].temperatureC + sign * 1.05;
    const before = o; e.updateConfig(c); o = e.step(.25);
    assert.equal(o.diagnostics.fault, null); assert.equal(o.state, 'running'); assert.ok(o.cycle);
    assert.equal(o.simulatedSeconds, before.simulatedSeconds + .25);
    assert.ok(o.simulatedSeconds - stoppedAt >= c.control.minOffSeconds);
    assert.ok(Math.abs(o.energy.residualJ) < .01); assert.ok(Math.abs(o.energy.waterResidualKg) < 1e-10);
  }
});
