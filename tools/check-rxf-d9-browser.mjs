// This checkout gets its own immutable Vite snapshot and QA tab.
import {writeFile} from 'node:fs/promises';
import {openPage} from './browser-session.mjs';
import {startIsolatedDev} from './isolated-dev.mjs';
const dev=await startIsolatedDev(5218),page=await openPage(dev.url,1600,1000);
try {
 await page.waitFor(`document.querySelector('.ou-model-select')`);
 await page.evaluate(`(async()=>{const [{store},{simulation},equipment,i18n]=await Promise.all([import('/src/state.ts'),import('/src/runtime/view.ts'),import('/src/equipment.ts'),import('/src/i18n.ts')]);i18n.setLanguage('en');globalThis.rxfQA={store,simulation,equipment,i18n,checks:[]};store.setOutdoorKind('generic');store.setUnitCount(1);store.update(s=>{s.cfg.live.outdoorAirMassFlowKgs=.73;s.cfg.rooms[0].setpointC=22;s.cfg.rooms[0].surfaceM2=45;});})()`);
 await page.waitFor(`rxfQA.simulation.status.output?.simulatedSeconds>2`,40000);
 await page.evaluate(`(()=>{
  const {store,simulation,equipment,i18n,checks}=rxfQA,expect=(ok,name)=>{if(!ok)throw Error(name);checks.push(name)};
  store.update(s=>{s.ui.paused=true});
  const before={live:JSON.stringify(store.state.cfg.live),epoch:store.resetEpoch,pool:store.state.cfg.rooms.length,seconds:simulation.status.output.simulatedSeconds};rxfQA.before=before;
  const choose=id=>{const select=document.querySelector('.ou-model-select');select.value=id;select.dispatchEvent(new Event('change',{bubbles:true}))};
  for(const size of [60,71]) {
   const id='RXF'+size+'D5V1B9';choose(id);
   expect(store.state.cfg.outdoorKind===id,'native exact '+id+' selection');
   expect(store.state.cfg.rooms[0].indoorClass==='FTXF'+size+'F2V1B','only exact published matching head '+size);
   expect(store.state.cfg.rooms[0].setpointC===22&&store.state.cfg.rooms[0].surfaceM2===45&&store.state.cfg.rooms.length===before.pool,'room settings and inactive pool preserved '+size);
   expect(store.resetEpoch===before.epoch&&JSON.stringify(store.state.cfg.live)===before.live,'history and manual cycle parameters preserved '+size);
   expect(store.state.cfg.outdoorVolumetricAirFlowM3s===undefined&&store.state.cfg.live.outdoorAirMassFlowKgs===.73,'unpublished outdoor flow preserves manual fallback '+size);
   expect(store.state.cfg.rooms[0].volumetricAirFlowM3s>0,'existing source-qualified indoor volume flow applied '+size);
   const info=equipment.outdoorModelInfo(store.state.cfg);
   expect(info.marketScope==='Europe; France availability unverified'&&info.sourceStatus==='availability-unknown','Europe scope does not claim France/current availability '+size);
  }
  document.querySelector('[aria-label="Outdoor unit settings"]').click();
  expect(document.querySelector('[data-pop="outdoor"]:not([hidden])').textContent.includes('France availability and current sales status are unknown'),'persistent English source availability note');
  expect(document.querySelector('[data-pop="outdoor"]').textContent.includes('outdoor wet-bulb'),'WB rating is labeled independently from DB');
  i18n.setLanguage('fr');
  expect(document.querySelector('[data-pop="outdoor"]').textContent.includes('Disponibilité en France et commercialisation actuelle inconnues'),'source scope note translates to French');
  expect(document.querySelector('[data-pop="outdoor"]').textContent.includes('Europe ; disponibilité en France non vérifiée'),'source region translated within dynamic fact');
 })()`);
 await page.waitFor(`rxfQA.simulation.status.output?.simulatedSeconds>=rxfQA.before.seconds`,40000);
 await page.evaluate(`rxfQA.checks.push('same-port model selection retains simulated time after configuration acknowledgement')`);
 const exceptions=page.events.filter(e=>e.method==='Runtime.exceptionThrown');if(exceptions.length)throw Error(JSON.stringify(exceptions));
 const checks=await page.evaluate('rxfQA.checks');
 await writeFile(new URL('../reviews/rxf-d9-isolated-browser-results.json',import.meta.url),JSON.stringify({checkedAt:new Date().toISOString(),origin:dev.url,checks,exceptions,scope:'exact European monosplit facts; unknown France sales availability; generic physics retained'},null,2)+'\n');
 console.log(JSON.stringify({checksPassed:checks.length,exceptions:exceptions.length}));
} finally {await page.close();await dev.close()}
