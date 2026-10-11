import test from 'node:test';
import assert from 'node:assert/strict';
import Module from './backend.mjs';
import { Properties, HeatPumpEngine, defaultEngineConfig } from './build/index.js';
import { interzoneEdgeTransfer, interzoneHeatPowers, interzoneTargetLosses, openingExchangeMaxStepSeconds } from './build/interzone.js';
import { roomDemand } from './build/demand.js';

const p = new Properties(await Module());
const near = (a, b, tolerance = 1e-8) => assert.ok(Math.abs(a - b) <= tolerance, `${a} differs from ${b}`);
function isolated(temperatures = [25, 15]) {
  const c = defaultEngineConfig(temperatures.length);
  c.outdoorTemperatureC = 20; c.outdoorRelativeHumidity = .1; c.outdoor.naturalAirConductanceWK = 0;
  c.rooms.forEach((r, i) => Object.assign(r, { enabled: false, initialTemperatureC: temperatures[i], initialRelativeHumidity: .1,
    envelopeWK: 0, ventilationACH: 0, airFabricWK: 0, naturalAirConductanceWK: 0, fanPowerW: 0 }));
  return c;
}
const floor = (patch = {}) => ({ roomA: 'room-1', roomB: 'room-2', conductanceWK: 13.8036809815951,
  openingExchange: { orientation: 'vertical', areaM2: 4, lowerRoomId: 'room-1', ...patch } });
function conservative(output) {
  assert.equal(output.diagnostics.fault, null);
  assert.ok(Math.abs(output.energy.residualJ) < .01, `energy residual ${output.energy.residualJ}`);
  assert.ok(Math.abs(output.energy.waterResidualKg) < 1e-10);
}

test('stable floor stratification suppresses buoyancy but retains bidirectional solid/background heat', () => {
  const f = floor({ backgroundConductanceWK: 5 });
  const stable = interzoneEdgeTransfer(f, 16, 21.5);
  assert.equal(stable.buoyancyState, 'stable'); assert.equal(stable.equivalentExchangeM3s, 0);
  near(stable.buoyancyHeatFromAToBW, 0);
  near(stable.solidHeatFromAToBW, f.conductanceWK * -5.5); assert.equal(stable.backgroundHeatFromAToBW, -27.5);
  near(stable.heatFromAToBW, (f.conductanceWK + 5) * -5.5);
  const neutral = interzoneEdgeTransfer(f, 20, 20);
  assert.equal(neutral.buoyancyState, 'neutral'); assert.equal(neutral.heatFromAToBW, 0);
});

test('unstable floor exchange follows the square-aperture reference law and reverses under fixed elevation', () => {
  const f = floor(), output = interzoneEdgeTransfer(f, 21.5, 18.5);
  const q = .055 * 4 ** 1.25 * Math.sqrt(9.81 * 3 / 293.15);
  near(output.equivalentExchangeM3s, q); near(output.buoyancyHeatFromAToBW, 1.2 * 1006 * q * 3);
  near(output.heatFromAToBW, output.solidHeatFromAToBW + output.buoyancyHeatFromAToBW);
  assert.equal(output.buoyancyState, 'unstable'); assert.ok(output.heatFromAToBW > 0);
  assert.equal(interzoneEdgeTransfer(f, 18.5, 21.5).buoyancyState, 'stable');
  assert.equal(interzoneEdgeTransfer(f, 18.5, 21.5).equivalentExchangeM3s, 0);
  const custom = floor({ floorCoefficient: .11 }); near(interzoneEdgeTransfer(custom, 21.5, 18.5).equivalentExchangeM3s, q * 2);
});

test('wall counterflow allows either thermal sign and uses aperture height independently of area', () => {
  const wall = floor({ orientation: 'horizontal', heightM: 2, lowerRoomId: undefined });
  const forward = interzoneEdgeTransfer(wall, 25, 15), backward = interzoneEdgeTransfer(wall, 15, 25);
  const q = .6 / 3 * 4 * Math.sqrt(9.81 * 2 * 10 / 293.15);
  near(forward.equivalentExchangeM3s, q); near(backward.equivalentExchangeM3s, q);
  assert.equal(forward.buoyancyState, 'wall-exchange'); assert.equal(backward.heatFromAToBW, -forward.heatFromAToBW);
  wall.openingExchange.heightM = 8; near(interzoneEdgeTransfer(wall, 25, 15).equivalentExchangeM3s, q * 2);
  wall.openingExchange.wallDischargeCoefficient = .3; near(interzoneEdgeTransfer(wall, 25, 15).equivalentExchangeM3s, q);
});

