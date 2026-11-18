// Native browser QA: a published outdoor applies its factory refrigerant; the live fluid is what the UI reports.
import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { openPage } from './browser-session.mjs';
import { startIsolatedDev } from './isolated-dev.mjs';
const dev = await startIsolatedDev(5218), page = await openPage(dev.url, 1680, 1050), checks = [];
const check = async (name, fn) => { await fn(); checks.push(name); console.log('PASS', name); };
try {
  await page.waitFor(`document.querySelector('.ou-model-select')`);
  await page.evaluate(`(async()=>{(await import('/src/i18n.ts')).setLanguage('en');const [{store},{simulation},equipment]=await Promise.all([import('/src/state.ts'),import('/src/runtime/view.ts'),import('/src/equipment.ts')]);globalThis.qa={store,simulation,equipment};})()`);
  await page.waitFor(`qa.simulation.status.output?.simulatedSeconds>2`, 40000);
  await check('every published outdoor declares a qualified factory refrigerant; only the generic group is user-chosen', async () => {
    const r = await page.evaluate(`(()=>{const m=qa.equipment.OUTDOOR_MODELS;return {generic:m.find(x=>x.id==='generic').refrigerant,owner:m.find(x=>x.id==='owner').refrigerant,
      published:[...new Set(m.filter(x=>x.id!=='generic').map(x=>x.refrigerant))]};})()`);
    assert.equal(r.generic, null); assert.equal(r.owner, 'R32');
    assert.ok(r.published.length >= 1 && r.published.every(f => ['R32', 'R290'].includes(f)), JSON.stringify(r.published));
  });
  await check('a generic R290 circuit is reported as R290, and selecting a published R32 outdoor starts a new R32 circuit', async () => {
    const r = await page.evaluate(`(async()=>{const {store}=qa;store.setOutdoorKind('generic');store.setRefrigerant('R290');
      await new Promise(r=>setTimeout(r,2500));const fluid1=store.state.cfg.live.refrigerant;
      const sel=document.querySelector('.ou-fluid-select');const shown1=sel.value,disabled1=sel.disabled;
      const epoch=store.resetEpoch;const target=qa.equipment.OUTDOOR_MODELS.find(x=>x.refrigerant==='R32'&&x.ports===1).id;
      store.setOutdoorKind(target);await new Promise(r=>setTimeout(r,500));
      return {fluid1,shown1,disabled1,target,kind:store.state.cfg.outdoorKind,fluid2:store.state.cfg.live.refrigerant,newCircuit:store.resetEpoch>epoch,
        shown2:sel.value,disabled2:sel.disabled,title:sel.title};})()`);
    assert.equal(r.fluid1, 'R290'); assert.equal(r.shown1, 'R290'); assert.equal(r.disabled1, false);
    assert.equal(r.kind, r.target); assert.equal(r.fluid2, 'R32'); assert.equal(r.newCircuit, true);
    assert.equal(r.shown2, 'R32'); assert.equal(r.disabled2, true); assert.match(r.title, /^Factory R32\./);
  });
  assert.deepEqual(page.events.filter(e => e.method === 'Runtime.exceptionThrown'), []);
  await writeFile('reviews/outdoor-refrigerant-browser-results.json', JSON.stringify({ checkedAt: new Date().toISOString(), checks }, null, 2) + '\n');
} finally { await page.close(); await dev.close(); }
