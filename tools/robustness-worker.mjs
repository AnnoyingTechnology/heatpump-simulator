import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, renameSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

// Each process loads an immutable compiled engine and its production HEOS artifact.
// Persist the immediately preceding accepted transaction before entering native code.
const [snapshot, inputPath, progressPath, resultPath] = process.argv.slice(2);
const scenario = JSON.parse(readFileSync(inputPath, 'utf8'));
const { Properties, HeatPumpEngine } = await import(pathToFileURL(`${snapshot}/build/index.js`));
const { default: backend } = await import(pathToFileURL(`${snapshot}/vendor/adapter.js`));
const serialise = value => JSON.stringify(value, (_, v) => v === Infinity ? { nonfinite: 'Infinity' } : v === -Infinity ? { nonfinite: '-Infinity' } : Number.isNaN(v) ? { nonfinite: 'NaN' } : v);
const save = (path, value) => { writeFileSync(`${path}.tmp`, serialise(value)); renameSync(`${path}.tmp`, path); };
const errorInfo = e => ({ name: e?.name ?? 'Error', message: e?.message ?? String(e), stack: e?.stack ?? null });
let engine, properties, output, currentOperation, before, exception, faultRollbackVerified = null, config = structuredClone(scenario.config);
let steps = 0, updates = 0, maxEnergyResidualJ = 0, maxWaterResidualKg = 0, maxStepWallMs = 0, completedDefrosts = 0;
const stateEntries = {};
const protectionCounts = {}, states = {}, start = performance.now();
const comfortRooms = {}, comfortTransitions = [];
let ordinaryNoCallSeconds = 0, ordinaryCompressorWithoutCallSeconds = 0;
const comfortTelemetry = () => ({ rooms: comfortRooms, transitions: comfortTransitions,
  recordedTransitionLimit: 128, ordinaryNoCallSeconds, ordinaryCompressorWithoutCallSeconds });
