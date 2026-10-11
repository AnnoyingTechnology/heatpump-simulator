import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {openPage} from './browser-session.mjs';
import {startIsolatedDev} from './isolated-dev.mjs';
const isolated=await startIsolatedDev(5200),page=await openPage(isolated.url),checks=[];
try{
 await page.waitFor('!!document.querySelector(".scene")');
 await page.evaluate(`(async()=>{const text=await fetch('/src/main.ts').then(r=>r.text());globalThis.qa=await import(text.match(/from "([^"]*\\/state\\.ts[^"]*)"/)[1]);qa.store.setExperience('examples');qa.store.setGenericPortCapacity(8);qa.store.setUnitCount(8);const rooms=qa.store.state.cfg.rooms.slice(0,8);qa.store.update(s=>s.cfg.interzoneLinks=[]);for(let i=0;i<rooms.length;i++)for(let j=i+1;j<rooms.length;j++)qa.store.setInterzoneLink(rooms[i].id,rooms[j].id,{openingAreaM2:1,contactAreaM2:1,insulationMm:120})})()`);
 for(const [width,height] of [[1280,720],[1600,1000]]){
  await page.send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:false});await new Promise(r=>setTimeout(r,500));
  const actual=await page.evaluate(`(()=>{const pills=[...document.querySelectorAll('.lk-pill')].map(e=>({key:e.closest('.room-link').dataset.link,r:e.getBoundingClientRect()})),cards=[...document.querySelectorAll('.room-rp,.room-env')].map(e=>e.getBoundingClientRect()),bad=[];const intersects=(a,b)=>Math.min(a.right,b.right)-Math.max(a.left,b.left)>.5&&Math.min(a.bottom,b.bottom)-Math.max(a.top,b.top)>.5;for(let i=0;i<pills.length;i++){for(let j=i+1;j<pills.length;j++)if(intersects(pills[i].r,pills[j].r))bad.push({a:pills[i].key,b:pills[j].key});for(const c of cards)if(intersects(pills[i].r,c))bad.push({link:pills[i].key,card:true})}return {count:pills.length,bad,obsolete:document.querySelectorAll('.lk-line,.louvre-flap').length,fan:document.querySelectorAll('.fan-side').length,identity:[...document.querySelectorAll('.room-link')].every(e=>e.getAttribute('aria-label')?.includes(' to ')||e.querySelector('title').textContent.length>10)}})()`);
  assert.equal(actual.count,28);assert.deepEqual(actual.bad,[],JSON.stringify({width,height,actual}));assert.equal(actual.obsolete,0);assert.equal(actual.fan,1);assert.equal(actual.identity,true);checks.push({name:`All 28 links avoid overlapping room controls at ${width}×${height}`,passed:true});console.log('PASS',checks.at(-1).name);
 }
 assert.deepEqual(page.events.filter(e=>e.method==='Runtime.exceptionThrown'),[]);
 await writeFile('reviews/room-link-layout-browser-results.json',JSON.stringify({checkedAt:new Date().toISOString(),checks,scope:'Eight-room all-pairs boundary chips and side-view fan'},null,2)+'\n');
}finally{await page.close();await isolated.close()}
