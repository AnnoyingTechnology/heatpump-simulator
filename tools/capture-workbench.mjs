// Screenshots are review evidence; the application illustrations are entirely SVG/CSS.
import { writeFile } from 'node:fs/promises';
import { openPage } from './browser-session.mjs';
const page = await openPage('http://127.0.0.1:5173/');
try {
  await page.waitFor('!!document.querySelector(".scene")');
  await page.send('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]});
  await page.evaluate(`(${(async () => {
    const source=await fetch('/src/main.ts').then(r=>r.text());
    const url=source.match(/from "([^"]*\/state\.ts[^"]*)"/)[1];
    globalThis.__qaStateModule=await import(url);
  }).toString()})()`);
  async function action(fn) { await page.evaluate(`(${fn.toString()})()`); }
  async function capture(name) {
    const s=await page.send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false,fromSurface:false});
    await writeFile(`design/${name}.png`,Buffer.from(s.data,'base64'));
    await new Promise(r=>setTimeout(r,100));
  }
  await action(() => [...document.querySelectorAll('button')].find(b=>b.textContent==='Examples').click());
  await action(() => [...document.querySelectorAll('button')].find(b=>b.textContent==='Pause').click());
  await capture('interface-preview');
  await action(() => [...document.querySelectorAll('button')].find(b=>b.textContent==='Outdoor unit').click());
  await new Promise(r=>setTimeout(r,400));
  await capture('interface-outdoor');
  await action(async () => {
    const {store}=globalThis.__qaStateModule;
    store.loadExample('heating','frost');store.clock.iceKg=0.3;store.emit();
  });
  await new Promise(r=>setTimeout(r,100));
  await capture('interface-frost');
  await action(() => {
    document.querySelector('#tab-equipment').click();
    [...document.querySelectorAll('button')].find(b=>b.textContent==='5').click();
    [...document.querySelectorAll('button')].find(b=>b.textContent==='Overview').click();
  });
  await new Promise(r=>setTimeout(r,400));
  await capture('interface-five-rooms');
  console.log('Captured four interface review views');
} finally { await page.close(); }
