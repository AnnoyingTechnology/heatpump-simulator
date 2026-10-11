// Independent snapshot of the current checkout; no dependency on another agent's dev server.
import {writeFile} from 'node:fs/promises';
import {openPage} from './browser-session.mjs';
import {startIsolatedDev} from './isolated-dev.mjs';
const dev=await startIsolatedDev(5217),page=await openPage(dev.url,1600,1000);
try{
 await page.waitFor(`document.querySelector('.ou-model-select')`);
 await page.evaluate(`(async()=>{const [{store},{simulation},equipment,{engineConfigFromUi},i18n]=await Promise.all([import('/src/state.ts'),import('/src/runtime/view.ts'),import('/src/equipment.ts'),import('/src/runtime/config.ts'),import('/src/i18n.ts')]);i18n.setLanguage('en');globalThis.legacyQA={store,simulation,equipment,engineConfigFromUi,i18n,checks:[]};store.update(s=>{s.cfg.live.outdoorAirMassFlowKgs=.73;});})()`);
 await page.waitFor(`legacyQA.simulation.status.output?.simulatedSeconds>2`,40000);
 await page.evaluate(`(()=>{
  const {store,simulation,equipment,engineConfigFromUi,checks,i18n}=legacyQA,expect=(ok,name)=>{if(!ok)throw Error(name);checks.push(name)};
  store.update(s=>{s.ui.paused=true});
  const before={rooms:JSON.stringify(store.state.cfg.rooms),live:JSON.stringify(store.state.cfg.live),epoch:store.resetEpoch,seconds:simulation.status.output.simulatedSeconds,engine:JSON.stringify(engineConfigFromUi(store.state.cfg,store.state.cfg.live))};
  const choose=(id)=>{const select=document.querySelector('[aria-label="Outdoor model"]');select.value=id;select.dispatchEvent(new Event('change',{bubbles:true}))};
  choose('3MXM52N2V1B8');
  expect(store.state.cfg.outdoorKind==='3MXM52N2V1B8','exact source-listed legacy N8 reference selected by native control');
  expect(JSON.stringify(store.state.cfg.rooms)===before.rooms&&store.resetEpoch===before.epoch,'all rooms and history retained for legacy selection');
  expect(JSON.stringify(store.state.cfg.live)===before.live&&JSON.stringify(engineConfigFromUi(store.state.cfg,store.state.cfg.live))===before.engine,'legacy metadata does not change cycle parameters or manual charge');
  expect(simulation.status.output.simulatedSeconds>=before.seconds,'accepted time retained for same-port source metadata');
  const model=equipment.outdoorModelInfo(store.state.cfg);expect(model.installation.minimumConnectedHeads===null&&model.installation.ports===null,'unpublished connected minimum and per-port rules remain null');
  expect(model.publishedOperatingRangesC.heating.minimum===null&&model.publishedOperatingRangesC.cooling.maximum===46,'N8 missing heating bounds are not borrowed from A or N peers');
  expect(equipment.currentInstallationValidation(store.state.cfg).status==='unknown','unknown N-generation constraints cannot become OEM approval');
  document.querySelector('[aria-label="Outdoor unit settings"]').click();
  expect(document.querySelector('[data-pop="outdoor"]:not([hidden])').textContent.includes('heating unknown…unknown'),'outdoor Settings display unpublished range endpoints without fabricated numbers');
  [...document.querySelectorAll('.room-rp button')].find(e=>e.textContent==='Settings').click();
  expect(document.querySelector('[aria-label="Installed refrigerant port"]').disabled,'missing port source cannot expose fabricated port alternatives');
  choose('2MXM40N2V1B');expect(store.state.cfg.outdoorKind==='3MXM52N2V1B8'&&store.state.cfg.unitCount===3,'two-head maximum never silently removes a third room');
  store.removeRoom(2);choose('2MXM40N2V1B');expect(store.state.cfg.outdoorKind==='2MXM40N2V1B'&&store.state.cfg.unitCount===2,'two-head legacy selection accepts explicit topology change');
  store.removeRoom(1);expect(store.state.cfg.unitCount===1&&equipment.currentInstallationValidation(store.state.cfg).status==='unknown','unpublished minimum does not inherit A-generation two-head rule or certify one-head installation');
  const epoch=store.resetEpoch,rooms=JSON.stringify(store.state.cfg.rooms);store.setOutdoorKind('3MXM68N2V1B');
  expect(store.resetEpoch===epoch&&JSON.stringify(store.state.cfg.rooms)===rooms,'another legacy profile preserves installed pool and history');
  expect(store.state.cfg.outdoorVolumetricAirFlowM3s===undefined&&store.state.cfg.live.outdoorAirMassFlowKgs===.73,'published super-low fan airflow never replaces generic high-fan/manual flow');
  expect(equipment.outdoorModelInfo(store.state.cfg).publishedOperatingRangesC.heating.maximum===18,'source-qualified standard N heating range stays distinct from N8 unknown range');
  i18n.setLanguage('fr');expect(document.querySelector('[data-installation-status]').textContent.includes('combinaison constructeur exacte : inconnu'),'legacy persistent unknown status translates to French');
  legacyQA.model=store.state.cfg.outdoorKind;
 })()`);
 await page.screenshot(new URL('../reviews/legacy-mxm-isolated-browser.png',import.meta.url).pathname);
 const exceptions=page.events.filter(e=>e.method==='Runtime.exceptionThrown');if(exceptions.length)throw Error(JSON.stringify(exceptions));
 const checks=await page.evaluate('legacyQA.checks');
 await writeFile(new URL('../reviews/legacy-mxm-isolated-browser-results.json',import.meta.url),JSON.stringify({checkedAt:new Date().toISOString(),origin:dev.url,checks,exceptions,scope:'exact legacy metadata; no OEM combination or performance calibration'},null,2)+'\n');
 console.log(JSON.stringify({checksPassed:checks.length,exceptions:exceptions.length}));
}finally{await page.close();await dev.close()}
