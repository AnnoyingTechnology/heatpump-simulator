// Reported reproduction: open the published page and change only requested speed.
import {writeFile} from 'node:fs/promises';
import {openPage} from './browser-session.mjs';
const url='https://annoyingtechnology.github.io/heatpump-simulator/';
const page=await openPage(url),samples=[];
const run=fn=>page.evaluate(`(${fn.toString()})()`);
try {
  await page.waitFor(`document.querySelector('.opstate')?.dataset.kind==='running'`,60000);
  await run(()=>{const s=document.querySelector('select[aria-label="Requested speed"]');s.value='50';s.dispatchEvent(new Event('change',{bubbles:true}))});
  const deadline=Date.now()+180000;
  let previous=0,reset=false;
  while(Date.now()<deadline){
    const sample=await run(()=>({time:document.querySelector('.time')?.textContent,status:document.querySelector('.opstate')?.dataset.kind,note:document.querySelector('.hd-note')?.textContent,speed:document.querySelector('select[aria-label="Requested speed"]')?.value,documentStart:performance.timeOrigin}));
    sample.seconds=sample.time?.split(':').reduce((n,x)=>n*60+Number(x),0);
    samples.push(sample);
    if(sample.seconds<previous||sample.documentStart!==samples[0].documentStart||sample.speed!=='50')reset=true;
    previous=sample.seconds;
    if(reset||sample.status==='fault'||sample.seconds>=600)break;
    await new Promise(r=>setTimeout(r,500));
  }
  const failures=page.events.filter(e=>e.method==='Runtime.exceptionThrown'||e.method==='Inspector.targetCrashed');
  const last=samples.at(-1),passed=last.seconds>=600&&!reset&&last.status!=='fault'&&!failures.length;
  const assets=page.events.filter(e=>e.method==='Network.responseReceived'&&/\/assets\//.test(e.params.response.url)).map(e=>e.params.response.url);
  await writeFile('reviews/published-startup-browser-results.json',JSON.stringify({checkedAt:new Date().toISOString(),url,assets,passed,reset,samples,failures,scope:'Unchanged published UI startup; only requested speed changed to50; navigation/time continuity observed through600 simulated seconds'},null,2)+'\n');
  console.log(JSON.stringify({passed,reset,last,failures},null,2));
  if(!passed)process.exitCode=1;
}finally{await page.close()}
