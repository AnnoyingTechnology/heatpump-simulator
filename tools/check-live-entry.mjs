// Verify the production entry point starts the real worker by default, without selecting Live.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, writeFile } from 'node:fs/promises';
import { extname, resolve } from 'node:path';
import { openPage } from './browser-session.mjs';
import { activateControl } from './browser-controls.mjs';

const root=resolve('dist');
const server=createServer(async(req,res)=>{
  const pathname=new URL(req.url,'http://localhost').pathname;
  if(!pathname.startsWith('/heatpump-simulator/')){res.writeHead(404);res.end();return;}
  const file=resolve(root,decodeURIComponent(pathname.slice('/heatpump-simulator/'.length))||'index.html');
  if(!file.startsWith(`${root}/`)){res.writeHead(403);res.end();return;}
  try{
    const data=await readFile(file);
    const mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.wasm':'application/wasm'}[extname(file)]??'application/octet-stream';
    res.writeHead(200,{'Content-Type':mime});res.end(data);
  }catch{res.writeHead(404);res.end();}
});
await new Promise(resolve=>server.listen(5175,'127.0.0.1',resolve));
let page;
try{
  page=await openPage('http://127.0.0.1:5175/heatpump-simulator/');
  await page.waitFor('!!document.querySelector(".scene")');
  await page.send('Page.bringToFront');
  assert.equal(await page.evaluate(`(()=>{
    const b=[...document.querySelectorAll('button')].find(e=>e.textContent==='Live');
    if(b)return b.getAttribute('aria-pressed')==='true';
    return [...document.querySelectorAll('select')].some(e=>e.value==='live'&&[...e.options].some(o=>o.value==='examples'));
  })()`),true);
  await page.waitFor(`document.querySelector('.opstate')?.dataset.kind==='running'&&document.querySelector('.time')?.textContent!=='00:00.0'`,60000);
  assert.equal(await page.evaluate(`document.querySelector('.hd-readings,.ribbon,.drawer')`),null);
  await activateControl(page,'Outdoor unit settings');
  await page.evaluate(`document.querySelector('.model-diagnostics').open=true`);
  await page.waitFor(`document.querySelector('.model-diagnostics').innerText.includes('Idealized field lines')`);
  await activateControl(page,'Close');
  assert.equal(await page.evaluate(`document.querySelector('[data-probe="compressor-discharge"]').dataset.source`),'live');
  assert.ok(Number.isFinite(Number(await page.evaluate(`document.querySelector('[data-probe="compressor-discharge"]').dataset.exact`))));
  assert.equal(await page.evaluate(`document.querySelectorAll('.indoor-probes .probe:not(.na)').length`),6);
  assert.equal(await page.evaluate(`document.querySelectorAll('img,image,canvas').length`),0);
  await activateControl(page,'Pause');
  await page.send('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]});
  // Allow the single outstanding quarter-second calculation to complete before capturing.
  await new Promise(resolve=>setTimeout(resolve,1500));
  const screenshot=await page.send('Page.captureScreenshot',{format:'png',fromSurface:false,captureBeyondViewport:false});
  await writeFile('design/interface-live.png',Buffer.from(screenshot.data,'base64'));
  assert.equal(page.events.filter(e=>e.method==='Runtime.exceptionThrown').length,0);
  const failed=page.events.filter(e=>e.method==='Network.responseReceived'&&e.params.response.status>=400);
  assert.deepEqual(failed.map(e=>e.params.response.url),[]);
  await writeFile('reviews/live-entry-browser-results.json',JSON.stringify({checkedAt:new Date().toISOString(),liveByDefault:true,realWorkerClock:true,idealizedByDefault:true,vectorOnly:true,productionSubdirectory:true},null,2)+'\n');
  console.log('PASS production starts Live by default, advances the real worker clock and retains idealized piping');
}finally{if(page)await page.close();await new Promise(resolve=>{server.close(resolve);server.closeAllConnections();});}
