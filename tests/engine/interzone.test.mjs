import test from 'node:test';
import assert from 'node:assert/strict';
import Module from './backend.mjs';
import { Properties, HeatPumpEngine, defaultEngineConfig } from './build/index.js';
import { roomDemand } from './build/demand.js';

const p = new Properties(await Module());
function isolated(temperatures = [25, 15]) {
  const c = defaultEngineConfig(temperatures.length);
  c.outdoorTemperatureC = 20; c.outdoorRelativeHumidity = .2; c.outdoor.naturalAirConductanceWK = 0;
  c.rooms.forEach((r, i) => Object.assign(r, { enabled: false, initialTemperatureC: temperatures[i], initialRelativeHumidity: .2,
    envelopeWK: 0, ventilationACH: 0, airFabricWK: 0, naturalAirConductanceWK: 0, fanPowerW: 0 }));
  return c;
}
function conservative(o) {
  assert.equal(o.diagnostics.fault, null);
  assert.ok(Math.abs(o.energy.residualJ) < .01, `energy residual ${o.energy.residualJ} J`);
  assert.ok(Math.abs(o.energy.waterResidualKg) < 1e-10);
}
const sum = values => values.reduce((a, b) => a + b, 0);

test('interzone heat warms an Off room and conserves total energy and water in both directions/modes', () => {
  for (const mode of ['heating', 'cooling']) for (const temperatures of [[25, 15], [15, 25]]) {
    const c = isolated(temperatures); c.mode = mode;
    c.interzoneLinks = [{ roomA: c.rooms[0].id, roomB: c.rooms[1].id, conductanceWK: 70 }];
    const e = new HeatPumpEngine(p, c), before = e.checkpoint(), o = e.step(.25), after = e.checkpoint();
    conservative(o);
    const expected = 70 * (temperatures[1] - temperatures[0]);
    assert.ok(Math.abs(o.rooms[0].interzoneHeatW - expected) < 1e-6);
    assert.equal(o.rooms[1].interzoneHeatW, -o.rooms[0].interzoneHeatW);
    assert.equal(sum(o.rooms.map(r => r.interzoneHeatW)), 0);
    assert.equal(o.interzoneTransfers.length, 1);
    assert.deepEqual(o.interzoneTransfers[0], { roomA: c.rooms[0].id, roomB: c.rooms[1].id,
      heatFromAToBW: 70 * (o.rooms[0].temperatureC - o.rooms[1].temperatureC) });
    assert.ok(Math.abs(o.interzoneTransfers[0].heatFromAToBW + o.rooms[0].interzoneHeatW) > 1e-4,
      'display transfer uses accepted post-step temperatures, not the previous substep flux');
    o.rooms.forEach((r, i) => {
      assert.equal(r.active, false); assert.equal(r.fanPowerW, 0); assert.equal(r.airOutletC, null);
      assert.equal(r.humidityRatio, before.rooms[i].humidityRatio);
      assert.equal(r.signedRoomHeatW, 0);
      assert.ok(temperatures[i] < 20 ? r.temperatureC > temperatures[i] : r.temperatureC < temperatures[i]);
    });
    assert.ok(Math.abs(sum(after.rooms.map(r => r.airEnthalpyJ)) - sum(before.rooms.map(r => r.airEnthalpyJ))) < 1e-7);
    assert.ok(Math.abs(o.energy.boundaryEnergyJ) < 1e-9);
    assert.equal(o.heatingCOP, null); assert.equal(o.coolingCOP, null);
  }
});

test('multiple links use one pre-step state and remain independent of room/link ordering', () => {
  const c = isolated([25, 20, 15]);
  c.interzoneLinks = [{ roomA: 'room-1', roomB: 'room-2', conductanceWK: 100 },
    { roomA: 'room-2', roomB: 'room-3', conductanceWK: 100 }, { roomA: 'room-1', roomB: 'room-3', conductanceWK: 40 }];
  const first = new HeatPumpEngine(p, c).step(.25); conservative(first);
  assert.ok(Math.abs(first.rooms[1].interzoneHeatW) < 1e-6);
  assert.ok(Math.abs(sum(first.rooms.map(r => r.interzoneHeatW))) < 1e-9);
  const reverse = structuredClone(c); reverse.rooms.reverse(); reverse.interzoneLinks.reverse();
  const second = new HeatPumpEngine(p, reverse).step(.25); conservative(second);
  first.rooms.forEach(r => assert.deepEqual(second.rooms.find(other => other.id === r.id), r));
});

