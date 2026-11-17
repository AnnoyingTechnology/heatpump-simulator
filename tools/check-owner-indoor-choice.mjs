// Native browser QA: the owner 3MXM52N8 preset offers every catalogued Daikin head, not only the declared FTXA25/35.
import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { openPage } from './browser-session.mjs';
import { startIsolatedDev } from './isolated-dev.mjs';
const dev = await startIsolatedDev(5217), page = await openPage(dev.url, 1680, 1050), checks = [];
const check = async (name, fn) => { await fn(); checks.push(name); console.log('PASS', name); };
try {
  await page.waitFor(`document.querySelector('.ou-model-select')`);
  await page.evaluate(`(async()=>{(await import('/src/i18n.ts')).setLanguage('en');const [{store},{simulation},equipment]=await Promise.all([import('/src/state.ts'),import('/src/runtime/view.ts'),import('/src/equipment.ts')]);globalThis.qa={store,simulation,equipment};})()`);
  await page.waitFor(`qa.simulation.status.output?.simulatedSeconds>2`, 40000);
  await check('owner preset lists the declared heads plus every catalogued Daikin head, marking only the latter unverified', async () => {
    const r = await page.evaluate(`(()=>{const sel=document.querySelector('select[aria-label="Indoor model for Upstairs (L1)"]');const opts=[...sel.options];
      const daikin=qa.equipment.indoorOptionsForOutdoor('3MXM52N2V1B8').map(o=>o.value);
      return {kind:qa.store.state.cfg.outdoorKind,values:opts.map(o=>o.value),daikin,
        owner:opts.filter(o=>o.value==='FTXA25'||o.value==='FTXA35').map(o=>o.text),
        others:opts.filter(o=>o.value!=='FTXA25'&&o.value!=='FTXA35').every(o=>o.text.endsWith('combination unverified')),
        groups:[...sel.querySelectorAll('optgroup')].map(g=>g.label)};})()`);
    assert.equal(r.kind, 'owner');
    assert.ok(r.values.length > 100, String(r.values.length));
    assert.deepEqual([...r.values].sort(), [...r.daikin].sort());
    assert.deepEqual(r.owner, ['FTXA25 (suffix unknown)', 'FTXA35 (suffix unknown)']);
    assert.equal(r.others, true);
    assert.deepEqual(r.groups, ['Daikin']);
  });
  await check('native selection of another Daikin head applies its airflow without resetting the session', async () => {
    const r = await page.evaluate(`(async()=>{const {store,simulation}=qa;const epoch=store.resetEpoch,t0=simulation.status.output.simulatedSeconds;
      const sel=document.querySelector('select[aria-label="Indoor model for Upstairs (L1)"]');sel.value='FTXM50A2V1B';sel.dispatchEvent(new Event('change',{bubbles:true}));
      const room=store.state.cfg.rooms.find(r=>r.name.startsWith('Upstairs'));const profile=qa.equipment.indoorModelProfile('FTXM50A2V1B');
      await new Promise(r=>setTimeout(r,2500));
      return {cls:room.indoorClass,flow:room.volumetricAirFlowM3s,expected:profile.coolingHighFanFlowM3h/3600,epoch:store.resetEpoch===epoch,advanced:simulation.status.output.simulatedSeconds>t0,
        shown:document.querySelector('select[aria-label="Indoor model for Upstairs (L1)"]').value,kind:store.state.cfg.outdoorKind};})()`);
    assert.equal(r.cls, 'FTXM50A2V1B'); assert.equal(r.shown, 'FTXM50A2V1B'); assert.equal(r.kind, 'owner');
    assert.equal(r.flow, r.expected); assert.equal(r.epoch, true); assert.equal(r.advanced, true);
  });
  await check('switching away and back to the owner preset retains a non-owner Daikin head', async () => {
    const r = await page.evaluate(`(()=>{const {store}=qa;store.setOutdoorKind('3MXM52N2V1B8');store.setOutdoorKind('owner');return store.state.cfg.rooms.find(r=>r.name.startsWith('Upstairs')).indoorClass;})()`);
    assert.equal(r, 'FTXM50A2V1B');
  });
  assert.deepEqual(page.events.filter(e => e.method === 'Runtime.exceptionThrown'), []);
  await writeFile('reviews/owner-indoor-choice-browser-results.json', JSON.stringify({ checkedAt: new Date().toISOString(), checks }, null, 2) + '\n');
} finally { await page.close(); await dev.close(); }
