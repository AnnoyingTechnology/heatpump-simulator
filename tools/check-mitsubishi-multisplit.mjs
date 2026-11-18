// Native browser QA: a Mitsubishi Electric multisplit offers Mitsubishi heads and judges them without a Daikin assumption.
import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { openPage } from './browser-session.mjs';
import { startIsolatedDev } from './isolated-dev.mjs';
const dev = await startIsolatedDev(5219), page = await openPage(dev.url, 1680, 1050), checks = [];
const check = async (name, fn) => { await fn(); checks.push(name); console.log('PASS', name); };
try {
  await page.waitFor(`document.querySelector('.ou-model-select')`);
  await page.evaluate(`(async()=>{(await import('/src/i18n.ts')).setLanguage('en');const [{store},{simulation},equipment]=await Promise.all([import('/src/state.ts'),import('/src/runtime/view.ts'),import('/src/equipment.ts')]);globalThis.qa={store,simulation,equipment};})()`);
  await page.waitFor(`qa.simulation.status.output?.simulatedSeconds>2`, 40000);
  await check('selecting MXZ-3F54VF5 with three rooms offers only Mitsubishi heads and replaces the Daikin heads', async () => {
    const r = await page.evaluate(`(async()=>{const {store,equipment}=qa;store.setOutdoorKind('MXZ-3F54VF5');await new Promise(r=>setTimeout(r,1500));
      const cfg=store.state.cfg,sel=document.querySelector('select[aria-label="Indoor model for Upstairs (L1)"]');
      return {kind:cfg.outdoorKind,fluid:cfg.live.refrigerant,units:cfg.unitCount,
        offered:[...new Set(equipment.indoorOptionsForOutdoor('MXZ-3F54VF5').map(o=>o.manufacturer))],
        heads:cfg.rooms.slice(0,cfg.unitCount).map(r=>equipment.indoorModelProfile(r.indoorClass)?.manufacturer),
        groups:[...sel.querySelectorAll('optgroup')].map(g=>g.label),unverified:[...sel.options].every(o=>o.text.endsWith('combination unverified'))};})()`);
    assert.equal(r.kind, 'MXZ-3F54VF5'); assert.equal(r.fluid, 'R32'); assert.equal(r.units, 3);
    assert.deepEqual(r.offered, ['mitsubishi-electric']); assert.deepEqual([...new Set(r.heads)], ['mitsubishi-electric']);
    assert.deepEqual(r.groups, ['Mitsubishi Electric']); assert.equal(r.unverified, true);
  });
  await check('installation findings keep exact eligibility unknown without a manufacturer or legacy-source finding', async () => {
    const r = await page.evaluate(`(()=>{const v=qa.equipment.currentInstallationValidation(qa.store.state.cfg);return {status:v.status,codes:v.findings.map(f=>f.code),legacy:v.findings.some(f=>/legacy/.test(f.message))};})()`);
    assert.equal(r.status, 'unknown'); assert.ok(!r.codes.includes('manufacturer'), r.codes.join());
    assert.ok(r.codes.includes('exact-eligibility')); assert.equal(r.legacy, false);
  });
  await check('the simulation keeps running on the Mitsubishi multisplit', async () => {
    const r = await page.evaluate(`(async()=>{const t0=qa.simulation.status.output.simulatedSeconds;await new Promise(r=>setTimeout(r,3000));return {t0,t1:qa.simulation.status.output.simulatedSeconds,kind:qa.simulation.status.kind};})()`);
    assert.ok(r.t1 > r.t0, JSON.stringify(r));
  });
  assert.deepEqual(page.events.filter(e => e.method === 'Runtime.exceptionThrown'), []);
  await writeFile('reviews/mitsubishi-multisplit-browser-results.json', JSON.stringify({ checkedAt: new Date().toISOString(), checks }, null, 2) + '\n');
} finally { await page.close(); await dev.close(); }