test('zero opening area keeps solid conduction and separately declared background in either direction', () => {
  const f = floor({ areaM2: 0 });
  for (const temperatures of [[25, 15], [15, 25]]) {
    const output = interzoneEdgeTransfer(f, ...temperatures);
    assert.equal(output.equivalentExchangeM3s, 0); near(output.heatFromAToBW, f.conductanceWK * (temperatures[0] - temperatures[1]));
  }
  f.openingExchange.backgroundConductanceWK = 5;
  near(interzoneEdgeTransfer(f, 15, 25).heatFromAToBW, -10 * (f.conductanceWK + 5));
});

test('A/B naming and room/link order cannot change physical orientation or conserved edge powers', () => {
  const f = floor(), original = interzoneEdgeTransfer(f, 25, 15), swapped = { ...f, roomA: f.roomB, roomB: f.roomA };
  const output = interzoneEdgeTransfer(swapped, 15, 25);
  assert.equal(output.equivalentExchangeM3s, original.equivalentExchangeM3s); assert.equal(output.buoyancyState, original.buoyancyState);
  assert.equal(output.heatFromAToBW, -original.heatFromAToBW);
  const c = isolated([25, 15, 20]); c.interzoneLinks = [f,
    { roomA: 'room-2', roomB: 'room-3', conductanceWK: 20, openingExchange: { orientation: 'horizontal', areaM2: 1, heightM: 2 } }];
  const a = new HeatPumpEngine(p, c).step(.25); conservative(a);
  const reversed = structuredClone(c); reversed.rooms.reverse(); reversed.interzoneLinks.reverse();
  const b = new HeatPumpEngine(p, reversed).step(.25); conservative(b);
  a.rooms.forEach(room => assert.deepEqual(b.rooms.find(other => other.id === room.id), room));
  near(a.rooms.reduce((sum, room) => sum + room.interzoneHeatW, 0), 0);
});

test('nonlinear feedforward substitutes own target, actual Off-neighbour and fixed lower node in both modes', () => {
  for (const mode of ['heating', 'cooling']) {
    const c = isolated([20, 18]); c.mode = mode; c.interzoneLinks = [floor()];
    c.rooms[0].enabled = true; c.rooms[0].setpointC = mode === 'heating' ? 22 : 15;
    const actual = [20, 18], loss = interzoneTargetLosses(c, actual)[0];
    const correct = interzoneEdgeTransfer(c.interzoneLinks[0], c.rooms[0].setpointC, actual[1]).heatFromAToBW;
    assert.equal(loss, correct);
    const frozenH = interzoneEdgeTransfer(c.interzoneLinks[0], ...actual).effectiveConductanceWK * (c.rooms[0].setpointC - actual[1]);
    assert.notEqual(loss, frozenH, 'target reevaluates stability/coefficient instead of freezing actual H');
    const states = new HeatPumpEngine(p, c).checkpoint().rooms;
    const demand = roomDemand(c, states, [c.rooms[0].setpointC, 18], [true, false], [0, 0], .25, false);
    near(demand.heatW[0], mode === 'heating' ? correct : -correct); assert.equal(demand.heatW[1], 0);
    c.rooms[1].setpointC = -500;
    assert.deepEqual(roomDemand(c, states, [c.rooms[0].setpointC, 18], [true, false], [0, 0], .25, false), demand);
  }
});

test('Off rooms exchange sensible energy in heating/cooling without changing humidity, external ledger or COP', () => {
  for (const mode of ['heating', 'cooling']) for (const temperatures of [[25, 15], [15, 25]]) {
    const c = isolated(temperatures); c.mode = mode; c.interzoneLinks = [floor()];
    const e = new HeatPumpEngine(p, c), before = e.checkpoint(), output = e.step(.5), after = e.checkpoint(); conservative(output);
    assert.ok(output.rooms[0].temperatureC < Math.max(...temperatures) && output.rooms[0].temperatureC > Math.min(...temperatures));
    output.rooms.forEach((room, i) => { assert.equal(room.active, false); assert.equal(room.humidityRatio, before.rooms[i].humidityRatio); });
    near(after.rooms.reduce((s, room) => s + room.airEnthalpyJ, 0), before.rooms.reduce((s, room) => s + room.airEnthalpyJ, 0), 1e-7);
    near(output.energy.boundaryEnergyJ, 0); assert.equal(output.energy.usefulServiceHeatJ, 0);
    assert.equal(output.heatingCOP, null); assert.equal(output.coolingCOP, null);
    assert.equal(output.interzoneTransfers[0].heatFromAToBW, interzoneEdgeTransfer(c.interzoneLinks[0], ...output.rooms.map(room => room.temperatureC)).heatFromAToBW);
  }
});

