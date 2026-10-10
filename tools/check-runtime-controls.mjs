// Worker scheduling/freshness contract. Controlled responses test races without pretending to validate physics.
import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { openPage } from './browser-session.mjs';
import { startIsolatedDev } from './isolated-dev.mjs';

const isolated = await startIsolatedDev(5181);
const page = await openPage(isolated.url);
try {
  await page.waitFor('!!document.querySelector(".scene")');
  await page.evaluate(`(async()=>{
    const main=await fetch('/src/main.ts').then(r=>r.text());
    globalThis.qa=await import(main.match(/from "([^\"]*\\/state\\.ts[^\"]*)"/)[1]);
    globalThis.qv=await import(main.match(/from "([^\"]*\\/runtime\\/view\\.ts[^\"]*)"/)[1]);
    globalThis.qm=await import(main.match(/from "([^\"]*\\/runtime\\/config\\.ts[^\"]*)"/)[1]);
    qa.store.update(s=>{s.ui.paused=true});
  })()`);
  await page.waitFor('qv.simulation.status.state==="ready"&&!qv.simulation.isBusy',30000);
  const results = await page.evaluate(`(async()=>{
    const view=await fetch('/src/runtime/view.ts').then(r=>r.text());
    const {SimulationRuntime}=await import(view.match(/from "([^\"]*controller[^\"]*)"/)[1]);
    const nativeWorker=globalThis.Worker, workers=[], checks=[];
    const config=qm.engineConfigFromUi(qa.store.state.cfg,qa.store.state.cfg.live);
    const base=structuredClone(qv.simulation.status.output);
    const ensure=(v,m)=>{if(!v)throw Error(m)};
    class StubWorker {
      requests=[]; onmessage=null; onerror=null;
      constructor(){workers.push(this)}
      postMessage(r){this.requests.push(structuredClone(r))}
      terminate(){}
      answer(output,kind='output'){
        const req=this.requests.shift();ensure(req,'response needs request');
        this.onmessage({data:kind==='error'?{kind,revision:req.revision,message:'rejected input'}:
          {kind,revision:req.revision,output:structuredClone(output),calculationMs:12}});
      }
    }
    const setup=()=>{const rt=new SimulationRuntime();rt.start(config);const w=workers.at(-1);w.answer(base);return {rt,w}};
    const soft=(t)=>({...structuredClone(config),outdoorTemperatureC:t});
    const check=(name,fn)=>{fn();checks.push({name,passed:true})};
    globalThis.Worker=StubWorker;
    try {
      check('soft edits retain the completed snapshot across passive acknowledgements and paused time',()=>{
        const {rt,w}=setup();const held=rt.status.output;
        rt.configure(soft(5));ensure(rt.status.state==='updating'&&rt.status.output===held,'soft edit cleared snapshot');
        const passive={...base,cycle:null,simulatedSeconds:held.simulatedSeconds};w.answer(passive);
        ensure(!rt.isBusy&&rt.status.state==='updating'&&rt.status.output===held,'ack replaced calculated snapshot');
        ensure(rt.status.output.simulatedSeconds===held.simulatedSeconds,'configure advanced physical clock');
        ensure(rt.step(.25),'resume step rejected');w.answer({...base,simulatedSeconds:base.simulatedSeconds+.25});
        ensure(rt.status.state==='ready'&&rt.status.output.simulatedSeconds===base.simulatedSeconds+.25,'new physical step did not replace snapshot');rt.stop();
      });
      check('overlapping sliders coalesce to the newest inputs with one request in flight',()=>{
        const {rt,w}=setup();rt.step(.25);rt.configure(soft(4));rt.configure(soft(3));rt.configure(soft(2));
        ensure(w.requests.length===1,'parallel worker requests');
        w.answer({...base,simulatedSeconds:base.simulatedSeconds+.25});
        ensure(w.requests.length===1&&w.requests[0].kind==='configure'&&w.requests[0].config.outdoorTemperatureC===2,'did not coalesce');
        ensure(rt.status.state==='updating'&&rt.status.output.simulatedSeconds===base.simulatedSeconds+.25,'completed pre-edit step lost');
        const held=rt.status.output;w.answer({...base,cycle:null});ensure(rt.status.output===held,'queued acknowledgement replaced held result');rt.stop();
      });
      check('hard invalidation stays latched across newer soft edits and old steps',()=>{
        const {rt,w}=setup();rt.step(.25);const hard=structuredClone(config);hard.rooms[0].enabled=false;
        rt.configure(hard);rt.configure({...hard,outdoorTemperatureC:4});
        ensure(rt.status.state==='loading'&&rt.status.output===null,'soft edit resurrected hard-invalidated output');
        w.answer({...base,simulatedSeconds:base.simulatedSeconds+.25});
        ensure(rt.status.output===null,'old physical step bypassed hard invalidation');
        ensure(w.requests[0].config.rooms[0].enabled===false,'queued enabled change lost');w.answer({...base,cycle:null,state:'idle'});
        ensure(rt.status.state==='ready'&&rt.status.output.cycle===null,'compatible fresh idle state missing');rt.stop();
      });
      check('current configure errors and fault outputs clear retained operating readings',()=>{
        for(const failure of ['error','fault']){
          const {rt,w}=setup();rt.configure(soft(4));
          w.answer({...base,state:'fault',cycle:null},failure==='error'?'error':'output');
          ensure(failure==='error'?rt.status.state==='error'&&rt.status.output===null:rt.status.output.state==='fault','failed configure retained good readings');rt.stop();
        }
      });
      check('a pre-edit error or fault cannot remain as a good snapshot while recovery is queued',()=>{
        for(const failure of ['error','fault']){
          const {rt,w}=setup();rt.step(.25);rt.configure(soft(4));
          w.answer({...base,state:'fault',cycle:null},failure==='error'?'error':'output');
          ensure(rt.status.state==='loading'&&rt.status.output===null,'old failure retained operating snapshot');
          w.answer({...base,state:'idle',cycle:null});ensure(rt.status.state==='ready','queued valid recovery failed');rt.stop();
        }
      });
      check('native worker failure clears retained readings and pending requests',()=>{
        const {rt,w}=setup();rt.configure(soft(4));rt.configure(soft(3));w.onerror({message:'worker failed'});
        ensure(rt.status.state==='error'&&rt.status.output===null&&!rt.isBusy,'worker error did not clear state');rt.stop();
      });
    } finally {globalThis.Worker=nativeWorker}
    return checks;
  })()`);
  assert.equal(results.length,6);
  assert.equal(page.events.filter(e=>e.method==='Runtime.exceptionThrown').length,0);
  await writeFile('reviews/runtime-control-results.json',JSON.stringify({checkedAt:new Date().toISOString(),method:'Controlled browser Worker responses; scheduling and freshness only',checks:results},null,2)+'\n');
  results.forEach(r=>console.log(`PASS ${r.name}`));
} finally {await page.close();await isolated.close()}
