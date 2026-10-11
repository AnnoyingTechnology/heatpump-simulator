import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import createBackend from '../../public/vendor/coolprop-safe/adapter.js';
import { Properties, HeatPumpEngine, defaultEngineConfig } from './build/index.js';
import { roomDemand } from './build/demand.js';

// A declared house-level hypothesis, not an OEM fit or an observation matching
// exercise. Keep refrigerant, compressor, coil/fan and release limits generic.
const c = defaultEngineConfig(3);
c.indoorPortCapacity = 3; c.outdoorTemperatureC = 1; c.outdoorRelativeHumidity = .35;
const roles = ['attic', 'first-floor', 'ground-floor'];
const hypotheses = [
  { volumeM3: 84, initialTemperatureC: 18.3, setpointC: 21, enabled: false, envelopeWK: 15, internalGainW: 0 },
  { volumeM3: 155, initialTemperatureC: 21.5, setpointC: 21.5, enabled: true, envelopeWK: 25, internalGainW: 0 },
  { volumeM3: 100, initialTemperatureC: 18, setpointC: 17, enabled: true, envelopeWK: 45, internalGainW: 200 },
];
c.rooms.forEach((room, i) => Object.assign(room, hypotheses[i], { ventilationACH: .25 }));
c.interzoneLinks = [
  { roomA: c.rooms[1].id, roomB: c.rooms[2].id, conductanceWK: 200 },
  { roomA: c.rooms[1].id, roomB: c.rooms[0].id, conductanceWK: 120 },
];
const hash = path => createHash('sha256').update(readFileSync(new URL(path, import.meta.url))).digest('hex');
const sourceHashes = Object.fromEntries(readdirSync(new URL('../../src/engine/', import.meta.url)).filter(name => name.endsWith('.ts'))
  .map(name => [`src/engine/${name}`, hash(`../../src/engine/${name}`)]));
const compiledHashes = Object.fromEntries(readdirSync(new URL('./build/', import.meta.url)).filter(name => name.endsWith('.js'))
  .map(name => [`tests/engine/build/${name}`, hash(`./build/${name}`)]));
const backendHashes = Object.fromEntries(['adapter.js', 'coolprop.js', 'coolprop.wasm'].map(name =>
  [`public/vendor/coolprop-safe/${name}`, hash(`../../public/vendor/coolprop-safe/${name}`)]));
