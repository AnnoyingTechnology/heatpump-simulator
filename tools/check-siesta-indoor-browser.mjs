import {writeFile} from 'node:fs/promises';
import {openPage} from './browser-session.mjs';
import {startIsolatedDev} from './isolated-dev.mjs';
const dev=await startIsolatedDev(5219),page=await openPage(dev.url,1600,1000);
try {
 await page.waitFor(`document.querySelector('.ou-model-select')`);
 await page.evaluate(`(async()=>{const [{store},{simulation},equipment,{engineConfigFromUi},i18n]=await Promise.all([import('/src/state.ts'),import('/src/runtime/view.ts'),import('/src/equipment.ts'),import('/src/runtime/config.ts'),import('/src/i18n.ts')]);i18n.setLanguage('en');globalThis.siestaQA={store,simulation,equipment,engineConfigFromUi,i18n,checks:[]};store.setOutdoorKind('generic');store.setUnitCount(1);store.update(s=>{s.cfg.rooms[0].surfaceM2=43;s.cfg.rooms[0].setpointC=21.5;});})()`);
 await page.waitFor(`siestaQA.simulation.status.output?.simulatedSeconds>2`,40000);
 await page.evaluate(`(()=>{
  const {store,equipment,simulation,engineConfigFromUi,checks,i18n}=siestaQA,expect=(ok,name)=>{if(!ok)throw Error(name);checks.push(name)};
  store.update(s=>{s.ui.paused=true});
  const before={live:JSON.stringify(store.state.cfg.live),epoch:store.resetEpoch,pool:store.state.cfg.rooms.length,seconds:simulation.status.output.simulatedSeconds};siestaQA.before=before;
  const select=document.querySelector('.eq-model'),options=[...select.options].filter(o=>/^ATXM|^ATXP|^ATXF/.test(o.value));
  expect(options.length===18,'18 exact Siesta references exposed by native generic indoor select');
  expect(options.every(o=>o.textContent.includes('availability unverified')),'every new exact reference keeps availability unverified');
  for(const option of options){
   select.value=option.value;select.dispatchEvent(new Event('change',{bubbles:true}));
   const room=store.state.cfg.rooms[0],profile=equipment.indoorModelProfile(option.value),cfg=engineConfigFromUi(store.state.cfg,store.state.cfg.live);
   expect(room.indoorClass===option.value&&Math.abs(cfg.rooms[0].volumetricAirFlowM3s*3600-profile.coolingHighFanFlowM3h)<1e-8,'native '+option.value+' applies only reviewed volumetric airflow');
   expect(room.surfaceM2===43&&room.setpointC===21.5&&store.state.cfg.rooms.length===before.pool&&store.resetEpoch===before.epoch&&JSON.stringify(store.state.cfg.live)===before.live,'room/pool/history/manual cycle retained '+option.value);
  }
  [...document.querySelectorAll('.room-rp button')].find(b=>b.textContent==='Settings').click();
  expect(document.querySelector('[data-pop="room"]:not([hidden])').textContent.includes('current retail availability is unverified'),'France-source availability boundary visible in indoor Settings');
  i18n.setLanguage('fr');
  expect(document.querySelector('[data-pop="room"]').textContent.includes('disponibilité commerciale actuelle non vérifiée'),'France-source availability note translates to French');
  expect(document.querySelector('.eq-model').selectedOptions[0].textContent.includes('disponibilité non vérifiée'),'availability marker translated in permanent native model control');
  i18n.setLanguage('en');
  store.setOutdoorKind('RXF60D5V1B9');
  expect(store.state.cfg.rooms[0].indoorClass==='FTXF60F2V1B'&&![...document.querySelector('.eq-model').options].some(o=>o.value==='ATXF60F2V1B'),'RXF pairing does not alias a distinct ATXF head');
  store.setOutdoorKind('generic');store.setUnitCount(3);store.setOutdoorKind('3MXM52A2V1B8');store.setIndoorClass(0,'ATXM25A5V1B');
  expect(equipment.currentInstallationValidation(store.state.cfg).eligibilityStatus==='unknown','Siesta exact heads do not certify current multiport full-SKU eligibility');
  expect(document.querySelector('[data-installation-status]').textContent.includes('exact OEM combination: unknown'),'unverified multisplit status remains permanently visible');
  store.update(s=>{s.ui.paused=false});
 })()`);
 await page.waitFor(`siestaQA.simulation.status.output?.simulatedSeconds>siestaQA.before.seconds`,40000);
 await page.evaluate(`(()=>{if(siestaQA.simulation.status.output.state==='fault')throw Error('source-profile runtime fault');siestaQA.checks.push('new profile airflow completes a physical worker step without history restart or fault')})()`);
 const exceptions=page.events.filter(e=>e.method==='Runtime.exceptionThrown');if(exceptions.length)throw Error(JSON.stringify(exceptions));
 const checks=await page.evaluate('siestaQA.checks');
 await writeFile(new URL('../reviews/siesta-isolated-browser-results.json',import.meta.url),JSON.stringify({checkedAt:new Date().toISOString(),origin:dev.url,checks,exceptions,scope:'source-qualified exact indoor fields; no inferred outdoor aliases or OEM performance calibration'},null,2)+'\n');
 console.log(JSON.stringify({checksPassed:checks.length,exceptions:exceptions.length}));
}finally{await page.close();await dev.close()}