test('opening links conserve the coupled operating HVAC boundary in both service modes', () => {
  for (const mode of ['heating', 'cooling']) {
    const c = defaultEngineConfig(3); c.mode = mode;
    c.outdoorTemperatureC = mode === 'heating' ? 7 : 30; c.outdoorRelativeHumidity = .35;
    c.rooms.forEach((room, i) => Object.assign(room, { enabled: i === 0, initialRelativeHumidity: .2,
      initialTemperatureC: (mode === 'heating' ? [21, 16, 18] : [27, 23, 25])[i], setpointC: mode === 'heating' ? 22 : 24 }));
    c.interzoneLinks = [floor({ lowerRoomId: 'room-2' }),
      { roomA: 'room-1', roomB: 'room-3', conductanceWK: 13.8036809815951,
        openingExchange: { orientation: 'vertical', areaM2: 4, lowerRoomId: 'room-1' } }];
    const e = new HeatPumpEngine(p, c); let sawCycle = false;
    for (let i = 0; i < 16; i++) {
      const output = e.step(.5); conservative(output); sawCycle ||= !!output.cycle;
      near(output.rooms.reduce((sum, room) => sum + room.interzoneHeatW, 0), 0);
      assert.equal(output.rooms[1].active, false); assert.equal(output.rooms[2].active, false);
      assert.equal(output.interzoneTransfers[0].buoyancyState, 'stable');
      assert.equal(output.interzoneTransfers[1].buoyancyState, 'unstable');
      const cop = mode === 'heating' ? output.heatingCOP : output.coolingCOP;
      if (cop !== null) near(cop * output.electrical.totalW, Math.abs(output.signedRoomHeatW), 1e-7);
      else if (output.cycle) assert.ok((mode === 'heating' ? 1 : -1) * output.signedRoomHeatW <= 0,
        'wrong-sign stored-metal heat during startup cannot earn service COP');
    }
    assert.ok(sawCycle, `${mode} has a genuine closed refrigerant cycle`);
  }
});

test('shared adaptive timestep prevents large-aperture/small-room network overshoot without clipping heat', () => {
  const c = isolated([30, 10, 20]); c.rooms.forEach(room => { room.volumeM3 = .1; });
  c.interzoneLinks = [floor({ areaM2: 16 }),
    { roomA: 'room-2', roomB: 'room-3', conductanceWK: 200, openingExchange: { orientation: 'horizontal', areaM2: 8, heightM: 2 } },
    { roomA: 'room-1', roomB: 'room-3', conductanceWK: 100 }];
  const e = new HeatPumpEngine(p, c), before = e.checkpoint();
  const bound = openingExchangeMaxStepSeconds(c, [30, 10, 20], before.rooms.map(room => room.dryAirMassKg * 1000));
  assert.ok(bound < .01);
  const powers = interzoneHeatPowers(c, [30, 10, 20]); assert.ok(Math.abs(powers[0]) > 30000, 'large aperture is not silently capped');
  const originalAdvance = e.advance, acceptedSteps = [];
  e.advance = function(dt) { acceptedSteps.push(dt); return originalAdvance.call(this, dt); };
  for (let i = 0; i < 4; i++) {
    const output = e.step(.1); conservative(output);
    output.rooms.forEach(room => assert.ok(room.temperatureC >= 10 - 1e-7 && room.temperatureC <= 30 + 1e-7));
  }
  near(acceptedSteps.reduce((s, dt) => s + dt, 0), .4); assert.ok(acceptedSteps[0] <= bound + 1e-12);
  const final = e.snapshot(); assert.ok(Math.max(...final.rooms.map(r => r.temperatureC)) - Math.min(...final.rooms.map(r => r.temperatureC)) < 2);
});

