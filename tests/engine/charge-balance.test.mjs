import test from 'node:test';
import assert from 'node:assert/strict';
import Module from './backend.mjs';
import { createPropertyService } from './build/properties.js';
import { defaultEngineConfig } from './build/defaults.js';
import { solveCycle } from './build/cycle.js';
import { HeatPumpEngine } from './build/engine.js';
import { coilInventoryKg, storedDensity, circuitInventory } from './build/charge-balance.js';
import { ChargeProtectionError, NOMINAL_RATING_POINTS, nominalChargeKg } from './build/cycle-charge.js';
const module = await Module();
const properties = createPropertyService(module);

// Generic declared geometry: 40 m / 10 m of 6 mm ID coil tube, 0.6 L accumulator, 7 m lines.
const LINE_M = 7;
const geometryFor = n => ({ outdoorCoilVolumeM3: Math.PI * .006 ** 2 * 40 / 4, accumulatorVolumeM3: .0006,
  rooms: Array.from({ length: n }, () => ({ coilVolumeM3: Math.PI * .006 ** 2 * 10 / 4,
    gasLineVolumeM3: Math.PI * .0079 ** 2 / 4 * LINE_M, smallLineVolumeM3: Math.PI * .00475 ** 2 / 4 * LINE_M })) });
const VALVE = { valveMaxAreaM2: 1.5e-6, valveDischargeCoefficient: .65 };
const nominal = new Map();
const nominalFor = n => { if (!nominal.has(n)) nominal.set(n, nominalChargeKg(properties, defaultEngineConfig(n), geometryFor(n))); return nominal.get(n); };
const balanced = (n, mode, percent, indoorMetalC, outdoorMetalC, speedRps, extra = {}) => {
  const config = defaultEngineConfig(n); config.mode = mode;
  return solveCycle(properties, config, { mode, indoorMetalC: Array(n).fill(indoorMetalC), outdoorMetalC, active: Array(n).fill(true), speedRps,
    charge: { massKg: nominalFor(n).kg * percent / 100, geometry: geometryFor(n), ...VALVE }, ...extra });
};
const assertClosed = (cycle, label) => {
  assert.ok(Math.abs(cycle.charge.inventoryKg - cycle.charge.specifiedKg) < 1e-5, `${label}: inventory ${cycle.charge.inventoryKg} vs ${cycle.charge.specifiedKg}`);
  assert.ok(Math.abs(cycle.condenserHeatW - cycle.evaporatorHeatW - cycle.compressorWorkW) < 1e-6, `${label}: first-law closure`);
  assert.ok(cycle.closureResidualW <= .1, `${label}: residual ${cycle.closureResidualW}`);
  assert.ok(cycle.discharge.entropyJkgK >= cycle.suction.entropyJkgK);
};

test('Zivi two-phase coil holdup equals the slip-weighted mean along the conductance coordinate', () => {
  const p = properties.prop('P', 'T', 278.15, 'Q', 0);
  const sat = properties.saturation(p), span = sat.vaporH - sat.liquidH, metalC = sat.temperatureC + 8;
  const inletH = sat.liquidH + .2 * span, outletH = sat.vaporH, flow = .02, volume = 1e-3;
  // Choose UA so the two-phase path fills exactly the coil length; dz is then uniform in x.
  const ua = flow * (outletH - inletH) / (metalC - sat.temperatureC);
  const mass = coilInventoryKg(properties, p, inletH, outletH, flow, ua, metalC, volume);
  let mean = 0; const N = 4000;
  for (let k = 0; k < N; k++) mean += storedDensity(properties, properties.ph(p, inletH + (k + .5) / N * (outletH - inletH))) / N;
  assert.ok(Math.abs(mass / volume - mean) / mean < 1e-5, `${mass / volume} vs ${mean}`);
  // Slip holds far less than homogeneous liquid-rich density predicts, but more than vapour.
  const homogeneous = properties.ph(p, .5 * (inletH + outletH)).densityKgm3;
  assert.ok(mass / volume > homogeneous && mass / volume < properties.prop('D', 'P', p, 'Q', 0));
});