const benchmarkScriptSha256 = hash('./owner-house-benchmark.mjs');
const p = new Properties(await createBackend()), engine = new HeatPumpEngine(p, c);
const dt = .25, durationSeconds = 1200, windowSeconds = 300;
const startMs = performance.now(), checkpoints = [], stateSeconds = {}, protectionSeconds = {}, activeSeconds = [0, 0, 0];
let output = engine.snapshot(), windowStart = null, windowEnd = null, maxEnergyResidualJ = 0, maxWaterResidualKg = 0;
let cyclesStarted = 0, previousCompressorRunning = false, windowCycleStarts = 0, speedIntegral = 0, windowCompressorSeconds = 0;
let minimumWindowSpeed = Infinity, maximumWindowSpeed = 0;
for (let i = 0; i < durationSeconds / dt; i++) {
  const before = output;
  output = engine.step(dt);
  if (output.diagnostics.fault) break;
  maxEnergyResidualJ = Math.max(maxEnergyResidualJ, Math.abs(output.energy.residualJ));
  maxWaterResidualKg = Math.max(maxWaterResidualKg, Math.abs(output.energy.waterResidualKg));
  const running = output.electrical.compressorW > 0;
  if (running && !previousCompressorRunning) cyclesStarted++;
  if (output.simulatedSeconds > durationSeconds - windowSeconds) {
    windowStart ??= before;
    stateSeconds[output.state] = (stateSeconds[output.state] ?? 0) + dt;
    const protection = output.diagnostics.envelopeProtection ?? 'none';
    protectionSeconds[protection] = (protectionSeconds[protection] ?? 0) + dt;
    output.rooms.forEach((room, r) => { if (room.active) activeSeconds[r] += dt; });
    if (running) {
      windowCompressorSeconds += dt; speedIntegral += output.diagnostics.speedRps * dt;
      minimumWindowSpeed = Math.min(minimumWindowSpeed, output.diagnostics.speedRps);
      maximumWindowSpeed = Math.max(maximumWindowSpeed, output.diagnostics.speedRps);
      if (!previousCompressorRunning) windowCycleStarts++;
    }
    windowEnd = output;
  }
  previousCompressorRunning = running;
  if (output.simulatedSeconds % 300 < 1e-9) {
    const state = engine.checkpoint(), control = roomDemand(c, state.rooms, output.rooms.map(room => room.temperatureC),
      state.active, state.demandIntegralW, dt, false);
    const sample = { simulatedSeconds: output.simulatedSeconds, temperaturesC: output.rooms.map(room => room.temperatureC),
      targetErrorsC: output.rooms.map(room => room.temperatureC - room.setpointC), requestedRoomHeatW: control.heatW,
      actualRoomActive: output.rooms.map(room => room.active), inverterCyclingLatch: state.inverterCycling,
      inputW: output.electrical.totalW, hvacHeatW: output.signedRoomHeatW, speedRps: output.diagnostics.speedRps, state: output.state };
    checkpoints.push(sample); console.log(JSON.stringify(sample));
  }
}
const acceptedWindowSeconds = windowStart && windowEnd ? windowEnd.simulatedSeconds - windowStart.simulatedSeconds : 0;
const window = acceptedWindowSeconds > 0 ? {
  startSeconds: windowStart.simulatedSeconds, endSeconds: windowEnd.simulatedSeconds, seconds: acceptedWindowSeconds,
  meanElectricalW: (windowEnd.energy.electricityJ - windowStart.energy.electricityJ) / acceptedWindowSeconds,
  meanHvacSignedRoomHeatW: (windowEnd.energy.signedRoomHeatJ - windowStart.energy.signedRoomHeatJ) / acceptedWindowSeconds,
  energyWeightedHeatingCOP: (windowEnd.energy.signedRoomHeatJ - windowStart.energy.signedRoomHeatJ) / (windowEnd.energy.electricityJ - windowStart.energy.electricityJ),
  stateSeconds, protectionSeconds, compressorRunningSeconds: windowCompressorSeconds, compressorStarts: windowCycleStarts,
  runningMeanSpeedRps: windowCompressorSeconds ? speedIntegral / windowCompressorSeconds : null,
  runningMinimumSpeedRps: minimumWindowSpeed === Infinity ? null : minimumWindowSpeed, runningMaximumSpeedRps: maximumWindowSpeed,
  roomActiveSeconds: Object.fromEntries(roles.map((role, i) => [role, activeSeconds[i]])),
  temperatureDriftCPerHour: Object.fromEntries(roles.map((role, i) => [role,
    (windowEnd.rooms[i].temperatureC - windowStart.rooms[i].temperatureC) / acceptedWindowSeconds * 3600])),
} : null;
const receipt = {
  recordedAt: new Date().toISOString(), method: 'Exact guarded HEOS R32 reference engine; 0.25 s accepted steps; no field-line length or inventory/charge model',
  sourceHashes, compiledHashes, backendHashes, benchmarkScriptSha256, config: c, roomRoles: Object.fromEntries(c.rooms.map((room, i) => [room.id, roles[i]])),
  uncertainties: [
    'Envelope and interzone conductances and the 200 W ground-floor gains are declared hypotheses, not fitted or measured coefficients.',
    'Outdoor relative humidity 35% is a placeholder; the owner winter measurement does not establish humidity.',
    'Initial room air/fabric/metal temperatures are declared warm initial conditions, not a spin-up from a measured prior trajectory.',
    'Interzone links represent sensible conductance only: no airflow, transported moisture or resolved buoyancy.',
    'Ventilation ACH 0.25 in each node is an assumption; envelope H excludes this explicitly modelled ventilation.',
    'Compressor displacement, rps, coil UAs and fans remain generic: this is not a calibrated 3MXM52N8 performance map.',
    '20 minutes and a final 5-minute average are a transient benchmark, not whole-building fabric equilibrium or validated steady state.',
    'A numerical proximity to the owner 500 W observation alone would not validate these underdetermined parameters.',
  ],
  requestedDurationSeconds: durationSeconds, simulatedSeconds: output.simulatedSeconds, elapsedWallSeconds: (performance.now() - startMs) / 1000,
  cyclesStarted, maxEnergyResidualJ, maxWaterResidualKg, checkpoints, last300Seconds: window,
  final: { state: output.state, fault: output.diagnostics.fault, electrical: output.electrical, signedRoomHeatW: output.signedRoomHeatW,
    rooms: output.rooms, speedRps: output.diagnostics.speedRps, energy: output.energy,
    targetErrorsC: Object.fromEntries(roles.map((role, i) => [role, output.rooms[i].temperatureC - c.rooms[i].setpointC])),
    controller: (() => { const state = engine.checkpoint(), demand = roomDemand(c, state.rooms, output.rooms.map(room => room.temperatureC),
      state.active, state.demandIntegralW, dt, false); return { inverterCyclingLatch: state.inverterCycling,
      heatRequestedW: Object.fromEntries(roles.map((role, i) => [role, demand.heatW[i]])),
      integralW: Object.fromEntries(roles.map((role, i) => [role, state.demandIntegralW[i]])),
      active: Object.fromEntries(roles.map((role, i) => [role, output.rooms[i].active])),
      drive: state.inventoryDrive }; })() },
};
writeFileSync(new URL('../../research/owner-house-engine-benchmark.json', import.meta.url), JSON.stringify(receipt, null, 2) + '\n');
p.dispose();
console.log(JSON.stringify({ completed: output.simulatedSeconds === durationSeconds, fault: output.diagnostics.fault, last300Seconds: window,
  maxEnergyResidualJ, maxWaterResidualKg }, null, 2));
if (output.diagnostics.fault) process.exitCode = 1;
