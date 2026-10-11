import assert from 'node:assert/strict';import{writeFile}from'node:fs/promises';
import{openPage}from'./browser-session.mjs';import{startIsolatedDev}from'./isolated-dev.mjs';
const dev=await startIsolatedDev(5214),page=await openPage(dev.url),checks=[];
const run=fn=>page.evaluate(`(${fn.toString()})()`);const check=async(name,fn)=>{await fn();checks.push({name,passed:true});console.log('PASS '+name)};
const settle=()=>page.waitFor('!qv.simulation.isBusy && qv.simulation.status.output',30000);
try{
 await page.waitFor('!!document.querySelector(".language-select")');
 await run(async()=>{const m=await fetch('/src/main.ts').then(r=>r.text());globalThis.qa=await import(m.match(/from "([^"]*\/state\.ts[^"]*)"/)[1]);globalThis.qv=await import(m.match(/from "([^"]*\/runtime\/view\.ts[^"]*)"/)[1]);globalThis.qi=await import('/src/i18n.ts');qi.setLanguage('en');qa.store.update(s=>s.ui.paused=true)});await settle();
 await run(()=>qv.simulation.step(10));await settle();
 await check('French switch translates readings, controls and accessible labels without changing the physical session or focused input',async()=>{
  const before=await run(()=>{globalThis.held=document.querySelector('[aria-label="Outdoor air"] input[type="number"]');held.focus();held.value='2.5';return {cfg:JSON.stringify(qa.store.state.cfg),epoch:qa.store.resetEpoch,output:JSON.stringify(qv.simulation.status.output),paths:[...document.querySelectorAll('.room-chart-actual,.room-chart-target,.hm-trend path')].map(e=>e.getAttribute('d'))}});
  await run(()=>{const s=document.querySelector('.language-select');s.value='fr';s.dispatchEvent(new Event('change',{bubbles:true}))});
  const after=await run(()=>({cfg:JSON.stringify(qa.store.state.cfg),epoch:qa.store.resetEpoch,output:JSON.stringify(qv.simulation.status.output),paths:[...document.querySelectorAll('.room-chart-actual,.room-chart-target,.hm-trend path')].map(e=>e.getAttribute('d'))}));assert.deepEqual(after,before);
  const a=await run(()=>({lang:document.documentElement.lang,select:document.querySelector('.language-select').getAttribute('aria-label'),focused:document.activeElement===held,value:held.value,labels:[...document.querySelectorAll('.rp-k,.hd-metrics .k')].map(e=>e.textContent),targets:[...document.querySelectorAll('.room-rp input[type=number]')].map(e=>e.getAttribute('aria-label')),numeric:[...document.querySelectorAll('.flow-in .rp-v,.hm .v')].map(e=>e.textContent)}));
  assert.equal(a.lang,'fr');assert.equal(a.select,'Langue');assert.equal(a.focused,true);assert.equal(a.value,'2.5');assert.ok(a.labels.includes('Consigne')&&a.labels.includes('Puissance électrique'));assert.ok(a.targets.every(s=>s.startsWith('Consigne demandée')));assert.ok(a.numeric.some(s=>s.includes(',')));
 });
 await check('French settings and trusted HTML diagnostics localize in place and manufacturer IDs stay intact',async()=>{
  await run(()=>{held.blur();document.querySelector('button[aria-label="Réglages de l’unité extérieure"]').click()});
  const a=await run(()=>({text:document.querySelector('[data-pop=outdoor]').innerText,models:[...document.querySelectorAll('.ou-model-select option')].map(e=>e.value)}));
  assert.match(a.text,/Rôle des composants/i);assert.ok(a.models.includes('owner'));
  await run(()=>[...document.querySelectorAll('[data-pop=outdoor] details')].forEach(e=>e.open=true));
  assert.match(await run(()=>document.querySelector('[data-pop=outdoor]').innerText),/Détendeurs : abaissent la pression/);
  await run(()=>document.querySelector('.model-diagnostics').open=true);
  assert.match(await run(()=>document.querySelector('.model-diagnostics').innerText),/Résidu énergétique du système/);
  await run(()=>document.querySelector('[data-pop=outdoor] .pop-close').click());
 });
 await check('French desktop layout keeps legend, charts and controls within their zones in both themes',async()=>{
  for(const [width,height]of [[1280,720],[1440,900],[1600,1000],[1920,1080]]){
   await page.send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:false});
   for(const theme of ['light','dark']){
    await run(()=>document.querySelector('.th-select').value='light');await page.evaluate(`(()=>{const e=document.querySelector('.th-select');e.value=${JSON.stringify(theme)};e.dispatchEvent(new Event('change',{bubbles:true}))})()`);
    const a=await run(()=>{const h=document.querySelector('.topbar').getBoundingClientRect(),l=document.querySelector('.legend').getBoundingClientRect();return {overflow:document.documentElement.scrollWidth>innerWidth,legendBottom:l.bottom,header:[...document.querySelectorAll('.topbar button,.topbar select,.hm,.time')].filter(e=>e.getClientRects().length).every(e=>{const b=e.getBoundingClientRect();return b.left>=h.left&&b.right<=h.right+1}),charts:[...document.querySelectorAll('.room-env')].every(e=>e.scrollHeight<=e.clientHeight+1),langVisible:!!document.elementFromPoint(document.querySelector('.language-select').getBoundingClientRect().x+4,document.querySelector('.language-select').getBoundingClientRect().y+4)?.closest('.language-select'),geometry:[...document.querySelectorAll('.env-geo .rp-k')].every(e=>e.scrollWidth<=e.clientWidth+1)}});
    assert.equal(a.overflow,false);assert.equal(a.header,true);assert.equal(a.charts,true);assert.equal(a.langVisible,true);assert.equal(a.geometry,true,JSON.stringify({width,a}));assert.ok(Math.abs(a.legendBottom-height)<=1);
   }
  }
 });
 await check('language preference persists across reload and English restores source messages',async()=>{
  const url=dev.url;await page.send('Page.navigate',{url});await page.waitFor('document.documentElement.lang==="fr" && !!document.querySelector(".language-select")');
  assert.equal(await run(()=>document.querySelector('.language-select').value),'fr');
  await run(()=>{const e=document.querySelector('.language-select');e.value='en';e.dispatchEvent(new Event('change',{bubbles:true}))});assert.equal(await run(()=>document.documentElement.lang),'en');assert.equal(await run(()=>document.querySelector('.hd-reset').textContent),'Reset');
 });
 assert.deepEqual(page.events.filter(e=>e.method==='Runtime.exceptionThrown'),[]);
 await writeFile('reviews/language-browser-results.json',JSON.stringify({checkedAt:new Date().toISOString(),checks,desktopWidths:[1280,1440,1600,1920],languages:['en','fr'],themes:['light','dark'],physicalConfigurationChanged:false},null,2)+'\n');
}finally{await page.close();await dev.close()}
