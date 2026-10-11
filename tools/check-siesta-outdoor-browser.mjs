import {writeFile} from 'node:fs/promises';
import {openPage} from './browser-session.mjs';
import {startIsolatedDev} from './isolated-dev.mjs';
const dev=await startIsolatedDev(5222),page=await openPage(dev.url,1600,1000);
try{
 await page.waitFor(`document.querySelector('.ou-model-select')`);
 await page.evaluate(`(async()=>{const [{store},{simulation},equipment,{engineConfigFromUi},i18n]=await Promise.all([import('/src/state.ts'),import('/src/runtime/view.ts'),import('/src/equipment.ts'),import('/src/runtime/config.ts'),import('/src/i18n.ts')]);i18n.setLanguage('en');globalThis.siestaOutdoorQA={store,simulation,equipment,engineConfigFromUi,i18n,checks:[]};store.setOutdoorKind('generic');store.setUnitCount(1);store.update(s=>{s.cfg.live.outdoorAirMassFlowKgs=.79;s.cfg.rooms[0].surfaceM2=45;s.cfg.rooms[0].setpointC=22;});})()`);
 await page.waitFor(`siestaOutdoorQA.simulation.status.output?.simulatedSeconds>2`,40000);
 await page.evaluate(`(()=>{
 const {store,simulation,equipment,engineConfigFromUi,i18n,checks}=siestaOutdoorQA,expect=(ok,name)=>{if(!ok)throw Error(name);checks.push(name)};
 store.update(s=>{s.ui.paused=true});
 const before={live:JSON.stringify(store.state.cfg.live),epoch:store.resetEpoch,pool:JSON.stringify(store.state.cfg.rooms.slice(1)),seconds:simulation.status.output.simulatedSeconds};siestaOutdoorQA.before=before;
 const choose=id=>{const select=document.querySelector('.ou-model-select');select.value=id;select.dispatchEvent(new Event('change',{bubbles:true}))};
 const models=['ARXM25A5V1B','ARXM35A5V1B','ARXM50A5V1B','ARXF20F5V1B','ARXF25F5V1B','ARXF35F5V1B','ARXF42F5V1B','ARXF50F5V1B','ARXF60A5V1B9','ARXF71A5V1B9'];
 for(const id of models){
  choose(id);const room=store.state.cfg.rooms[0],model=equipment.outdoorModelInfo(store.state.cfg),cfg=engineConfigFromUi(store.state.cfg,store.state.cfg.live);
  const options=equipment.indoorOptionsForOutdoor(id);
  expect(store.state.cfg.outdoorKind===id&&options.length===(id.startsWith('ARXM')?2:1),'native exact outdoor and published head count '+id);
  expect(room.surfaceM2===45&&room.setpointC===22&&JSON.stringify(store.state.cfg.rooms.slice(1))===before.pool,'room settings and inactive pool retained '+id);
  expect(store.resetEpoch===before.epoch&&JSON.stringify(store.state.cfg.live)===before.live,'history and manual cycle configuration retained '+id);
  expect(cfg.outdoor.airMassFlowKgs===.79&&cfg.outdoor.volumetricAirFlowM3s===undefined,'unknown outdoor high fan retains manual mass flow '+id);
  expect(model.sourceStatus==='availability-unknown'&&model.marketScope.startsWith(id.startsWith('ARXM')||id.endsWith('A5V1B9')?'France':'Europe'),'exact primary region without current-stock claim '+id);
  for(const opt of options){const select=document.querySelector('.eq-model');select.value=opt.value;select.dispatchEvent(new Event('change',{bubbles:true}));const r=store.state.cfg.rooms[0],profile=equipment.indoorModelProfile(r.indoorClass);expect(r.indoorClass===opt.value&&opt.value.startsWith('ATX')&&Math.abs(r.volumetricAirFlowM3s*3600-profile.coolingHighFanFlowM3h)<1e-8,'exact head suffix and existing published flow '+opt.value);}
 }
 expect(!equipment.indoorOptionsForOutdoor('ARXM25A5V1B').some(o=>o.value.startsWith('FTXM'))&&!equipment.indoorOptionsForOutdoor('RXM25A5V1B9').some(o=>o.value.startsWith('ATXM')),'ARXM and RXM have distinct partner lists');
 expect(!equipment.indoorOptionsForOutdoor('ARXF60A5V1B9').some(o=>o.value.startsWith('FTXF'))&&!equipment.indoorOptionsForOutdoor('RXF60D5V1B9').some(o=>o.value.startsWith('ATXF')),'ARXF and RXF have distinct partner lists');
 choose('ARXM50A5V1B');const ranges=equipment.outdoorModelInfo(store.state.cfg).publishedOperatingRangesC;
 expect(ranges.cooling.maximum===null&&ranges.heating.minimum===null&&ranges.cooling.minimum===-10&&ranges.heating.maximum===18,'footnoted alternative bounds stay null and known bounds stay numeric');
 document.querySelector('[aria-label="Outdoor unit settings"]').click();const pop=document.querySelector('[data-pop="outdoor"]:not([hidden])');
 expect(pop.textContent.includes('cooling -10…unknown °C')&&pop.textContent.includes('heating unknown…18 °C'),'English individual unknown limits display without zero substitution');
 expect(pop.textContent.includes('dry-bulb')&&pop.textContent.includes('wet-bulb')&&!pop.textContent.includes('NaN'),'English DB/WB conditions retained without NaN');
 expect(pop.textContent.includes('France technical table; current availability unverified'),'France source scope is explicit and not relabeled Europe');
 i18n.setLanguage('fr');expect(pop.textContent.includes('froid -10…inconnu °C')&&pop.textContent.includes('chauffage inconnu…18 °C'),'French individual null bounds translate to inconnu');
 expect(pop.textContent.includes('température sèche extérieure')&&pop.textContent.includes('température humide extérieure'),'French DB/WB source conditions are legible');
 expect(document.querySelector('.ou-model-select').selectedOptions[0].textContent.includes('table française'),'native outdoor source-region marker translates');
 i18n.setLanguage('en');store.update(s=>{s.ui.paused=false});
 })()`);
 await page.waitFor(`siestaOutdoorQA.simulation.status.output?.simulatedSeconds>siestaOutdoorQA.before.seconds`,40000);
 const exceptions=page.events.filter(e=>e.method==='Runtime.exceptionThrown');if(exceptions.length)throw Error(JSON.stringify(exceptions));
 const checks=await page.evaluate(`(()=>{if(siestaOutdoorQA.simulation.status.output.state==='fault')throw Error('Siesta outdoor profile worker fault');siestaOutdoorQA.checks.push('exact Siesta profile completes physical worker step with elapsed history retained');return siestaOutdoorQA.checks})()`);
 await writeFile(new URL('../reviews/siesta-outdoor-isolated-browser-results.json',import.meta.url),JSON.stringify({checkedAt:new Date().toISOString(),origin:dev.url,checks,exceptions,scope:'ten exact Siesta outdoor refs/thirteen exact head pairs; unknown individual ambient bounds preserved; generic physics/inventory; no France-stock assertion'},null,2)+'\n');
 console.log(JSON.stringify({checksPassed:checks.length,exceptions:exceptions.length}));
}finally{await page.close();await dev.close()}
