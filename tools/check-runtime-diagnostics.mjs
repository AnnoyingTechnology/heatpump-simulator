import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {openPage} from './browser-session.mjs';
import {startIsolatedDev} from './isolated-dev.mjs';

const isolated = await startIsolatedDev(5196), page = await openPage(isolated.url), checks = [];
const run = fn => page.evaluate(`(${fn.toString()})()`);
const settle = () => page.waitFor('!qv.simulation.isBusy && qv.simulation.status.output', 30000);
const check = async (name, fn) => { await fn(); checks.push({name, passed:true}); console.log(`PASS ${name}`); };
try {
  await page.waitFor('!!document.querySelector(".scene")');
  await run(async () => {
    const m = await fetch('/src/main.ts').then(r => r.text());
    for (const [name, file] of [['qa','state'],['qv','runtime/view'],['qc','runtime/config']]) {
      globalThis[name] = await import(m.match(new RegExp(`from "([^\"]*\\/${file}\\.ts[^\"]*)"`))[1]);
    }
    qa.store.update(s => s.ui.paused = true);
  });
  await settle();
  await run(() => qv.simulation.step(5)); await settle();
  await check('a rejected worker request retains accepted time and room stores, then recovers without resetting', async () => {
    await run(() => {
      globalThis.goodConfig = qc.engineConfigFromUi(qa.store.state.cfg, qa.store.state.cfg.live);
      globalThis.beforeOutput = qv.simulation.status.output;
      qv.simulation.configure({...goodConfig, outdoorRelativeHumidity:2});
    }); await settle();
    const result = await run(() => ({status:qv.simulation.status, report:qv.simulation.diagnosticReport()}));
    assert.equal(result.status.state, 'error');
    const before = await run(() => beforeOutput);
    assert.equal(result.status.output.simulatedSeconds, before.simulatedSeconds);
    assert.deepEqual(result.status.output.rooms, before.rooms);
    assert.equal(result.report.failure.category, 'request-error');
    assert.ok(result.report.failure.message);
    assert.equal(result.report.requestedConfig.outdoorRelativeHumidity, 2);
    assert.ok(result.report.recentRequests.length <= 24);
    await run(() => qv.simulation.configure(goodConfig)); await settle();
    assert.equal(await run(() => qv.simulation.status.state), 'ready');
    assert.equal(await run(() => qv.simulation.status.output.simulatedSeconds), before.simulatedSeconds);
  });
  await check('a terminated worker retains readings and diagnostic inputs until an explicit reset', async () => {
    await run(() => {
      globalThis.fatalBefore = qv.simulation.status.output;
      // QA-only browser event exercises the real runtime error handler and termination.
      qv.simulation.worker.dispatchEvent(new ErrorEvent('error', {message:'QA worker termination', filename:'qa-worker.ts', lineno:9}));
    });
    const result = await run(() => ({status:qv.simulation.status, report:qv.simulation.diagnosticReport(), rooms:qa.currentReadings(qa.store.state).retainedRooms}));
    assert.equal(result.status.state, 'error');
    assert.equal(result.report.failure.category, 'worker-error');
    assert.equal(result.report.failure.filename, 'qa-worker.ts');
    assert.deepEqual(result.status.output.rooms, (await run(() => fatalBefore)).rooms);
    assert.ok(result.rooms.every(r => Number.isFinite(r.temperatureC)));
    await run(() => {
      goodConfig.outdoorTemperatureC = 2;
      qv.simulation.configure(goodConfig);
    });
    assert.equal(await run(() => qv.simulation.status.state), 'error');
    assert.equal(await run(() => qv.simulation.status.output.simulatedSeconds), (await run(() => fatalBefore)).simulatedSeconds);
    const report = await run(() => qv.simulation.diagnosticReport());
    assert.equal(report.requestedConfig.outdoorTemperatureC, 2);
    assert.equal(report.format, 'heatpump-diagnostic-v1');
    assert.ok(report.applicationAsset && report.runtimeAsset && report.browser);
    assert.equal(await run(() => !document.querySelector('.dl-diag').hidden), true);
    await run(() => qv.simulation.start(goodConfig)); await settle();
    assert.equal(await run(() => qv.simulation.status.output.simulatedSeconds), 0);
    assert.equal(await run(() => qv.simulation.status.state), 'ready');
  });
  assert.deepEqual(page.events.filter(e => e.method === 'Runtime.exceptionThrown'), []);
  await writeFile('reviews/runtime-diagnostics-browser-results.json', JSON.stringify({checkedAt:new Date().toISOString(), checks, scope:'Real guarded worker request rejection and controlled QA termination; no reproduced native abort.'},null,2)+'\n');
} finally { await page.close(); await isolated.close(); }
