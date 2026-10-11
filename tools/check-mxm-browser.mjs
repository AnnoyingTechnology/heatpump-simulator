// Scoped native browser QA against an isolated development origin; never mutates application sources.
import { writeFile } from 'node:fs/promises';
import { openPage } from './browser-session.mjs';
import { startIsolatedDev } from './isolated-dev.mjs';
const dev=process.env.HEATPUMP_CATALOGUE_ORIGIN ? null : await startIsolatedDev(5216);
const origin=process.env.HEATPUMP_CATALOGUE_ORIGIN ?? dev.url;
const page=await openPage(origin,1600,1000);
try {
 await page.waitFor(`document.querySelector('.ou-model-select')`);
 await page.evaluate(`(async()=>{const i18n=await import('/src/i18n.ts');i18n.setLanguage('en');})()`);
 await page.evaluate(`(async()=>{const [{store},{simulation},equipment,{engineConfigFromUi},i18n]=await Promise.all([import('/src/state.ts'),import('/src/runtime/view.ts'),import('/src/equipment.ts'),import('/src/runtime/config.ts'),import('/src/i18n.ts')]);globalThis.catalogueQA={store,simulation,equipment,engineConfigFromUi,i18n,checks:[]};store.update(s=>{s.cfg.live.outdoorAirMassFlowKgs=.73;s.cfg.live.indoorAirMassFlowKgs=.16;});})()`);
 await page.waitFor(`catalogueQA.simulation.status.output?.simulatedSeconds>2`,40000);
 const checks=await page.evaluate(`(()=>{
  const {store,simulation,equipment,engineConfigFromUi,checks}=catalogueQA;
  const expect=(condition,name)=>{if(!condition)throw Error(name);checks.push(name)};
  store.update(s=>{s.ui.paused=true;});
  const before={rooms:JSON.stringify(store.state.cfg.rooms),pipes:JSON.stringify(store.state.cfg.pipes),live:JSON.stringify(store.state.cfg.live),epoch:store.resetEpoch,time:simulation.status.output.simulatedSeconds,engine:JSON.stringify(engineConfigFromUi(store.state.cfg,store.state.cfg.live))};
  const choose=(value)=>{const e=document.querySelector('select[aria-label="Outdoor model"]');e.value=value;e.dispatchEvent(new Event('change',{bubbles:true}))};
  choose('3MXM52A2V1B8');
  expect(store.state.cfg.outdoorKind==='3MXM52A2V1B8','native outdoor select applies exact MXM reference');
  expect(JSON.stringify(store.state.cfg.rooms)===before.rooms,'all room identities, temperatures, targets, enabled states and settings preserved');
  expect(JSON.stringify(store.state.cfg.pipes)===before.pipes,'all line settings preserved');
  expect(JSON.stringify(store.state.cfg.live)===before.live,'manual generic physics and charge controls preserved');
  expect(store.resetEpoch===before.epoch,'ordinary model selection does not request a reset');
  expect(JSON.stringify(engineConfigFromUi(store.state.cfg,store.state.cfg.live))===before.engine,'same-port metadata selection leaves thermodynamic configuration unchanged');
  expect(simulation.status.output.simulatedSeconds>=before.time,'accepted simulated time retained');
  expect(document.querySelector('[data-installation-status]').textContent.includes('exact OEM combination: unknown'),'unknown exact eligibility visible on outdoor card');
  expect(document.querySelector('.room-rp select').value===store.state.cfg.rooms[0].indoorClass,'existing owner head remains visibly selected');
  choose('2MXM40A2V1B9');
  expect(store.state.cfg.outdoorKind==='3MXM52A2V1B8'&&store.state.cfg.unitCount===3,'three-head house is not silently changed to a two-port topology');
  expect(store.resetEpoch===before.epoch,'rejected model selection does not reset history');
  const button=[...document.querySelectorAll('.room-rp button')].find(e=>e.textContent==='Settings');button.click();
    expect(document.querySelector('select[aria-label="Installed refrigerant port"]')!==null,'installation controls available via indoor Settings');
  const installationDetails=[...document.querySelectorAll('details')].find(e=>e.querySelector('summary')?.textContent==='Installation declarations');installationDetails.open=true;
  const change=(label,value)=>{const e=document.querySelector('[aria-label="'+label+'"]');e.value=value;e.dispatchEvent(new Event('change',{bubbles:true}))};
  change('Installed refrigerant port','A');change('Declared connection class','25');change('Declared connected capacity contribution (kW)','2.5');change('Installed reducer','none');
  expect(store.state.cfg.rooms[0].installation.portId==='A'&&store.state.cfg.rooms[0].installation.connectedCapacityKw===2.5,'native installation controls update the bound room');
  store.setHeadInstallation(1,{portId:'B',capacityClass:35,connectedCapacityKw:3.5,reducer:'2+4'});
  store.setHeadInstallation(2,{portId:'C',capacityClass:25,connectedCapacityKw:2.5,reducer:'2+4'});
  const valid=equipment.currentInstallationValidation(store.state.cfg);expect(valid.topologyStatus==='valid'&&valid.status==='unknown','valid declared constraints never turn exact OEM eligibility green');
  expect(store.resetEpoch===before.epoch&&JSON.stringify(store.state.cfg.live)===before.live,'installation declarations neither reset nor calibrate cycle/charge');
  store.update(s=>{s.cfg.rooms[1].enabled=false});expect(equipment.currentInstallationValidation(store.state.cfg).topologyStatus==='valid','Off head remains an installed connection');
  const count=store.state.cfg.unitCount;store.removeRoom(0);const removed=store.state.cfg.rooms[count-1];store.addRoom();expect(store.state.cfg.rooms[count-1]===removed,'explicit room removal and re-add preserve inactive pool identity');
  store.removeRoom(0);const minimumEpoch=store.resetEpoch;store.removeRoom(0);expect(store.state.cfg.unitCount===2&&store.resetEpoch===minimumEpoch,'published minimum prevents deleting last required connected head without forcing it to run');
  store.setOutdoorKind('2MXM50A2V1B8');expect(store.state.cfg.unitCount===2,'matching-count model selection preserves connected count');
  [...document.querySelectorAll('.room-rp button')].find(e=>e.textContent==='Settings').click();
  expect(document.querySelector('[aria-label="Installed refrigerant port"]').value==='C','old unavailable port declaration remains visibly selected after model change');
  const initial=store.resetEpoch;store.setHeadInstallation(0,{portId:'A',capacityClass:42,connectedCapacityKw:4.2,reducer:'none',guideNamedIndoorClass:'FTXA42C'});
  store.setIndoorClass(0,'FTXA42D2V1BC');expect(store.state.cfg.rooms[0].installation.guideNamedIndoorClass===undefined,'changing exact indoor identity clears stale named-class declaration');
  expect(store.resetEpoch===initial,'head profile change does not reset history');
  const classBefore=store.state.cfg.rooms[0].installation.capacityClass;store.setHeadInstallation(0,{capacityClass:999});expect(store.state.cfg.rooms[0].installation.capacityClass===classBefore,'invalid declaration rejected at store boundary');
  const settings=document.querySelector('[aria-label="Outdoor unit settings"]');settings.click();expect(document.querySelector('[data-pop="outdoor"]:not([hidden])').textContent.includes('documentary limits'),'outdoor Settings show charge caps as documentary without lookup errors');
  catalogueQA.i18n.setLanguage('fr');expect(document.querySelector('[data-installation-status]').textContent.includes('combinaison constructeur exacte'),'persistent installation status switches to French');
  expect(document.querySelector('[aria-label="Modèle extérieur"]')!==null,'native outdoor model accessibility label switches to French');
  catalogueQA.finalTime=simulation.status.output?.simulatedSeconds;return checks;
 })()`);
 await page.screenshot(new URL('../reviews/mxm-isolated-browser.png',import.meta.url).pathname);
 await page.evaluate(`(()=>{const {store,checks}=catalogueQA;const expect=(condition,name)=>{if(!condition)throw Error(name);checks.push(name)};catalogueQA.i18n.setLanguage('en');  store.setOutdoorKind('generic');store.setRefrigerant('R290');expect(store.state.cfg.live.refrigerant==='R290','parent generic-fluid control retained');
  const fluidEpoch=store.resetEpoch;store.setOutdoorKind('2MXM40A2V1B9');expect(store.state.cfg.live.refrigerant==='R32'&&store.resetEpoch===fluidEpoch+1,'published equipment preserves parent R32 qualification and deliberate fluid-change reset');
return checks;})()`);
 for(const [width,height] of [[1280,720],[1366,768],[1600,1000],[1920,1080]]) {
  await page.send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:false});
  for(const language of ['en','fr']) for(const theme of ['light','dark']) {
   await page.evaluate(`(()=>{catalogueQA.i18n.setLanguage(${JSON.stringify(language)});const e=document.querySelector('.th-select');e.value=${JSON.stringify(theme)};e.dispatchEvent(new Event('change',{bubbles:true}));})()`);
   await page.evaluate(`(()=>{const card=document.querySelector('.ou'),scene=document.querySelector('.scene-scroll');if(card.scrollHeight>card.clientHeight+1||scene.scrollHeight>scene.clientHeight+1)throw Error('MXM card/scene overflow');catalogueQA.checks.push('MXM layout ${width}x${height} ${language} ${theme}');})()`);
  }
 }
 const exceptions=page.events.filter(e=>e.method==='Runtime.exceptionThrown').map(e=>e.params);
 if(exceptions.length)throw Error('Unexpected browser exceptions: '+JSON.stringify(exceptions));
 const result={checkedAt:new Date().toISOString(),origin,checks:await page.evaluate('catalogueQA.checks'),exceptions,scope:'isolated store/native controls; generic physics; no OEM combination claim'};
 await writeFile(new URL('../reviews/mxm-isolated-browser-results.json',import.meta.url),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify({checksPassed:await page.evaluate('catalogueQA.checks.length'),exceptions:exceptions.length}));
}finally{await page.close();await dev?.close()}
