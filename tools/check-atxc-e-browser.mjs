import {writeFile} from 'node:fs/promises';
import {openPage} from './browser-session.mjs';
import {startIsolatedDev} from './isolated-dev.mjs';
const dev=await startIsolatedDev(5220),page=await openPage(dev.url,1600,1000);
try{
 await page.waitFor(`document.querySelector('.ou-model-select')`);
 await page.evaluate(`(async()=>{const [{store},{simulation},equipment,{engineConfigFromUi},i18n]=await Promise.all([import('/src/state.ts'),import('/src/runtime/view.ts'),import('/src/equipment.ts'),import('/src/runtime/config.ts'),import('/src/i18n.ts')]);i18n.setLanguage('en');globalThis.atxcQA={store,simulation,equipment,engineConfigFromUi,i18n,checks:[]};store.setOutdoorKind('generic');store.setUnitCount(1);store.update(s=>{s.cfg.live.outdoorAirMassFlowKgs=.77;s.cfg.rooms[0].surfaceM2=45;s.cfg.rooms[0].setpointC=22;});})()`);
 await page.waitFor(`atxcQA.simulation.status.output?.simulatedSeconds>2`,40000);
 await page.evaluate(`(()=>{
 const {store,simulation,equipment,engineConfigFromUi,i18n,checks}=atxcQA,expect=(ok,name)=>{if(!ok)throw Error(name);checks.push(name)};
 store.update(s=>{s.ui.paused=true});
 const before={live:JSON.stringify(store.state.cfg.live),epoch:store.resetEpoch,pool:store.state.cfg.rooms.length,seconds:simulation.status.output.simulatedSeconds};atxcQA.before=before;
 for(const size of [20,25,35,50,60,71]){
  const id='ARXC'+size+'EV1B',select=document.querySelector('.ou-model-select');select.value=id;select.dispatchEvent(new Event('change',{bubbles:true}));
  const room=store.state.cfg.rooms[0],model=equipment.outdoorModelInfo(store.state.cfg),profile=equipment.indoorModelProfile(room.indoorClass),cfg=engineConfigFromUi(store.state.cfg,store.state.cfg.live);
  expect(store.state.cfg.outdoorKind===id&&room.indoorClass==='ATXC'+size+'EV1B','native exact EV1B one-to-one pairing '+size);
  expect(room.surfaceM2===45&&room.setpointC===22&&store.state.cfg.rooms.length===before.pool&&store.resetEpoch===before.epoch&&JSON.stringify(store.state.cfg.live)===before.live,'room/pool/history/manual cycle retained '+size);
  expect(store.state.cfg.outdoorVolumetricAirFlowM3s===undefined&&cfg.outdoor.airMassFlowKgs===.77,'unpublished outdoor airflow preserves manual mass flow '+size);
  expect(Math.abs(cfg.rooms[0].volumetricAirFlowM3s*3600-profile.coolingHighFanFlowM3h)<1e-8,'source-published indoor high flow uses volumetric engine path '+size);
  expect(model.publishedOperatingRangesC.cooling.minimum===(size<50?10:-10)&&model.publishedOperatingRangesC.heating.condition==='outdoor wet-bulb','positive DB cooling minimum and WB heating labels preserved '+size);
 }
 [...document.querySelectorAll('.room-rp button')].find(b=>b.textContent==='Settings').click();
 const pop=document.querySelector('[data-pop="room"]:not([hidden])');
 expect(pop.textContent.includes('Source scope: Europe; France availability unverified'),'EU head is not mislabeled as France technical table');
 i18n.setLanguage('fr');
 expect(pop.textContent.includes('Europe ; disponibilité en France non vérifiée'),'EU source scope translates within indoor model facts');
 store.update(s=>{s.ui.paused=false});
 })()`);
 await page.waitFor(`atxcQA.simulation.status.output?.simulatedSeconds>atxcQA.before.seconds`,40000);
 const exceptions=page.events.filter(e=>e.method==='Runtime.exceptionThrown');if(exceptions.length)throw Error(JSON.stringify(exceptions));
 const checks=await page.evaluate(`(()=>{if(atxcQA.simulation.status.output.state==='fault')throw Error('ATXC profile step fault');atxcQA.checks.push('exact ATXC pair completes worker step with retained elapsed time');return atxcQA.checks})()`);
 await writeFile(new URL('../reviews/atxc-e-isolated-browser-results.json',import.meta.url),JSON.stringify({checkedAt:new Date().toISOString(),origin:dev.url,checks,exceptions,scope:'exact EV1B Europe pairs; generic performance/inventory; unknown France availability'},null,2)+'\n');
 console.log(JSON.stringify({checksPassed:checks.length,exceptions:exceptions.length}));
}finally{await page.close();await dev.close()}