test('coil inventory is smooth when the outlet moves through sensible zones and pinches', () => {
  const p = 30e5, sat = properties.saturation(p), metalC = sat.temperatureC - 12, flow = .015, ua = 900, volume = 1e-3;
  const inletH = properties.pt(p, sat.temperatureC + 25).hJkg;
  const values = [];
  for (let k = 0; k <= 40; k++) {
    const outletT = metalC + 4 - k * .09;
    values.push(coilInventoryKg(properties, p, inletH, properties.pt(p, outletT).hJkg, flow, ua, metalC, volume));
  }
  const steps = values.slice(1).map((v, i) => v - values[i]);
  const second = steps.slice(1).map((s, i) => Math.abs(s - steps[i]));
  const typical = Math.max(...steps.map(Math.abs));
  assert.ok(steps.every(s => s >= -1e-9), 'colder outlet stores more liquid');
  assert.ok(Math.max(...second) < .05 * typical, `second difference ${Math.max(...second)} vs step ${typical}`);
});

test('nominal charge reproduces the fixed-subcooling Reference at its governing rating point', () => {
  for (const n of [1, 3]) {
    const nom = nominalFor(n);
    assert.equal(nom.kg, Math.max(nom.heatingKg, nom.coolingKg));
    assert.ok(nom.kg > .2 && nom.kg < 2, `${n} rooms nominal ${nom.kg}`);
    const mode = nom.heatingKg >= nom.coolingKg ? 'heating' : 'cooling', point = NOMINAL_RATING_POINTS[mode], config = defaultEngineConfig(n);
    const speed = .5 * (config.compressor.speedMinRps + config.compressor.speedMaxRps);
    const reference = solveCycle(properties, { ...config, mode }, { mode, indoorMetalC: Array(n).fill(point.indoorMetalC), outdoorMetalC: point.outdoorMetalC, active: Array(n).fill(true), speedRps: speed });
    const cycle = balanced(n, mode, 100, point.indoorMetalC, point.outdoorMetalC, speed);
    assertClosed(cycle, `${n} rooms nominal`);
    assert.equal(cycle.charge.regime, 'superheat');
    assert.ok(Math.abs(cycle.condensingC - reference.condensingC) < .05, `Tc ${cycle.condensingC} vs ${reference.condensingC}`);
    assert.ok(Math.abs(cycle.evaporatingC - reference.evaporatingC) < .05);
    assert.ok(Math.abs(cycle.charge.condenserSubcoolK - config.compressor.subcoolK) < .05);
  }
});

test('charge moves condensing pressure, subcooling and capacity monotonically in heating', () => {
  const cycles = [40, 70, 100, 140].map(pct => balanced(3, 'heating', pct, 35, 0, 40));
  cycles.forEach((c, i) => assertClosed(c, `heating ${i}`));
  for (let i = 1; i < cycles.length; i++) {
    assert.ok(cycles[i].condensingC > cycles[i - 1].condensingC);
    assert.ok(cycles[i].charge.condenserSubcoolK >= cycles[i - 1].charge.condenserSubcoolK);
  }
  // Severe undercharge leaves flash gas at the EEV inlet; overcharge backs liquid up the condenser.
  assert.ok(cycles[0].condenserOutlet.phase === 'two-phase' && cycles[0].charge.condenserSubcoolK === 0);
  assert.ok(cycles[3].charge.condenserSubcoolK > 5);
  assert.ok(cycles[0].condenserHeatW < cycles[2].condenserHeatW);
});

test('regimes: valve limit when undercharged, accumulator at the discharge ceiling, minimum lift in defrost', () => {
  // One branch at high speed: the fully open EEV starves the evaporator. Superheat and
  // discharge temperature rise past the EEV ceiling; only compressor protection remains.
  const starved = balanced(1, 'cooling', 40, 12, 42, 75);
  assertClosed(starved, 'starved cooling');
  assert.equal(starved.charge.regime, 'valve-limit');
  assert.ok(Math.abs(Math.max(...starved.charge.valveOpenings) - 1) < 1e-5 && starved.charge.superheatK > 10);
  assert.ok(starved.discharge.temperatureC > 125 && starved.condenserOutlet.phase === 'two-phase');

  const parked = balanced(1, 'heating', 170, 35, 0, 40);
  assertClosed(parked, 'one-room overcharge');
  // Excess charge reaches the condensing ceiling first; the EEV parks it in the accumulator.
  assert.equal(parked.charge.regime, 'condensing-limit');
  assert.ok(Math.abs(parked.condensingC - 58) < 1e-9 && parked.charge.accumulatorLiquidKg > 0 && parked.charge.superheatK === 0);

  const defrost = balanced(3, 'heating', 100, 18, 0, 35, { mode: 'cooling', defrost: true });
  assertClosed(defrost, 'defrost');
  assert.equal(defrost.charge.regime, 'minimum-lift');
  assert.ok(defrost.outdoorCoilHeatW > 0 && defrost.condensingC - defrost.evaporatingC > 7.99);
});

