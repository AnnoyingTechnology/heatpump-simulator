import {writeFile} from 'node:fs/promises';
import {openPage} from './browser-session.mjs';
import {startIsolatedDev} from './isolated-dev.mjs';
const dev=await startIsolatedDev(5221),page=await openPage(dev.url,1600,1000);
try{
 await page.waitFor(`document.querySelector('.ou-model-select')`);
 await page.evaluate(`(async()=>{const [{store},{simulation},equipment,{engineConfigFromUi},i18n]=await Promise.all([import('/src/state.ts'),import('/src/runtime/view.ts'),import('/src/equipment.ts'),import('/src/runtime/config.ts'),import('/src/i18n.ts')]);i18n.setLanguage('en');globalThis.classQA={store,simulation,equipment,engineConfigFromUi,i18n,checks:[]};store.setOutdoorKind('generic');store.setUnitCount(1);store.update(s=>{s.cfg.live.outdoorAirMassFlowKgs=.77;s.cfg.rooms[0].surfaceM2=45;s.cfg.rooms[0].setpointC=22;});})()`);
 await page.waitFor(`classQA.simulation.status.output?.simulatedSeconds>2`,40000);
 await page.evaluate(`(()=>{
 const {store,simulation,equipment,engineConfigFromUi,i18n,checks}=classQA,expect=(ok,name)=>{if(!ok)throw Error(name);checks.push(name)};
 store.update(s=>{s.ui.paused=true});
 const before={live:JSON.stringify(store.state.cfg.live),epoch:store.resetEpoch,pool:store.state.cfg.rooms.length,seconds:simulation.status.output.simulatedSeconds};classQA.before=before;
 const sizes=[20,25,35,42,50,60,71],outdoors=['RXM20A','RXM25A9','RXM35A9','RXM42A','RXM50A8','RXM60A','RXM71A'];
 for(let i=0;i<sizes.length;i++){
  const size=sizes[i],id=outdoors[i],select=document.querySelector('.ou-model-select');select.value=id;select.dispatchEvent(new Event('change',{bubbles:true}));
  const room=store.state.cfg.rooms[0],model=equipment.outdoorModelInfo(store.state.cfg),profile=equipment.indoorModelProfile(room.indoorClass),cfg=engineConfigFromUi(store.state.cfg,store.state.cfg.live),validation=equipment.currentInstallationValidation(store.state.cfg);
  expect(store.state.cfg.outdoorKind===id&&room.indoorClass==='FTXM'+size+'A','native source class pairing '+size);
  expect(model.identityKind==='published-class'&&model.acceptance==='reviewed-class-fields'&&model.label.includes('suffix unpublished'),'class identity clearly separate from factory SKU '+size);
  expect(validation.topologyStatus==='valid'&&validation.eligibilityStatus==='unknown'&&validation.status==='unknown','source class topology never approves exact OEM SKU '+size);
  expect(room.surfaceM2===45&&room.setpointC===22&&store.state.cfg.rooms.length===before.pool&&store.resetEpoch===before.epoch&&JSON.stringify(store.state.cfg.live)===before.live,'room/pool/history/manual cycle retained '+size);
  expect(cfg.outdoor.airMassFlowKgs===.77&&cfg.outdoor.volumetricAirFlowM3s===undefined,'unpublished outdoor airflow keeps manual mass setting '+size);
  expect(Math.abs(cfg.rooms[0].volumetricAirFlowM3s*3600-profile.coolingHighFanFlowM3h)<1e-8,'cooling high fan uses published volumetric flow '+size);
  expect(document.body.textContent.includes('Published class pairing · factory suffix unpublished · exact OEM combination unknown.'),'persistent class boundary outside popup '+size);
 }
 const unknown=structuredClone(store.state.cfg);unknown.rooms[0].indoorClass='FTXM20A2V1B';expect(equipment.currentInstallationValidation(unknown).topologyStatus==='unknown','full SKU is not aliased to matching class digits');
 unknown.rooms[0].indoorClass='FTXM25A';expect(equipment.currentInstallationValidation(unknown).status==='unknown','unreviewed alternative class pairing remains unknown');
 unknown.unitCount=2;expect(equipment.currentInstallationValidation(unknown).topologyStatus==='invalid','two physically connected heads violate source monosplit topology');
 const exact=equipment.outdoorModelInfo('RXM25A5V1B9');expect(exact.identityKind===undefined&&exact.acceptance==='reviewed-fields','archived exact factory reference retains original identity contract');
 const native=document.querySelector('.ou-model-select');expect(native.selectedOptions[0].textContent.includes('class; suffix unpublished'),'native outdoor choice exposes class suffix boundary');
 const indoor=document.querySelector('.eq-model');expect(indoor.selectedOptions[0].textContent.includes('class; suffix unpublished'),'native indoor choice exposes class suffix boundary');
 i18n.setLanguage('fr');expect(native.selectedOptions[0].textContent.includes('classe ; suffixe non publié')&&indoor.selectedOptions[0].textContent.includes('classe ; suffixe non publié'),'native indoor/outdoor class markers translate to French');
 expect(document.body.textContent.includes('Association de classes publiée · suffixe usine non publié · combinaison constructeur exacte inconnue.'),'persistent class boundary translates to French');
 i18n.setLanguage('en');store.update(s=>{s.ui.paused=false});
 })()`);
 await page.waitFor(`classQA.simulation.status.output?.simulatedSeconds>classQA.before.seconds`,40000);
 const exceptions=page.events.filter(e=>e.method==='Runtime.exceptionThrown');if(exceptions.length)throw Error(JSON.stringify(exceptions));
 const checks=await page.evaluate(`(()=>{if(classQA.simulation.status.output.state==='fault')throw Error('class profile worker fault');classQA.checks.push('published class completes physical worker step with retained elapsed time');return classQA.checks})()`);
 await writeFile(new URL('../reviews/perfera-class-isolated-browser-results.json',import.meta.url),JSON.stringify({checkedAt:new Date().toISOString(),origin:dev.url,checks,exceptions,scope:'published class identity and source pairing; generic performance/inventory; unknown factory suffix/full-SKU eligibility/retail availability'},null,2)+'\n');
 console.log(JSON.stringify({checksPassed:checks.length,exceptions:exceptions.length}));
}finally{await page.close();await dev.close()}