test('transfer diagnostics retain canonical H until configuration acceptance and snapshots are independent', () => {
  const c = isolated([25, 15]);
  c.interzoneLinks = [{ roomA: 'room-1', roomB: 'room-2', conductanceWK: 70 }];
  const e = new HeatPumpEngine(p, c), before = e.step(.25); conservative(before);
  c.interzoneLinks[0].conductanceWK = 140;
  assert.deepEqual(e.snapshot().interzoneTransfers, before.interzoneTransfers,
    'editing the caller config cannot overwrite retained engine transfers');
  const accepted = e.updateConfig(c); conservative(accepted);
  const temperatureDifference = accepted.rooms[0].temperatureC - accepted.rooms[1].temperatureC;
  assert.equal(accepted.interzoneTransfers[0].heatFromAToBW, 140 * temperatureDifference);
  assert.equal(accepted.simulatedSeconds, before.simulatedSeconds);
  assert.deepEqual(e.snapshot().energy, before.energy);
  accepted.interzoneTransfers[0].heatFromAToBW = 0;
  assert.equal(e.snapshot().interzoneTransfers[0].heatFromAToBW, 140 * temperatureDifference);
  const unlinked = defaultEngineConfig(1);
  assert.deepEqual(new HeatPumpEngine(p, unlinked).snapshot().interzoneTransfers, []);
});

test('prescribed gains supply external heat without inflating HVAC power, electricity or COP', () => {
  const c = isolated([20]); c.rooms[0].internalGainW = 500;
  const e = new HeatPumpEngine(p, c), before = e.checkpoint(), o = e.step(2), after = e.checkpoint(); conservative(o);
  assert.ok(Math.abs(after.rooms[0].airEnthalpyJ - before.rooms[0].airEnthalpyJ - 1000) < 1e-7);
  assert.ok(Math.abs(o.energy.storedEnergyChangeJ - 1000) < 1e-6);
  assert.equal(o.energy.boundaryEnergyJ, 1000);
  assert.equal(o.rooms[0].internalGainW, 500); assert.equal(o.rooms[0].signedRoomHeatW, 0);
  assert.equal(o.signedRoomHeatW, 0); assert.equal(o.electrical.compressorW, 0);
  assert.equal(o.electrical.totalW, c.control.controlsW); assert.equal(o.heatingCOP, null);
});

test('running heating/cooling with linked Off rooms and gains conserves the combined refrigerant/air boundary', () => {
  for (const mode of ['heating', 'cooling']) {
    const c = defaultEngineConfig(3); c.mode = mode;
    c.outdoorTemperatureC = mode === 'heating' ? 7 : 30; c.outdoorRelativeHumidity = .35;
    c.rooms.forEach((room, i) => Object.assign(room, { enabled: i !== 0, initialRelativeHumidity: .3,
      initialTemperatureC: (mode === 'heating' ? [18, 21, 24] : [25, 27, 24])[i],
      setpointC: mode === 'heating' ? 22 : 24, internalGainW: [300, 100, 50][i] }));
    c.interzoneLinks = [{ roomA: 'room-1', roomB: 'room-2', conductanceWK: 80 },
      { roomA: 'room-2', roomB: 'room-3', conductanceWK: 50 }];
    const e = new HeatPumpEngine(p, c); let output;
    for (let second = 0; second < 20; second++) {
      output = e.step(1); conservative(output);
      assert.ok(Math.abs(sum(output.rooms.map(room => room.interzoneHeatW))) < 1e-9);
    }
    assert.ok(output.cycle); assert.equal(output.rooms[0].active, false);
    const hvacHeat = sum(output.rooms.map(room => room.signedRoomHeatW)), cop = mode === 'heating' ? output.heatingCOP : output.coolingCOP;
    assert.ok(cop > 0);
    assert.ok(Math.abs(cop * output.electrical.totalW - Math.abs(hvacHeat)) < 1e-7);
  }
});

test('inverter target feedforward uses actual Off-neighbour temperature and treats gains in each mode', () => {
  for (const mode of ['heating', 'cooling']) {
    const c = isolated([21, mode === 'heating' ? 18 : 28]); c.mode = mode;
    c.outdoorTemperatureC = mode === 'heating' ? 3 : 32;
    c.rooms[0].enabled = true; c.rooms[0].setpointC = mode === 'heating' ? 21 : 24; c.rooms[0].envelopeWK = 100;
    c.rooms[0].internalGainW = 300;
    c.interzoneLinks = [{ roomA: 'room-1', roomB: 'room-2', conductanceWK: 60 }];
    const states = new HeatPumpEngine(p, c).checkpoint().rooms;
    const temperatures = [c.rooms[0].setpointC, c.rooms[1].initialTemperatureC], sign = mode === 'heating' ? 1 : -1;
    const demand = roomDemand(c, states, temperatures, [true, false], [0, 0], .25, false);
    const expected = sign * (100 * (temperatures[0] - c.outdoorTemperatureC) + 60 * (temperatures[0] - temperatures[1]) - 300);
    assert.equal(demand.heatW[0], expected); assert.equal(demand.heatW[1], 0); assert.equal(demand.active[1], false);
    c.rooms[1].setpointC = -500;
    assert.deepEqual(roomDemand(c, states, temperatures, [true, false], [0, 0], .25, false), demand);
  }
});

