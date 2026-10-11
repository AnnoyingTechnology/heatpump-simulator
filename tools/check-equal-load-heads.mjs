// Controlled steady-state comparison; no room/controller transient or OEM claim.
// Compile the current engine into an isolated directory before running this tool.
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { writeFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import Module from '../public/vendor/coolprop-safe/adapter.js';
const directory = resolve(process.argv[2]);
const { Properties, defaultEngineConfig, solveCycle } = await import(pathToFileURL(resolve(directory, 'index.js')));
const { airExchange } = await import(pathToFileURL(resolve(directory, 'air.js')));
const properties = new Properties(await Module(), 'R32');
const pressure = 101325, indoorC = 21, outdoorC = 1, clean = .95;
const indoorW = properties.airW(indoorC, .45, pressure);
// Dry outdoor condition isolates exchanger area without frost or film storage.
const outdoorW = properties.airW(outdoorC, .02, pressure);
function compare(heads, heatW, pressureToleranceW = .01) {
  const config = defaultEngineConfig(3);
  Object.assign(config, { outdoorTemperatureC: outdoorC, outdoorRelativeHumidity: .02 });
  config.compressor.speedMinRps = 8;
  config.numerics.pressureToleranceW = pressureToleranceW;
  config.outdoor.cleanFraction = clean;
  config.rooms.forEach((r, i) => { r.enabled = i < heads; r.cleanFraction = clean; });
  const room = config.rooms[0], indoorFansW = heads * room.fanPowerW;
  const targetCoilW = heatW - indoorFansW;
  assert.ok(targetCoilW > 0);
  const indoorAir = metalC => airExchange(properties, indoorC, indoorW, metalC,
    room.airMassFlowKgs * clean, room.airConductanceWK * clean, pressure, 0, true, true);
  let low = indoorC, high = 100;
  for (let i = 0; i < 45; i++) {
    const middle = (low + high) / 2;
    if (heads * indoorAir(middle).signedHeatToAirW < targetCoilW) low = middle;
    else high = middle;
  }
  const indoorMetalC = (low + high) / 2;
  const evaluate = ([outdoorMetalC, speedRps]) => {
    assert.ok(outdoorMetalC < outdoorC && outdoorMetalC > -30);
    assert.ok(speedRps >= config.compressor.speedMinRps && speedRps <= config.compressor.speedMaxRps);
    const air = airExchange(properties, outdoorC, outdoorW, outdoorMetalC,
      config.outdoor.airMassFlowKgs * clean, config.outdoor.airConductanceWK * clean, pressure, 0, false, true);
    assert.equal(air.waterToSurfaceKgs, 0, 'frost-free boundary must really be dry');
    const cycle = solveCycle(properties, config, { mode: 'heating', outdoorMetalC,
      indoorMetalC: config.rooms.map((r, i) => i < heads ? indoorMetalC : indoorC),
      active: config.rooms.map(r => r.enabled), speedRps });
    return { cycle, air, residual: [cycle.condenserHeatW - targetCoilW,
      cycle.outdoorCoilHeatW + air.heatFromAirW - air.drainEnthalpyW] };
  };
  let x = [outdoorC - heatW / 650, Math.max(10, heatW / 130)], value;
  const norm = r => Math.max(...r.map(Math.abs));
  for (let iteration = 0; iteration < 35; iteration++) {
    value = evaluate(x);
    if (norm(value.residual) < .03) break;
    const columns = [0, 1].map(axis => {
      const trial = [...x]; trial[axis] += .01;
      return evaluate(trial).residual.map((r, i) => (r - value.residual[i]) / .01);
    });
    const [a, c] = columns[0], [b, d] = columns[1], [r, s] = value.residual;
    const determinant = a * d - b * c;
    assert.ok(Math.abs(determinant) > 1e-8);
    const change = [(-r * d + b * s) / determinant, (-a * s + c * r) / determinant];
    let accepted = false;
    for (let factor = 1; factor >= 1 / 1024; factor /= 2) {
      const next = x.map((v, i) => v + factor * change[i]);
      try {
        if (norm(evaluate(next).residual) < norm(value.residual)) { x = next; accepted = true; break; }
      } catch { /* Reject invalid trial, never replace the engine's result. */ }
    }
    assert.ok(accepted, 'no admissible steady-state Newton step');
  }
  value = evaluate(x);
  assert.ok(norm(value.residual) < .03, 'heat/metal equilibrium must close');
  assert.ok(value.cycle.closureResidualW <= pressureToleranceW);
  assert.ok(Math.abs(value.cycle.condenserHeatW - value.cycle.evaporatorHeatW - value.cycle.compressorWorkW) < .001);
  const electricalW = value.cycle.compressorElectricalW + indoorFansW + config.outdoor.fanPowerW + config.control.controlsW;
  const deliveredHeatW = heads * indoorAir(indoorMetalC).signedHeatToAirW + indoorFansW;
  assert.ok(Math.abs(deliveredHeatW - heatW) < .0001);
  return { heads, requestedHeatW: heatW, deliveredHeatW, electricalW, COP: deliveredHeatW / electricalW,
    compressorW: value.cycle.compressorElectricalW, indoorFansW, outdoorFanW: config.outdoor.fanPowerW,
    controlsW: config.control.controlsW, indoorMetalC, outdoorMetalC: x[0], speedRps: x[1],
    condensingC: value.cycle.condensingC, evaporatingC: value.cycle.evaporatingC,
    closureResidualW: value.cycle.closureResidualW, equilibriumResidualW: value.residual };
}
const cases = [];
for (const heatW of [1500, 3000, 4500]) {
  const two = compare(2, heatW), three = compare(3, heatW);
  // A tighter independent solve must reproduce the comparison.
  const refinedTwo = compare(2, heatW, .001), refinedThree = compare(3, heatW, .001);
  for (const [base, refined] of [[two, refinedTwo], [three, refinedThree]]) {
    assert.ok(Math.abs(base.electricalW - refined.electricalW) < .05);
    assert.ok(Math.abs(base.COP - refined.COP) < .001);
  }
  cases.push({ two, three, COPImprovementPercent: 100 * (three.COP / two.COP - 1),
    electricalSavingPercent: 100 * (1 - three.electricalW / two.electricalW), refinedTwo, refinedThree });
  console.log(JSON.stringify(cases.at(-1)));
}
const hashes = Object.fromEntries(['index.js', 'cycle.js', 'air.js', 'defaults.js', 'properties.js'].map(name =>
  [name, createHash('sha256').update(readFileSync(resolve(directory, name))).digest('hex')]));
const result = { checkedAt: new Date().toISOString(), sourceCommit: process.env.HEATPUMP_SOURCE_COMMIT ?? null, compiledEngineSHA256: hashes,
  model: 'Current Reference cycle and air-side equations, guarded production R32 HEOS',
  boundary: { indoorC, indoorRH: .45, outdoorC, outdoorRH: .02, cleanFraction: clean,
    fanFraction: 1, indoorUnits: 'Identical generic profiles; three connected, two or three active',
    limitations: 'Steady prescribed inlet temperatures; no thermostat, startup, frost/defrost, house transfer, charge or OEM efficiency map. Zero-length idealized Reference transport.' }, cases };
if (process.argv[3]) await writeFile(resolve(process.argv[3]), JSON.stringify(result, null, 2) + '\n');
properties.dispose();
