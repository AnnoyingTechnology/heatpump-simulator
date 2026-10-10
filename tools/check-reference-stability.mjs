// Actual worker endurance check for the owner's reported controls, on an immutable source snapshot.
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { openPage } from './browser-session.mjs';
import { startIsolatedDev } from './isolated-dev.mjs';

const seconds = Number(process.argv[2] ?? 1200);
const humidity = Number(process.argv[3] ?? 35);
assert.ok(Number.isFinite(seconds) && seconds > 307 && seconds <= 7200);
assert.ok(Number.isFinite(humidity) && humidity >= 10 && humidity <= 100);
const server = await startIsolatedDev(5193);
let page;
const result = { checkedAt: new Date().toISOString(), requestedSpeed: 5, humidityPct: humidity,
  targetSeconds: seconds, samples: [], transitions: [], completed: false };
result.sourceHashes = Object.fromEntries(await Promise.all(['cycle.ts', 'engine.ts', 'air.ts', 'drive.ts'].map(async name =>
  [name, createHash('sha256').update(await readFile(join(server.sourceRoot, 'src/engine', name))).digest('hex')])));
try {
  page = await openPage(server.url);
  await page.waitFor('!!document.querySelector(".scene")');
  await page.send('Page.bringToFront');
  await page.evaluate(`(async () => {
    const source = await fetch('/src/main.ts').then(r => r.text());
    globalThis.qa = await import(source.match(/from "([^"]*\\/state\\.ts[^"]*)"/)[1]);
    globalThis.qv = await import(source.match(/from "([^"]*\\/runtime\\/view\\.ts[^"]*)"/)[1]);
    globalThis.qc = await import(source.match(/from "([^"]*\\/runtime\\/config\\.ts[^"]*)"/)[1]);
    qa.store.reset();
    qa.store.update(s => {
      s.ui.speed = 5; s.cfg.outdoorC = -.5; s.cfg.outdoorRh = ${humidity};
      s.cfg.rooms[0].enabled = false;
      s.cfg.rooms[1].setpointC = 22.5; s.cfg.rooms[2].setpointC = 17.5;
    });
  })()`);
  result.config = await page.evaluate('qc.engineConfigFromUi(qa.store.state.cfg, qa.store.state.cfg.live)');
  const start = Date.now();
  let lastTime = -1, lastMinute = -1, lastState = null;
  while (Date.now() - start < Math.max(180000, seconds * 1000)) {
    await new Promise(r => setTimeout(r, 1000));
    const status = await page.evaluate('qv.simulation.status');
    assert.notEqual(status.state, 'error', status.error);
    const o = status.output;
    if (!o) continue;
    result.finalOutput = o;
    assert.notEqual(o.state, 'fault', o.diagnostics.fault);
    assert.ok(o.simulatedSeconds >= lastTime, 'physical time must never reset');
    assert.ok(Math.abs(o.energy.residualJ) < .01, `energy residual ${o.energy.residualJ}`);
    assert.ok(Math.abs(o.energy.waterResidualKg) < 1e-10, `water residual ${o.energy.waterResidualKg}`);
    if (o.cycle) {
      assert.ok(o.cycle.discharge.temperatureC <= result.config.compressor.maxDischargeC);
    }
    const sample = { time: o.simulatedSeconds, state: o.state, iceKg: o.outdoor.iceKg,
      protection: o.diagnostics.envelopeProtection, speedRps: o.diagnostics.speedRps,
      roomC: o.rooms.map(r => r.temperatureC), energyResidualJ: o.energy.residualJ };
    if (o.state !== lastState) result.transitions.push(sample);
    if (Math.floor(o.simulatedSeconds / 60) !== lastMinute) {
      result.samples.push(sample); console.log(JSON.stringify(sample));
    }
    lastTime = o.simulatedSeconds; lastState = o.state; lastMinute = Math.floor(lastTime / 60);
    if (lastTime >= seconds) { result.completed = true; break; }
  }
  assert.equal(result.completed, true, 'worker endurance timeout');
  result.wallSeconds = (Date.now() - start) / 1000;
  result.runtimeErrors = page.events.filter(e => e.method === 'Runtime.exceptionThrown');
  assert.equal(result.runtimeErrors.length, 0);
  console.log(`PASS owner controls at 5× through ${result.finalOutput.simulatedSeconds}s`);
} catch (error) {
  result.error = String(error); throw error;
} finally {
  await writeFile(`reviews/reference-owner-browser-${humidity}-results.json`, JSON.stringify(result, null, 2) + '\n');
  await page?.close(); await server.close();
}