test('link/gain edits preserve inventories and time; invalid topology/gains leave the accepted engine untouched', () => {
  const c = isolated([25, 15]), e = new HeatPumpEngine(p, c), before = e.step(1); conservative(before);
  c.interzoneLinks = [{ roomA: 'room-1', roomB: 'room-2', conductanceWK: 50 }]; c.rooms[1].internalGainW = 120;
  const edited = e.updateConfig(c); conservative(edited);
  assert.equal(edited.simulatedSeconds, before.simulatedSeconds); assert.deepEqual(edited.energy, before.energy);
  edited.rooms.forEach((r, i) => {
    for (const field of ['temperatureC', 'humidityRatio', 'fabricTemperatureC', 'metalTemperatureC']) assert.ok(Math.abs(r[field] - before.rooms[i][field]) < 1e-8, `${field} retained`);
  });
  const accepted = e.snapshot(), acceptedConfig = e.getConfig();
  for (const change of [
    x => { x.interzoneLinks[0].roomB = 'missing'; },
    x => { x.interzoneLinks[0].roomB = 'room-1'; },
    x => { x.interzoneLinks.push({ roomA: 'room-2', roomB: 'room-1', conductanceWK: 10 }); },
    x => { x.interzoneLinks[0].conductanceWK = -1; },
    x => { x.interzoneLinks[0].conductanceWK = NaN; },
    x => { x.interzoneLinks = null; },
    x => { x.rooms[0].internalGainW = -1; },
    x => { x.rooms[0].internalGainW = Infinity; },
    x => { x.rooms[0].internalGainW = null; },
    x => { x.rooms.pop(); },
  ]) {
    const invalid = structuredClone(c); change(invalid);
    assert.throws(() => e.updateConfig(invalid), /Interzone|internal gain/);
    assert.deepEqual(e.snapshot(), accepted); assert.deepEqual(e.getConfig(), acceptedConfig);
  }
  const pruned = structuredClone(c); pruned.rooms.pop(); pruned.interzoneLinks = [];
  const removed = e.updateConfig(pruned); conservative(removed); assert.equal(removed.rooms.length, 1);
});

test('failed candidate with heat links/gains rolls back all physical storage and boundary ledgers', () => {
  const c = isolated([25, 15]); c.rooms[1].internalGainW = 500;
  c.interzoneLinks = [{ roomA: 'room-1', roomB: 'room-2', conductanceWK: 70 }];
  const e = new HeatPumpEngine(p, c); e.step(1); const before = e.checkpoint(), original = p.airRH;
  let calls = 0; p.airRH = function (...args) { if (++calls === 2) throw new Error('injected second-room candidate failure'); return original.apply(this, args); };
  let failed; try { failed = e.step(.25); } finally { p.airRH = original; }
  assert.match(failed.diagnostics.fault, /second-room candidate/);
  const after = e.checkpoint();
  assert.deepEqual(after.rooms, before.rooms); assert.deepEqual(after.ledgers, before.ledgers);
  assert.equal(after.time, before.time); assert.equal(after.outdoorWaterKg, before.outdoorWaterKg);
  assert.equal(after.outdoorEnergyJ, before.outdoorEnergyJ); assert.equal(after.boundaryWater, before.boundaryWater);
  assert.ok(Math.abs(failed.energy.residualJ) < .01);
});

test('sensible-link dynamics converge under timestep refinement while conserving energy', () => {
  const temperatures = [.25, .125, .0625].map(dt => {
    const c = isolated([25, 15]); c.numerics.maxStepSeconds = dt;
    c.interzoneLinks = [{ roomA: 'room-1', roomB: 'room-2', conductanceWK: 500 }];
    const o = new HeatPumpEngine(p, c).step(20); conservative(o); return o.rooms[0].temperatureC;
  });
  const coarseError = Math.abs(temperatures[0] - temperatures[2]), fineError = Math.abs(temperatures[1] - temperatures[2]);
  assert.ok(fineError < .5 * coarseError); assert.ok(fineError < .002);
});