const finite = (value, path = 'output') => {
  if (typeof value === 'number') assert.ok(Number.isFinite(value), `${path} is nonfinite: ${value}`);
  if (value && typeof value === 'object') for (const [k, v] of Object.entries(value)) finite(v, `${path}.${k}`);
};
const conservedCheckpoint = checkpoint => Object.fromEntries(Object.entries(checkpoint).filter(([k]) => !['state', 'cycle', 'lastOutput'].includes(k)));
try {
  save(progressPath, { scenario: scenario.id, operation: { type: 'initialise' }, config });
  properties = new Properties(await backend()); engine = new HeatPumpEngine(properties, config); output = engine.snapshot();
  // Observation only: retain the original throw stack before step() catches it.
  // This does not change engine decisions, values, acceptance or exception handling.
  const advance = engine.advance.bind(engine);
  engine.advance = dt => { try { return advance(dt); } catch (e) { exception = errorInfo(e); throw e; } };
  for (const [index, operation] of scenario.operations.entries()) {
    currentOperation = { index, ...operation };
    if (operation.type === 'update') {
      before = structuredClone(engine.checkpoint());
      config = structuredClone(operation.config);
      save(progressPath, { scenario: scenario.id, operation: currentOperation, config, acceptedCheckpoint: before, acceptedOutput: output });
      output = engine.updateConfig(config); updates++;
      assert.equal(output.simulatedSeconds, before.time, 'A scenario edit advanced the physical clock'); finite(output);
      assert.equal(output.energy.electricityJ, before.ledgers.electricityJ, 'A scenario edit reset electricity history');
      assert.equal(output.energy.usefulServiceHeatJ, before.ledgers.usefulServiceHeatJ, 'A scenario edit reset session service history');
      assert.equal(output.energy.drainedWaterKg, before.ledgers.drainedWaterKg, 'A scenario edit reset drained water');
      continue;
    }
    const count = Math.round(operation.seconds / .25);
    for (let substep = 0; substep < count; substep++) {
      currentOperation = { index, type: 'step', dt: .25, requestedSegmentSeconds: operation.seconds, substep };
      before = structuredClone(engine.checkpoint());
      save(progressPath, { scenario: scenario.id, operation: currentOperation, config, acceptedCheckpoint: before, acceptedOutput: output });
      const previous = output; exception = null; const stepStart = performance.now(); output = engine.step(.25); steps++;
      maxStepWallMs = Math.max(maxStepWallMs, performance.now() - stepStart);
      if (output.diagnostics.fault) {
        const after = engine.checkpoint();
        assert.deepEqual(conservedCheckpoint(after), conservedCheckpoint(before), 'Fault failed to restore the complete accepted physical/control transaction');
        faultRollbackVerified = true;
        throw Object.assign(new Error(output.diagnostics.fault), { cause: exception });
      }
      finite(output); assert.equal(output.simulatedSeconds, previous.simulatedSeconds + .25, 'Accepted clock did not advance exactly one step');
      for (const room of output.rooms) {
        if (typeof room.thermostatCalling !== 'boolean' || room.fanSpeedFraction === undefined) continue;
        const priorRoom = previous.rooms.find(r => r.id === room.id);
        const entry = comfortRooms[room.id] ??= { callingSeconds: 0, notCallingSeconds: 0, poweredFanSeconds: 0,
          modulatedFanSeconds: 0, minPoweredFanFraction: null, maxPoweredFanFraction: 0, fanEnergyJ: 0, callTransitions: 0, circuitTransitions: 0 };
        entry[room.thermostatCalling ? 'callingSeconds' : 'notCallingSeconds'] += .25;
        entry.fanEnergyJ += room.fanPowerW * .25;
        assert.ok(room.fanSpeedFraction >= 0 && room.fanSpeedFraction <= 1, 'Accepted indoor fan exceeds its declared command range');
        if (room.fanPowerW > 0) {
          entry.poweredFanSeconds += .25;
          if (room.fanSpeedFraction < 1) entry.modulatedFanSeconds += .25;
          entry.minPoweredFanFraction = Math.min(entry.minPoweredFanFraction ?? Infinity, room.fanSpeedFraction);
          entry.maxPoweredFanFraction = Math.max(entry.maxPoweredFanFraction, room.fanSpeedFraction);
        }
        const callChanged = typeof priorRoom?.thermostatCalling === 'boolean' && room.thermostatCalling !== priorRoom.thermostatCalling;
        const circuitChanged = priorRoom && room.active !== priorRoom.active;
        if (callChanged) entry.callTransitions++;
        if (circuitChanged) entry.circuitTransitions++;
        if ((callChanged || circuitChanged) && comfortTransitions.length < 128) comfortTransitions.push({
          roomId: room.id, simulatedSeconds: output.simulatedSeconds, requestedMode: config.mode, state: output.state,
          calling: room.thermostatCalling, circuitActive: room.active, fanFraction: room.fanSpeedFraction,
          temperatureBeforeC: priorRoom?.temperatureC, temperatureAfterC: room.temperatureC, setpointC: room.setpointC });
      }
      const noCall = output.rooms.every(r => r.thermostatCalling === false);
      if (noCall && output.state !== 'defrost' && output.state !== 'reversing') {
        ordinaryNoCallSeconds += .25;
        if (output.electrical.compressorW > 1e-9) ordinaryCompressorWithoutCallSeconds += .25;
        assert.ok(output.electrical.compressorW <= 1e-9, 'Ordinary compressor is powered with every comfort call stopped');
      }
      assert.ok(output.energy.electricityJ >= previous.energy.electricityJ, 'Electricity ledger decreased');
      assert.ok(output.energy.drainedWaterKg >= previous.energy.drainedWaterKg, 'Drained water ledger decreased');
      assert.ok(output.outdoor.iceKg >= -1e-12 && output.outdoor.liquidKg >= -1e-12, 'Negative retained water');
      const integratedService = output.energy.usefulServiceHeatJ - previous.energy.usefulServiceHeatJ;
      assert.ok(Math.abs(integratedService - (config.mode === 'heating' ? 1 : -1) * output.signedRoomHeatW * .25) < 1e-7, 'Session service ledger does not match accepted useful HVAC power');
      const er = Math.abs(output.energy.residualJ), wr = Math.abs(output.energy.waterResidualKg);
      maxEnergyResidualJ = Math.max(maxEnergyResidualJ, er); maxWaterResidualKg = Math.max(maxWaterResidualKg, wr);
      assert.ok(er <= .01 + 1e-9 * (Math.abs(output.energy.boundaryEnergyJ) + output.energy.electricityJ), `Energy conservation failed: ${er} J`);
      assert.ok(wr <= 1e-8, `Water conservation failed: ${wr} kg`);
      const exchanges = output.rooms.reduce((v, room) => v + (room.interzoneHeatW ?? 0), 0);
      assert.ok(Math.abs(exchanges) < 1e-8, `Room links create heat: ${exchanges} W`);
      if (output.cycle) {
        assert.ok(Math.abs(output.cycle.closureResidualW) <= config.numerics.pressureToleranceW, 'Accepted refrigerant cycle exceeds its closure tolerance');
        assert.ok(Math.abs(output.cycle.branchMassFlowsKgs.reduce((a,b)=>a+b,0)-output.cycle.totalMassFlowKgs) < 1e-9, 'Shared refrigerant header creates or loses mass');
        // Compressor/coil matching uses a 250 kJ/kg residual scale; unlike the
        // exact branch sum above, this algebraic estimate has the declared
        // pressure-solve tolerance (default 0.1 W / 250 kJ/kg = 4e-7 kg/s).
        assert.ok(Math.abs(output.cycle.massResidualKgs) * 250000 <= config.numerics.pressureToleranceW, 'Compressor/coil mass closure exceeds its declared tolerance');
        assert.ok(output.cycle.discharge.temperatureC <= config.compressor.maxDischargeC + 1e-8, 'Accepted compressor exceeds discharge-temperature cap');
        assert.ok(output.cycle.highPressureBarAbs/output.cycle.lowPressureBarAbs <= config.compressor.maxPressureRatio + 1e-8, 'Accepted compressor exceeds pressure-ratio cap');
      }
      if (output.diagnostics.envelopeProtection) protectionCounts[output.diagnostics.envelopeProtection] = (protectionCounts[output.diagnostics.envelopeProtection] ?? 0) + 1;
      states[output.state] = (states[output.state] ?? 0) + 1;
      if (output.state !== previous.state) stateEntries[output.state] = (stateEntries[output.state] ?? 0) + 1;
      if (previous.state === 'defrost' && output.state === 'draining') completedDefrosts++;
    }
  }
  save(resultPath, { id: scenario.id, outcome: 'pass', steps, updates, simulatedSeconds: output.simulatedSeconds,
    wallSeconds: (performance.now() - start) / 1000, maxEnergyResidualJ, maxWaterResidualKg, protectionCounts, states, stateEntries, completedDefrosts, maxStepWallMs,
    comfort: comfortTelemetry(), final: { rooms: output.rooms, outdoor: output.outdoor, energy: output.energy } });
} catch (e) {
  save(resultPath, { id: scenario.id, outcome: e?.name === 'AssertionError' ? 'invariant-failure' : output?.diagnostics?.fault ? 'physical-fault' : 'exception', faultRollbackVerified,
    error: errorInfo(e), originalException: exception ?? e.cause ?? null, steps, updates, simulatedSeconds: output?.simulatedSeconds ?? 0,
    wallSeconds: (performance.now() - start) / 1000, operation: currentOperation, config,
    acceptedCheckpoint: before, faultOutput: output, maxEnergyResidualJ, maxWaterResidualKg,
    comfort: comfortTelemetry() }); process.exitCode = 1;
} finally {
  try { properties?.dispose(); }
  catch (error) {
    // Distinguish a cleanup exception from the expected exit1 after a recorded
    // physical fault. Uncatchable aborts remain isolated by the coordinator.
    const recorded = JSON.parse(readFileSync(resultPath, 'utf8'));
    save(resultPath, { ...recorded, outcome: 'exception', recordedOutcomeBeforeDispose: recorded.outcome,
      failureStage: 'backend-dispose', disposalException: errorInfo(error) });
    process.exitCode = 2;
  }
}