test('opening trajectories converge under timestep refinement without breaking conservation', () => {
  const results = [];
  for (const maxStepSeconds of [.1, .05, .025]) {
    const c = isolated([26, 14]); c.rooms.forEach(room => { room.volumeM3 = 1; }); c.interzoneLinks = [floor({ areaM2: 4 })];
    c.numerics.maxStepSeconds = maxStepSeconds;
    const output = new HeatPumpEngine(p, c).step(1); conservative(output); results.push(output.rooms[0].temperatureC);
  }
  const coarse = Math.abs(results[0] - results[1]), fine = Math.abs(results[1] - results[2]);
  assert.ok(coarse > 0 && fine < coarse * .7, `${results}: refinement ${coarse} → ${fine}`);
});

test('invalid opening configurations reject atomically; accepted geometry edits retain storage/time/service history', () => {
  const c = isolated(), e = new HeatPumpEngine(p, c); e.step(.25); c.interzoneLinks = [floor()];
  const before = e.snapshot(), accepted = e.updateConfig(c); conservative(accepted);
  assert.equal(accepted.simulatedSeconds, before.simulatedSeconds); assert.deepEqual(accepted.energy, before.energy);
  accepted.rooms.forEach((room, i) => near(room.temperatureC, before.rooms[i].temperatureC));
  const snapshot = e.snapshot(), config = e.getConfig();
  for (const mutate of [
    x => { x.openingExchange = null; }, x => { x.openingExchange.orientation = 'diagonal'; },
    x => { x.openingExchange.areaM2 = -1; }, x => { x.openingExchange.areaM2 = Infinity; },
    x => { x.openingExchange.areaM2 = null; }, x => { x.openingExchange.lowerRoomId = 'missing'; },
    x => { delete x.openingExchange.lowerRoomId; }, x => { x.openingExchange.floorCoefficient = -1; },
    x => { x.openingExchange.floorCoefficient = null; }, x => { x.openingExchange.backgroundConductanceWK = NaN; },
    x => { x.openingExchange.wallDischargeCoefficient = -1; },
    x => { x.openingExchange.orientation = 'horizontal'; },
    x => { x.openingExchange.orientation = 'horizontal'; x.openingExchange.heightM = 0; },
    x => { x.openingExchange.areaM2 = 1e308; },
  ]) {
    const invalid = structuredClone(config); mutate(invalid.interzoneLinks[0]);
    assert.throws(() => e.updateConfig(invalid), /Opening|opening/); assert.deepEqual(e.snapshot(), snapshot); assert.deepEqual(e.getConfig(), config);
  }
});

test('failed opening candidate rolls back all accepted room storage, clocks and ledgers', () => {
  const c = isolated(); c.interzoneLinks = [floor()]; const e = new HeatPumpEngine(p, c);
  e.step(.25); const before = e.checkpoint(), original = p.airRH;
  let calls = 0; p.airRH = function(...args) { if (++calls === 2) throw new Error('injected opening room candidate failure'); return original.apply(this, args); };
  let failed; try { failed = e.step(.25); } finally { p.airRH = original; }
  assert.match(failed.diagnostics.fault, /opening room candidate/);
  const after = e.checkpoint(); assert.deepEqual(after.rooms, before.rooms); assert.deepEqual(after.ledgers, before.ledgers);
  assert.equal(after.time, before.time); assert.equal(after.boundaryWater, before.boundaryWater);
});

test('legacy constant-H output and timestep remain unchanged without the optional opening mode', () => {
  const c = isolated(); c.interzoneLinks = [{ roomA: 'room-1', roomB: 'room-2', conductanceWK: 70 }];
  assert.deepEqual(interzoneEdgeTransfer(c.interzoneLinks[0], 25, 15), { roomA: 'room-1', roomB: 'room-2', heatFromAToBW: 700 });
  assert.equal(openingExchangeMaxStepSeconds(c, [25, 15], [.01, .01]), Infinity);
  assert.deepEqual(interzoneTargetLosses(c, [25, 15]), c.rooms.map((room, i) => 70 * (room.setpointC - [15, 25][i])));
  const e = new HeatPumpEngine(p, c), advance = e.advance, steps = [];
  e.advance = function(dt) { steps.push(dt); return advance.call(this, dt); };
  conservative(e.step(1)); assert.deepEqual(steps, Array(1 / c.numerics.maxStepSeconds).fill(c.numerics.maxStepSeconds));
});