test('a multi-split charge with most branches stopped is held by the EEV ceilings', () => {
  const n = 3, config = defaultEngineConfig(n); config.mode = 'heating';
  const cycle = solveCycle(properties, config, { mode: 'heating', indoorMetalC: [18, 21, 18], outdoorMetalC: 1, active: [false, true, false], speedRps: 18,
    charge: { massKg: nominalFor(n).kg, geometry: geometryFor(n), ...VALVE } });
  assertClosed(cycle, 'one of three branches');
  // Condensing would exceed the ceiling, but discharge temperature binds first: the EEV opens
  // further than the condensing limit needs, which also holds condensing below 58 °C.
  assert.equal(cycle.charge.regime, 'discharge-limit');
  assert.ok(cycle.condensingC <= 58 && Math.abs(cycle.discharge.temperatureC - (config.compressor.maxDischargeC - 20)) < .01);
});

test('operating points on the saturated-liquid kink converge (nested bracketing fallback)', () => {
  // A nominal R134a state whose condenser outlet sits at x≈0.001, where Zivi holdup changes slope.
  const fluid = createPropertyService(module, 'R134a'), n = 2, config = defaultEngineConfig(n); config.fluid = 'R134a'; config.mode = 'heating';
  const geometry = geometryFor(n), nom = nominalChargeKg(fluid, config, geometry).kg;
  const cycle = solveCycle(fluid, config, { mode: 'heating', indoorMetalC: [18.41, 18.41], outdoorMetalC: 1.03, active: [true, true], speedRps: 56.5,
    charge: { massKg: nom, geometry, ...VALVE } });
  assertClosed(cycle, 'R134a kink');
  assert.ok(cycle.charge.condenserSubcoolK < 1 && (cycle.charge.condenserOutletQuality ?? 0) < .01);
});

test('charge outside the operable band is a supervisor protection, not a numerical failure', () => {
  assert.throws(() => balanced(3, 'cooling', 280, 12, 42, 40), e => e instanceof ChargeProtectionError && e.protection === 'high-side flooding');
  // Below the condensation-onset inventory no liquid reaches the EEVs at all.
  assert.throws(() => balanced(1, 'cooling', 20, 12, 42, 40), e => e instanceof ChargeProtectionError && e.protection === 'refrigerant shortage');
  const config = defaultEngineConfig(1);
  const lowest = balanced(1, 'cooling', 33, 12, 42, .5 * (config.compressor.speedMinRps + config.compressor.speedMaxRps));
  assert.ok(lowest.condenserOutlet.qualityMass > .5, 'just above onset the EEV inlet is mostly vapour');
});

test('inventory requires idealized lines and a matching geometry', () => {
  const config = defaultEngineConfig(2); config.mode = 'heating';
  const input = { mode: 'heating', indoorMetalC: [35, 35], outdoorMetalC: 0, active: [true, true], speedRps: 40 };
  const cycle = solveCycle(properties, config, input);
  assert.throws(() => circuitInventory(properties, config, geometryFor(3), cycle, input), /geometry/);
  config.rooms[0].pipe.lengthM = 5;
  assert.throws(() => circuitInventory(properties, config, geometryFor(2), cycle, input), /idealized/);
});

