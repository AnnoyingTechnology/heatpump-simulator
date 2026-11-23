// Native browser QA: Panasonic and Mitsubishi Heavy Industries profiles select, group and simulate like the existing makers.
import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { openPage } from './browser-session.mjs';
import { startIsolatedDev } from './isolated-dev.mjs';
const dev = await startIsolatedDev(5223), page = await openPage(dev.url, 1680, 1050), checks = [];
const check = async (name, fn) => { await fn(); checks.push(name); console.log('PASS', name); };
const multisplit = (outdoor, maker, label, rooms) => page.evaluate(`(async()=>{const {store,equipment}=qa;store.setOutdoorKind(${JSON.stringify(outdoor)});store.setUnitCount(${rooms});await new Promise(r=>setTimeout(r,1500));
  const cfg=store.state.cfg,sel=document.querySelector('select[aria-label="Indoor model for Upstairs (L1)"]'),v=equipment.currentInstallationValidation(cfg);
  return {kind:cfg.outdoorKind,fluid:cfg.live.refrigerant,units:cfg.unitCount,
    offered:[...new Set(equipment.indoorOptionsForOutdoor(${JSON.stringify(outdoor)}).map(o=>o.manufacturer))],
    heads:[...new Set(cfg.rooms.slice(0,cfg.unitCount).map(r=>equipment.indoorModelProfile(r.indoorClass)?.manufacturer))],
    groups:[...sel.querySelectorAll('optgroup')].map(g=>g.label),unverified:[...sel.options].every(o=>o.text.endsWith('combination unverified')),
    outdoorGroups:[...document.querySelectorAll('select[aria-label="Outdoor model"] optgroup')].map(g=>g.label),
    status:v.status,codes:v.findings.map(f=>f.code)};})()`).then((r) => {
  assert.equal(r.kind, outdoor); assert.equal(r.fluid, 'R32'); assert.equal(r.units, rooms);
  assert.deepEqual(r.offered, [maker]); assert.deepEqual(r.heads, [maker]);
  assert.deepEqual(r.groups, [label]); assert.equal(r.unverified, true);
  assert.ok(r.outdoorGroups.includes(label), r.outdoorGroups.join());
  assert.equal(r.status, 'unknown'); assert.ok(!r.codes.includes('manufacturer'), r.codes.join()); assert.ok(r.codes.includes('exact-eligibility'), r.codes.join());
});
const monosplit = (outdoor, indoor) => page.evaluate(`(async()=>{const {store,equipment}=qa;store.setOutdoorKind(${JSON.stringify(outdoor)});await new Promise(r=>setTimeout(r,800));
  const cfg=store.state.cfg;return {units:cfg.unitCount,indoor:cfg.rooms[0].indoorClass,options:equipment.indoorOptionsForOutdoor(${JSON.stringify(outdoor)}).map(o=>o.value)};})()`).then((r) => {
  assert.equal(r.units, 1); assert.ok(r.options.includes(indoor), r.options.join()); assert.ok(r.options.includes(r.indoor), r.indoor);
});
try {
  await page.waitFor(`document.querySelector('.ou-model-select')`);
  await page.evaluate(`(async()=>{(await import('/src/i18n.ts')).setLanguage('en');const [{store},{simulation},equipment]=await Promise.all([import('/src/state.ts'),import('/src/runtime/view.ts'),import('/src/equipment.ts')]);globalThis.qa={store,simulation,equipment};})()`);
  await page.waitFor(`qa.simulation.status.output?.simulatedSeconds>2`, 40000);
  await check('Panasonic CU-4Z80CBE offers only Panasonic heads with exact eligibility unknown', () => multisplit('CU-4Z80CBE', 'panasonic', 'Panasonic', 4));
  await check('Mitsubishi Heavy Industries SCM80ZS-W offers only MHI heads with exact eligibility unknown', () => multisplit('SCM80ZS-W', 'mitsubishi-heavy-industries', 'Mitsubishi Heavy Industries', 3));
  await check('shared MHI outdoor SRC50ZSX-W3 keeps every printed single-split partner', () => monosplit('SRC50ZSX-W3', 'FDTC50VH'));
  await check('Panasonic Etherea single-split keeps the finish-specific partner', () => monosplit('CU-Z25CKE', 'CS-Z25CKEW'));
  await check('the simulation keeps running on a new-manufacturer multisplit', async () => {
    const r = await page.evaluate(`(async()=>{qa.store.setOutdoorKind('SCM50ZS-W');await new Promise(r=>setTimeout(r,1000));const t0=qa.simulation.status.output.simulatedSeconds;await new Promise(r=>setTimeout(r,3000));return {t0,t1:qa.simulation.status.output.simulatedSeconds};})()`);
    assert.ok(r.t1 > r.t0, JSON.stringify(r));
  });
  assert.deepEqual(page.events.filter(e => e.method === 'Runtime.exceptionThrown'), []);
  await writeFile('reviews/new-manufacturers-browser-results.json', JSON.stringify({ checkedAt: new Date().toISOString(), checks }, null, 2) + '\n');
} finally { await page.close(); await dev.close(); }
