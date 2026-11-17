// Charge-balanced engine scenario runner (not a test): node tests/engine/charge-balance-scenario.mjs <heating|cooling> <rooms> <percent|ref> <outdoorC> <seconds>
// Prints a minute-by-minute trace, regime counts, throughput and the final energy-ledger residual.
import Module from './backend.mjs';
import { createPropertyService } from './build/properties.js';
import { defaultEngineConfig } from './build/defaults.js';
import { HeatPumpEngine } from './build/engine.js';
const properties = createPropertyService(await Module());
const [mode, n, pct, outdoor, seconds] = [process.argv[2] ?? 'heating', +(process.argv[3] ?? 3), process.argv[4] === 'ref' ? null : +(process.argv[4] ?? 100), +(process.argv[5] ?? 3), +(process.argv[6] ?? 600)];
const config = defaultEngineConfig(n); config.mode = mode; config.outdoorTemperatureC = outdoor;
config.compressor.speedMinRps = 8;
for (const r of config.rooms) { r.initialTemperatureC = mode === 'heating' ? 17 : 28; r.setpointC = mode === 'heating' ? 21 : 24; }
const L = 7;
if (pct !== null) config.chargeBalance = { percentOfNominal: pct, valveMaxAreaM2: 1.5e-6, valveDischargeCoefficient: .65,
  geometry: { outdoorCoilVolumeM3: Math.PI*.006**2*40/4, accumulatorVolumeM3: .0006, rooms: config.rooms.map(() => ({ coilVolumeM3: Math.PI*.006**2*10/4, gasLineVolumeM3: Math.PI*.0079**2/4*L, smallLineVolumeM3: Math.PI*.00475**2/4*L })) } };
const t0 = performance.now(); const engine = new HeatPumpEngine(properties, config); const tInit = performance.now() - t0;
let last = null, regimes = {};
const t1 = performance.now();
for (let t = 0; t < seconds; t += 5) {
  engine.step(5); const o = engine.snapshot(); last = o;
  if (o.cycle?.charge) regimes[o.cycle.charge.regime] = (regimes[o.cycle.charge.regime] ?? 0) + 1;
  if (t % 60 === 0 || o.diagnostics.fault) console.log(t+5, o.state, 'rps', o.diagnostics.speedRps.toFixed(1), 'Tc', o.cycle?.condensingC.toFixed(2), 'Te', o.cycle?.evaporatingC.toFixed(2), 'SC', o.cycle?.charge?.condenserSubcoolK.toFixed(2), 'SH', o.cycle?.charge?.superheatK.toFixed(2), o.cycle?.charge?.regime, 'Q', o.signedRoomHeatW.toFixed(0), 'COP', (o.heatingCOP ?? o.coolingCOP)?.toFixed(2), 'room', o.rooms.map(r=>r.temperatureC.toFixed(2)).join('/'), o.diagnostics.envelopeProtection ?? '', o.diagnostics.fault ?? '');
  if (o.diagnostics.fault) break;
}
const wall = performance.now() - t1;
console.log('init', tInit.toFixed(0), 'ms; wall', wall.toFixed(0), 'ms for', seconds, 's; speed-up', (seconds*1000/wall).toFixed(1), 'x; regimes', JSON.stringify(regimes), 'nominal', JSON.stringify(last.chargeBalance), 'energy residual', last.energy.residualJ.toExponential(2));
