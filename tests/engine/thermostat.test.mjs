import test from 'node:test';
import assert from 'node:assert/strict';
import { thermostatDemand, thermostatFanFraction, initialThermostatDemand } from './build/thermostat.js';
import Module from './backend.mjs';
import { Properties, HeatPumpEngine, defaultEngineConfig } from './build/index.js';

test('thermostat call persists between inclusive symmetric one-degree thresholds in both modes', () => {
  for (const mode of ['heating', 'cooling']) {
    const target = 21, direction = mode === 'heating' ? -1 : 1;
    let active = false;
    for (const [offset, expected] of [[0, false], [.8, false], [.99, false], [1, true], [.6, true], [.01, true], [0, true], [-.99, true], [-1, false], [.5, false], [1, true]]) {
      const room = target + direction * offset;
      const error = mode === 'heating' ? target - room : room - target;
      active = thermostatDemand(true, error, active, 1);
      assert.equal(active, expected, `${mode}, room ${room}`);
    }
    assert.equal(thermostatDemand(false, 10, true, 1), false, 'manual Off overrides demand');
  }
});

test('inverter fan stays on and varies continuously inside a retained call', () => {
  const fractions = [1, .5, 0, -.5, -.99].map(error => thermostatFanFraction(true, error, 1));
  assert.equal(fractions[0], 1);
  assert.ok(fractions.every(f => f > .25 && f <= 1));
  assert.ok(fractions.slice(1).every((f, i) => f < fractions[i]));
  assert.equal(thermostatFanFraction(false, 10, 1), 0);
  assert.equal(thermostatFanFraction(true, 1, 0), 1);
});

const properties = new Properties(await Module());
test('new and explicitly enabled thermostats seed history at target, then retain the full restart band', () => {
  assert.equal(initialThermostatDemand(true, 0), true);
  assert.equal(initialThermostatDemand(true, -.01), false);
  assert.equal(initialThermostatDemand(false, 5), false);
  const c = defaultEngineConfig(1); c.rooms[0].initialTemperatureC = 21;
  const e = new HeatPumpEngine(properties, c);
  assert.deepEqual(e.checkpoint().thermostatCalls, [true]);
  c.rooms[0].enabled = false; e.updateConfig(c);
  assert.deepEqual(e.checkpoint().thermostatCalls, [false]);
  c.rooms[0].enabled = true;
  c.rooms[0].setpointC = e.snapshot().rooms[0].temperatureC + .001;
  e.updateConfig(c);
  assert.deepEqual(e.checkpoint().thermostatCalls, [true]);
  c.rooms[0].setpointC = 20.5; e.updateConfig(c);
  assert.deepEqual(e.checkpoint().thermostatCalls, [true], 'target edits preserve known history');
});

test('both modes retain independent inverter branches, modulate fans and stop when the final call stops', () => {
  for (const mode of ['heating', 'cooling']) {
    const c = defaultEngineConfig(2), sign = mode === 'heating' ? 1 : -1;
    c.mode = mode; c.outdoorTemperatureC = mode === 'heating' ? 7 : 32; c.outdoorRelativeHumidity = .35;
    c.rooms.forEach(room => { room.initialTemperatureC = mode === 'heating' ? 20 : 27; room.setpointC = room.initialTemperatureC + sign * 4; });
    const e = new HeatPumpEngine(properties, c);
    let o = e.step(.25); assert.ok(o.cycle); const initial = o;
    const fractions = [];
    for (const error of [.8, .3, .02, -.02, -.3, -.8]) {
      c.rooms[0].setpointC = o.rooms[0].temperatureC + sign * error;
      const before = o; const configured = e.updateConfig(c);
      assert.equal(configured.simulatedSeconds, before.simulatedSeconds);
      configured.rooms.forEach((room,i) => assert.ok(Math.abs(room.temperatureC - before.rooms[i].temperatureC) < 1e-8));
      o = e.step(.25);
      assert.equal(o.diagnostics.fault, null); assert.ok(o.cycle);
      assert.deepEqual(o.rooms.map(room => room.thermostatCalling), [true, true]);
      assert.deepEqual(o.rooms.map(room => room.active), [true, true]);
      assert.ok(o.rooms[0].fanPowerW > 0);
      assert.ok(Math.abs(o.rooms[0].fanPowerW - c.rooms[0].fanPowerW * o.rooms[0].fanSpeedFraction ** 3) < 1e-10);
      fractions.push(o.rooms[0].fanSpeedFraction);
      assert.ok(Math.abs(o.energy.residualJ) < .01); assert.ok(Math.abs(o.energy.waterResidualKg) < 1e-10);
      assert.ok(o.cycle.closureResidualW <= c.numerics.pressureToleranceW);
    }
    assert.ok(fractions.slice(1).every((fraction,i) => fraction < fractions[i]));
    c.rooms[0].setpointC = o.rooms[0].temperatureC - sign * 1.05; e.updateConfig(c); o = e.step(.25);
    assert.equal(o.diagnostics.fault, null); assert.ok(o.cycle);
    assert.deepEqual(o.rooms.map(room => room.thermostatCalling), [false, true]);
    assert.equal(o.rooms[0].fanPowerW, 0); assert.equal(o.cycle.branchMassFlowsKgs[0], 0);
    c.rooms[1].setpointC = o.rooms[1].temperatureC - sign * 1.05; e.updateConfig(c); o = e.step(.25);
    assert.equal(o.diagnostics.fault, null); assert.equal(o.state, 'idle'); assert.equal(o.cycle, null);
    assert.equal(o.electrical.compressorW, 0); assert.equal(o.electrical.indoorFansW, 0); assert.equal(o.electrical.outdoorFanW, 0);
    assert.deepEqual(o.rooms.map(room => room.thermostatCalling), [false, false]);
    assert.ok(o.simulatedSeconds - initial.simulatedSeconds < c.control.minOnSeconds, 'all-off stop overrides minimum-on');
    assert.ok(Math.abs(o.energy.residualJ) < .01); assert.ok(Math.abs(o.energy.waterResidualKg) < 1e-10);
  }
});

test('actual heating and cooling restart only beyond the one-degree margin and minimum-off dwell', () => {
  for (const mode of ['heating', 'cooling']) {
    const c = defaultEngineConfig(1), sign = mode === 'heating' ? 1 : -1;
    c.control.strategy = 'on-off';
    c.mode = mode; c.outdoorTemperatureC = mode === 'heating' ? 7 : 32; c.outdoorRelativeHumidity = .35;
    c.rooms[0].initialTemperatureC = mode === 'heating' ? 20 : 27;
    c.rooms[0].setpointC = c.rooms[0].initialTemperatureC + sign * 5;
    const e = new HeatPumpEngine(properties, c);
    let o = e.step(35);
    assert.equal(o.diagnostics.fault, null); assert.ok(o.cycle);
    c.rooms[0].setpointC = o.rooms[0].temperatureC - sign * 1.05;
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
