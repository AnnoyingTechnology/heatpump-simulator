import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { openPage } from './browser-session.mjs';
import { startIsolatedDev } from './isolated-dev.mjs';

const isolated = await startIsolatedDev(5194), checks = [];
// Exercise inputs and the real worker independently of concurrent UI edits.
await writeFile(join(isolated.sourceRoot, 'data-qa.html'), '<!doctype html><html><body>Room input data QA</body></html>');
const page = await openPage(`${isolated.url}data-qa.html`);
const run = fn => page.evaluate(`(${fn.toString()})()`);
const check = async (name, fn) => { await fn(); checks.push({ name, passed: true }); console.log(`PASS ${name}`); };
const settle = () => page.waitFor('!qv.simulation.isBusy && qv.simulation.status.output', 30000);
const near = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-9, `${actual} ≠ ${expected}`);
try {
  await run(async () => {
    globalThis.qa = await import('/src/state.ts'); globalThis.qv = await import('/src/runtime/view.ts');
    globalThis.qc = await import('/src/runtime/config.ts'); globalThis.qt = await import('/src/types.ts');
    qa.store.subscribe(state => qv.simulation.configure(qc.engineConfigFromUi(state.cfg, state.cfg.live)));
    qa.store.update(state => { state.ui.paused = true; });
  }); await settle();
  await check('owner H is preserved with automatic exposed areas and assumed sensible-recovery ventilation', async () => {
    const data = await run(() => ({ cfg: qa.store.state.cfg,
      areas: qa.store.state.cfg.rooms.slice(0, 3).map(room => qt.roomExposedEnvelopeAreaM2(room, qa.store.state.cfg)),
      mapped: qc.engineConfigFromUi(qa.store.state.cfg, qa.store.state.cfg.live), summary: qt.houseEnvelopeSummary(qa.store.state.cfg) }));
    assert.deepEqual(data.mapped.rooms.map(room => room.envelopeWK), [15, 25, 45]);
    assert.deepEqual(data.mapped.rooms.map(room => room.enabled), [false, true, true]);
    const surfaces = [26, 54.5, 45.4], volumes = [84, 155, 100], deductions = [26, 98, 45.4];
    for (const [i, volume] of volumes.entries()) {
      near(data.mapped.rooms[i].volumeM3, volume);
      const area = 2 * surfaces[i] + 4 * Math.sqrt(surfaces[i]) * volume / surfaces[i] - deductions[i];
      near(data.areas[i], area); near(data.cfg.rooms[i].averageUValueWm2K, [15, 25, 45][i] / area);
      assert.equal(data.mapped.rooms[i].ventilationACH, .5); assert.equal(data.mapped.rooms[i].ventilationRecoveryEfficiency, .75);
    }
    assert.deepEqual(data.cfg.ventilation, { mode: 'dual', grossACH: .5, sensibleEfficiencyPct: 75 });
    assert.equal(data.summary.envelopeWK, 85); near(data.summary.ventilationWK, 14.4075); near(data.summary.totalWK, 99.4075);
    assert.equal(data.cfg.live.cleanlinessPct, 95); assert.equal(data.mapped.outdoor.cleanFraction, .95);
    assert.deepEqual(data.mapped.rooms.map(room => room.cleanFraction), [.95, .95, .95]);
    for (const link of data.mapped.interzoneLinks) near(link.conductanceWK, 160 + 45 / 3.26);
  });
  await check('shared faces cap deductions and overlapping same-face connections are never double-counted', async () => {
    const result = await run(() => {
      const box = id => ({ id, surfaceM2: 100, ceilingHeightM: 3, heatLossWPerK: 80 });
      const cfg = { rooms: [box('top-a'), box('top-b'), box('middle'), box('bottom')], unitCount: 4, interzoneLinks: [] };
      const link = (roomA, area, orientation = 'vertical') => ({ roomA, roomB: 'middle', conductanceWK: 1,
        openingAreaM2: 0, contactAreaM2: area, insulationMm: 120, openingTransferWm2K: 40, orientation });
      const room = cfg.rooms[2], values = [qt.roomExposedEnvelopeAreaM2(room, cfg)];
      cfg.interzoneLinks = [link('top-a', 40), link('top-b', 30)]; values.push(qt.roomExposedEnvelopeAreaM2(room, cfg));
      cfg.interzoneLinks.push(link('bottom', 1000)); values.push(qt.roomExposedEnvelopeAreaM2(room, cfg));
      cfg.interzoneLinks = [link('top-a', 1000, 'horizontal'), link('top-b', 20, 'horizontal'), link('bottom', 10, 'horizontal')];
      values.push(qt.roomExposedEnvelopeAreaM2(room, cfg)); cfg.unitCount = 3; values.push(qt.roomExposedEnvelopeAreaM2(room, cfg));
      return values;
    }); assert.deepEqual(result, [320, 280, 180, 280, 290]);
  });
  await check('all coils share one cleanliness input and legacy overrides cannot unbind them', async () => {
    const result = await run(() => {
      const legacy = structuredClone(qa.store.state.cfg);
      legacy.live.outdoorCleanlinessOverridePct = 10; legacy.rooms[0].cleanlinessOverridePct = 20;
      const legacyMapped = qc.engineConfigFromUi(legacy, legacy.live);
      qa.store.update(state => {
        state.cfg.live.cleanlinessPct = 82; state.cfg.live.outdoorCleanlinessOverridePct = 10;
        state.cfg.rooms[0].cleanlinessOverridePct = 20;
      });
      return { legacyMapped, mapped: qc.engineConfigFromUi(qa.store.state.cfg, qa.store.state.cfg.live),
        outdoor: qa.outdoorCleanliness(legacy), indoor: qa.indoorCleanliness(legacy, 0),
        overrides: [qa.store.state.cfg.live.outdoorCleanlinessOverridePct, ...qa.store.state.cfg.rooms.map(room => room.cleanlinessOverridePct)] };
    });
    assert.equal(result.legacyMapped.outdoor.cleanFraction, .95);
    assert.deepEqual(result.legacyMapped.rooms.map(room => room.cleanFraction), [.95, .95, .95]);
    assert.deepEqual(result.outdoor, { pct: 95, source: 'global' }); assert.deepEqual(result.indoor, result.outdoor);
    assert.ok(result.overrides.every(value => value === null)); assert.equal(result.mapped.outdoor.cleanFraction, .82);
    assert.deepEqual(result.mapped.rooms.map(room => room.cleanFraction), [.82, .82, .82]);
    await run(() => qa.store.update(state => { state.cfg.live.cleanlinessPct = 95; })); await settle();
  });
  await check('dimensions/links retain U while advanced H, legacy G and exposed-area overrides stay coherent', async () => {
    const data = await run(() => {
      const cfg = qa.store.state.cfg, initialU = cfg.rooms[1].averageUValueWm2K;
      const copy = () => ({ ...cfg.rooms[1], exposed: qt.roomExposedEnvelopeAreaM2(cfg.rooms[1], cfg) });
      qa.store.update(state => { state.cfg.rooms[1].surfaceM2 *= 2; }); const resized = copy();
      qa.store.setInterzoneLink('first', 'attic', { contactAreaM2: 0, openingAreaM2: 0 }); const lessShared = copy();
      qa.store.update(state => { state.cfg.rooms[1].heatLossWPerK = 62; }); const direct = copy();
      qa.store.setRoomEnvelopeAreaOverride('first', 200); const overridden = copy();
      qa.store.setRoomAverageU('first', .3); const primary = copy();
      qa.store.setRoomEnvelopeAreaOverride('first', null); const automatic = copy();
      qa.store.setRoomInsulation('first', .2); const legacyG = copy();
      qa.store.setRoomEnvelopeConductance('first', 40); const advanced = copy();
      return { initialU, resized, lessShared, direct, overridden, primary, automatic, legacyG, advanced,
        mapped: qc.engineConfigFromUi(cfg, cfg.live).rooms[1].envelopeWK };
    });
    assert.equal(data.resized.averageUValueWm2K, data.initialU); near(data.resized.heatLossWPerK, data.initialU * data.resized.exposed);
    assert.equal(data.lessShared.averageUValueWm2K, data.initialU); near(data.lessShared.heatLossWPerK, data.initialU * data.lessShared.exposed);
    assert.ok(data.lessShared.heatLossWPerK > data.resized.heatLossWPerK); near(data.direct.averageUValueWm2K, 62 / data.direct.exposed);
    near(data.overridden.heatLossWPerK, 200 * data.direct.averageUValueWm2K); assert.equal(data.primary.heatLossWPerK, 60);
    near(data.automatic.heatLossWPerK, .3 * data.automatic.exposed); near(data.legacyG.heatLossWPerK, .2 * 310);
    near(data.legacyG.averageUValueWm2K, 62 / data.legacyG.exposed); near(data.advanced.averageUValueWm2K, 40 / data.advanced.exposed);
    near(data.mapped, 40); await settle();
  });
  await check('single/dual modes alter sensible recovery while gross air exchange remains independent', async () => {
    const data = await run(() => {
      const results = [], save = () => results.push({ config: qc.engineConfigFromUi(qa.store.state.cfg, qa.store.state.cfg.live), summary: qt.houseEnvelopeSummary(qa.store.state.cfg) });
      qa.store.setVentilation({ mode: 'single', grossACH: .5 }); save();
      qa.store.setVentilation({ mode: 'dual', sensibleEfficiencyPct: 90 }); save();
      qa.store.update(state => { state.cfg.rooms[1].ventilationACH = .25; }); save(); return results;
    });
    assert.deepEqual(data[0].config.rooms.map(room => [room.ventilationACH, room.ventilationRecoveryEfficiency]), [[.5, 0], [.5, 0], [.5, 0]]);
    assert.deepEqual(data[1].config.rooms.map(room => [room.ventilationACH, room.ventilationRecoveryEfficiency]), [[.5, .9], [.5, .9], [.5, .9]]);
    assert.deepEqual(data[2].config.rooms.map(room => [room.ventilationACH, room.ventilationRecoveryEfficiency]), [[.5, .9], [.25, .9], [.5, .9]]);
    near(data[0].summary.ventilationWK, .34 * 494 * .5); near(data[1].summary.ventilationWK, .34 * 494 * .5 * .1);
    near(data[2].summary.ventilationWK, .34 * (84 * .5 + 310 * .25 + 100 * .5) * .1); await settle();
  });
  await check('zero geometry stays editable and direct link H remains an explicit overridable assumption', async () => {
    const stages = await run(() => {
      const snapshots = [], save = () => snapshots.push({ ...qa.store.state.cfg.interzoneLinks.find(link => link.roomA === 'ground') });
      qa.store.setInterzoneLink('ground', 'first', { openingAreaM2: 0 }); save();
      qa.store.setInterzoneLink('ground', 'first', { contactAreaM2: 0 }); save();
      qa.store.setInterzoneConductance('ground', 'first', 90); save();
      qa.store.setInterzoneLink('ground', 'first', { orientation: 'horizontal' }); save();
      qa.store.setInterzoneLink('ground', 'first', { insulationMm: 45 }); save(); return snapshots;
    });
    near(stages[0].conductanceWK, 45 / 3.26); assert.equal(stages[1].conductanceWK, 0);
    assert.equal(stages[2].conductanceOverrideWK, 90); assert.equal(stages[3].conductanceOverrideWK, 90);
    assert.equal(stages[4].conductanceOverrideWK, undefined); assert.equal(stages[4].conductanceWK, 0); await settle();
    await run(() => qa.store.removeInterzoneLink('first', 'ground')); await settle(); assert.equal(await run(() => qa.store.state.cfg.interzoneLinks.length), 1);
  });
  await check('legacy H inputs still work and invalid U/area/ventilation edits cannot mutate valid input', async () => {
    const data = await run(() => {
      const legacy = { surfaceM2: 20, ceilingHeightM: 3, heatLossWPerK: 75 }, before = JSON.stringify(qa.store.state.cfg);
      qa.store.setRoomAverageU('first', -1); qa.store.setRoomEnvelopeAreaOverride('first', 0);
      qa.store.setVentilation({ grossACH: -1 }); qa.store.setVentilation({ sensibleEfficiencyPct: 101 });
      return { h: qt.roomEnvelopeConductanceWK(legacy), area: qt.roomExposedEnvelopeAreaM2(legacy), u: qt.roomAverageUValue(legacy),
        unchanged: before === JSON.stringify(qa.store.state.cfg) };
    });
    assert.equal(data.h, 75); near(data.area, 40 + 12 * Math.sqrt(20)); near(data.u, 75 / data.area); assert.equal(data.unchanged, true);
  });
  await check('U/area/recovery edits preserve accepted storage and Off-room heat transfer in the guarded worker', async () => {
    const before = await run(() => ({ output: qv.simulation.status.output, epoch: qa.store.resetEpoch }));
    await run(() => {
      qa.store.setInterzoneLink('first', 'attic', { openingAreaM2: 4, contactAreaM2: 45, insulationMm: 120 });
      qa.store.setRoomAverageU('attic', .2); qa.store.setVentilation({ mode: 'dual', sensibleEfficiencyPct: 75 });
    }); await settle();
    assert.equal(await run(() => qa.store.resetEpoch), before.epoch);
    assert.equal(await run(() => qv.simulation.status.output.simulatedSeconds), before.output.simulatedSeconds);
    await run(() => qv.simulation.step(.25)); await settle();
    const output = await run(() => qv.simulation.status.output);
    assert.equal(output.diagnostics.fault, null); assert.equal(output.simulatedSeconds, before.output.simulatedSeconds + .25);
    assert.equal(output.rooms[0].active, false); assert.ok(output.rooms[0].interzoneHeatW > 0);
    assert.ok(Math.abs(output.rooms[0].temperatureC - before.output.rooms[0].temperatureC) < .1);
    assert.ok(Math.abs(output.energy.residualJ) < .01); assert.ok(Math.abs(output.energy.waterResidualKg) < 1e-10);
    const link = output.interzoneTransfers.find(value => value.roomA === 'first' && value.roomB === 'attic');
    near(link.heatFromAToBW, (160 + 45 / 3.26) * (output.rooms[1].temperatureC - output.rooms[0].temperatureC));
  });
  assert.deepEqual(page.events.filter(event => event.method === 'Runtime.exceptionThrown'), []);
  await writeFile('reviews/u-envelope-data-browser-results.json', JSON.stringify({ checkedAt: new Date().toISOString(), checks,
    scope: 'Average U/automatic exposed-area estimate, parallel paths and gross ventilation/sensible recovery with guarded-worker continuity; no UI styling assertions' }, null, 2) + '\n');
} finally { await run(() => qv?.simulation.stop()).catch(() => {}); await page.close(); await isolated.close(); }
