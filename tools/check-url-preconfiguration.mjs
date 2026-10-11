import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {openPage} from './browser-session.mjs';
import {startIsolatedDev} from './isolated-dev.mjs';
const isolated=await startIsolatedDev(5217),checks=[];
try{
  for(const scenario of [
    {suffix:'?outdoor=39&humidity=60&mode=cooling&room.ground.target=24&room.ground.temperature=27&room.ground.enabled=on&room.first.target=24&room.first.temperature=28.2&room.attic.enabled=off',outdoor:39,rh:.6,mode:'cooling',room:{ground:[24,27,true],first:[24,28.2,true],attic:[21,18.3,false]}},
    {suffix:'?outdoor=1&mode=heating#outdoor=-4&mode=heating&room.ground.target=16&room.ground.temperature=18&room.ground.enabled=off',outdoor:-4,rh:.35,mode:'heating',room:{ground:[16,18,false],first:[21.5,21.5,true],attic:[21,18.3,false]}},
    {suffix:'?outdoor=NaN&humidity=110&room.first.target=23&room.ground.temperature=unknown&room.typo.target=21',outdoor:1,rh:.35,mode:'heating',room:{ground:[17,18,true],first:[23,21.5,true],attic:[21,18.3,false]},invalid:true},
  ]){
    const page=await openPage(isolated.url+scenario.suffix),run=fn=>page.evaluate(`(${fn.toString()})()`);
    try{
      await page.waitFor('!!document.querySelector(".scene")');
      await run(async()=>{const m=await fetch('/src/main.ts').then(r=>r.text());globalThis.qa=await import(m.match(/from "([^"]*\/state\.ts[^"]*)"/)[1]);globalThis.qv=await import(m.match(/from "([^"]*\/runtime\/view\.ts[^"]*)"/)[1]);qa.store.update(s=>s.ui.paused=true)});
      await page.waitFor('qv.simulation.status.output&&!qv.simulation.isBusy',60000);
      const d=await run(()=>({initial:qv.simulation.diagnosticReport().initialConfig,epoch:qa.store.resetEpoch,notice:qa.store.state.ui.notice,shownNotice:document.querySelector('.ou').textContent,scroll:document.querySelector('.scene-scroll').scrollTop,status:qv.simulation.status.state}));
      assert.equal(d.initial.outdoorTemperatureC,scenario.outdoor);assert.equal(d.initial.outdoorRelativeHumidity,scenario.rh);assert.equal(d.initial.mode,scenario.mode);
      for(const room of d.initial.rooms)assert.deepEqual([room.setpointC,room.initialTemperatureC,room.enabled],scenario.room[room.id]);
      assert.equal(d.epoch,0);assert.equal(d.status,'ready');assert.equal(d.scroll,0);
      if(scenario.invalid){assert.match(d.notice,/URL inputs ignored/);assert.ok(d.shownNotice.includes('URL inputs ignored'))}
      assert.deepEqual(page.events.filter(e=>e.method==='Runtime.exceptionThrown'),[]);
      checks.push({name:scenario.invalid?'invalid fields retain defaults, valid neighbours and visible explanation':'query/fragment observations initialize actual worker without resets',passed:true,scenario:scenario.suffix,initial:d.initial});
    }finally{await page.close()}
  }
  const sourceHashes=Object.fromEntries(await Promise.all(['src/main.ts','src/preconfiguration.ts'].map(async f=>[f,createHash('sha256').update(await readFile(`${isolated.sourceRoot}/${f}`)).digest('hex')])));
  await writeFile('reviews/url-preconfiguration-browser-results.json',JSON.stringify({checkedAt:new Date().toISOString(),checks,sourceHashes},null,2)+'\n');
  console.log(`PASS ${checks.length} URL actual-worker checks`);
}finally{await isolated.close()}
