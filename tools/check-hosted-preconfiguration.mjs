// Verify a Home Assistant style URL through production controls and real-worker room readouts.
import assert from 'node:assert/strict';
import {readFile,readdir,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {openPage} from './browser-session.mjs';
import {activateControl} from './browser-controls.mjs';
const base=process.argv[2]??'https://annoyingtechnology.github.io/heatpump-simulator/';
const url=base+'?outdoor=39&humidity=60&mode=cooling&room.ground.target=24&room.ground.temperature=27&room.ground.enabled=on&room.first.target=24&room.first.temperature=28.2&room.attic.enabled=off';
const page=await openPage(url),run=fn=>page.evaluate(`(${fn.toString()})()`);
try {
  await page.waitFor('!!document.querySelector(".topbar")');
  await activateControl(page,'Pause');
  await page.waitFor('[...document.querySelectorAll(".flow-in .rp-v")].every(e=>Number.isFinite(Number(e.textContent)))',60000);
  const state=await run(()=>({outdoor:Number(document.querySelector('[aria-label="Outdoor air"] input[type="number"]').value),rh:Number(document.querySelector('input[aria-label^="Humidity"][type="number"]').value),mode:document.querySelector('.ou-modes .seg-btn.on').textContent,targets:[...document.querySelectorAll('.room-rp input[type="number"]')].map(e=>Number(e.value)),enabled:[...document.querySelectorAll('input[role="switch"]')].map(e=>e.checked),temperatures:[...document.querySelectorAll('.flow-in .rp-v')].map(e=>Number(e.textContent)),clock:document.querySelector('.time').textContent}));
  assert.equal(state.outdoor,39);assert.equal(state.rh,60);assert.equal(state.mode,'Cooling');
  assert.deepEqual(state.targets,[21,24,24]);assert.deepEqual(state.enabled,[false,true,true]);
  for(const [i,t] of [18.3,28.2,27].entries())assert.ok(Math.abs(state.temperatures[i]-t)<=.1);
  assert.deepEqual(page.events.filter(e=>e.method==='Runtime.exceptionThrown'),[]);
  const bundleHashes={};
  for(const name of (await readdir('dist/assets')).filter(n=>/\.(js|css)$/.test(n))){
    const r=await fetch(new URL('assets/'+name,base));assert.equal(r.status,200);
    const hash=b=>createHash('sha256').update(b).digest('hex');bundleHashes[name]=hash(Buffer.from(await r.arrayBuffer()));assert.equal(bundleHashes[name],hash(await readFile('dist/assets/'+name)));
  }
  await writeFile('reviews/hosted-url-preconfiguration-results.json',JSON.stringify({checkedAt:new Date().toISOString(),url,state,bundleHashes,scope:'Visible production controls and actual-worker room air; no state injection',passed:true},null,2)+'\n');
  console.log('PASS production URL initializes weather/mode/targets/Off/actual worker room observations');
} finally {await page.close()}