test('engine validates and runs the charge-balanced closure with closed energy ledgers', () => {
  const make = (n, mode, percent) => {
    const config = defaultEngineConfig(n); config.mode = mode; config.outdoorTemperatureC = mode === 'heating' ? 3 : 35;
    for (const r of config.rooms) { r.initialTemperatureC = mode === 'heating' ? 17 : 28; r.setpointC = mode === 'heating' ? 21 : 24; }
    config.chargeBalance = { percentOfNominal: percent, geometry: geometryFor(n), ...VALVE };
    return config;
  };
  assert.throws(() => new HeatPumpEngine(properties, make(1, 'cooling', 5)), /10–300%/);
  const lined = make(1, 'cooling', 100); lined.rooms[0].pipe.lengthM = 4;
  assert.throws(() => new HeatPumpEngine(properties, lined), /idealized/);
  const mismatched = make(2, 'cooling', 100); mismatched.chargeBalance.geometry = geometryFor(1);
  assert.throws(() => new HeatPumpEngine(properties, mismatched), /geometry/);

  const engine = new HeatPumpEngine(properties, make(1, 'cooling', 70));
  for (let t = 0; t < 240; t += 5) engine.step(5);
  const out = engine.snapshot();
  assert.equal(out.diagnostics.fault ?? null, null);
  assert.equal(out.state, 'running');
  assert.ok(out.cycle.charge && out.chargeBalance.percentOfNominal === 70);
  assert.ok(Math.abs(out.chargeBalance.specifiedKg - .7 * out.chargeBalance.nominalKg) < 1e-12);
  assert.ok(out.signedRoomHeatW < 0);
  assert.ok(Math.abs(out.energy.residualJ) < 1e-4, `energy residual ${out.energy.residualJ}`);

  // A live charge edit takes effect at the next step without reset (instantaneous recharge):
  // the added mass backs liquid into the outdoor condenser and subcools the EEV inlet.
  assert.equal(out.cycle.condenserOutlet.phase, 'two-phase');
  engine.updateConfig(make(1, 'cooling', 110));
  engine.step(5);
  const after = engine.snapshot();
  assert.ok(after.cycle.charge.condenserSubcoolK > 1, `subcooling ${after.cycle.charge.condenserSubcoolK}`);
  assert.ok(after.cycle.charge.distribution.outdoorCoilKg > out.cycle.charge.distribution.outdoorCoilKg + .05);
  assert.ok(Math.abs(after.chargeBalance.specifiedKg - 1.1 * after.chargeBalance.nominalKg) < 1e-12);
});

test('a flooded start is a held protection retried on the minimum off time; lowering the charge restarts at once', () => {
  const config = defaultEngineConfig(3); config.mode = 'heating'; config.outdoorTemperatureC = 1;
  config.rooms.forEach((r, i) => { r.initialTemperatureC = 19; r.setpointC = 21.5; r.enabled = i === 1; });
  config.chargeBalance = { percentOfNominal: 180, geometry: geometryFor(3), ...VALVE };
  const engine = new HeatPumpEngine(properties, config);
  // Count steps that re-solve the circuit (thousands of EOS calls) against passive steps (tens).
  let calls = 0, solves = 0; const evaluate = properties.prop;
  properties.prop = (...args) => { calls++; return evaluate.apply(properties, args); };
  try { for (let k = 0; k < 240; k++) { calls = 0; engine.step(.25); if (calls > 1000) solves++; } }
  finally { properties.prop = evaluate; }
  const held = engine.snapshot();
  assert.equal(held.diagnostics.fault ?? null, null);
  assert.equal(held.diagnostics.speedRps, 0);
  assert.equal(held.diagnostics.envelopeProtection, 'condensing temperature');
  assert.ok(held.diagnostics.warnings.some(w => /condensing ceiling with a full accumulator/.test(w)), held.diagnostics.warnings.join(' | '));
  // 60 s of hold with a 30 s minimum off time: the stopped circuit is re-solved only on retries.
  assert.ok(solves >= 1 && solves <= 3, `${solves} re-solving steps in 240`);
  config.chargeBalance = { ...config.chargeBalance, percentOfNominal: 100 };
  engine.updateConfig(config);
  for (let k = 0; k < 8; k++) engine.step(.25);
  const restarted = engine.snapshot();
  assert.equal(restarted.diagnostics.envelopeProtection ?? null, null);
  assert.ok(restarted.diagnostics.speedRps > 0 && restarted.cycle?.charge, 'compressor restarts on the lowered charge');
});
