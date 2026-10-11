// Use the existing isolated Chromium QA profile, never the personal browser session.
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { openPage } from './browser-session.mjs';
const origin = process.env.HEATPUMP_PROBE_ORIGIN ?? 'http://127.0.0.1:5188';
const page = await openPage(`${origin}/tools/coolprop-safe/blank.html`);
try {
  await page.waitFor(`location.origin === ${JSON.stringify(origin)} && document.readyState === 'complete'`);
  await page.evaluate(`(async()=>{const [{default:initialize},engine,cycle]=await Promise.all([
    import('/public/vendor/coolprop-safe/adapter.js'),import('/tests/engine/build/index.js'),import('/tests/engine/build/cycle.js')]);
    globalThis.probe={module:await initialize({locateFile:f=>'/public/vendor/coolprop-safe/'+f}),engine,cycle};})()`);
  const fluids=[];
  for(const id of ['R32','R22','R290','R134a','R1234yf','R410A','R407C']) {
    fluids.push(await page.evaluate(`(()=>{const {module:m,engine,cycle}=globalThis.probe;
      const p=new engine.Properties(m,${JSON.stringify(id)}),pressure=p.pressureAtSaturationC(40,'bubble'),sat=p.saturation(pressure);
      const middle=p.ph(pressure,(sat.liquidH+sat.vaporH)/2),result={id:p.fluid,pressure,saturation:sat,middle,qualification:p.refrigerant.qualification,cycles:[]};
      for(let i=0;i<20;i++){p.clearCache();p.prop('T','P',pressure,'Q',.4);try{p.prop('A','P',pressure,'Q',.4);throw Error('Two-phase sound speed unexpectedly defined');}catch(e){if(e.message.includes('unexpectedly'))throw e;}
        const recovered=p.prop('H','P',pressure,'Q',.4);if(!(Number.isFinite(recovered)&&recovered>sat.liquidH&&recovered<sat.vaporH))throw Error('Selected-fluid native recovery failed');}
      if(p.refrigerant.qualification.reference)for(const mode of ['heating','cooling']){const c=engine.defaultEngineConfig(3);c.fluid=p.fluid;c.mode=mode;
        const start=performance.now(),out=cycle.solveCycle(p,c,{mode,indoorMetalC:[30,30,30],outdoorMetalC:mode==='heating'?-3:38,active:[true,true,true],speedRps:40});
        if(out.closureResidualW>.1||Math.abs(out.condenserHeatW-out.evaporatorHeatW-out.compressorWorkW)>1e-6)throw Error('Cycle closure failed');
        result.cycles.push({mode,elapsedMs:performance.now()-start,lowPressureBarAbs:out.lowPressureBarAbs,highPressureBarAbs:out.highPressureBarAbs,compressorWorkW:out.compressorWorkW,closureResidualW:out.closureResidualW});}
      p.dispose();return result;})()`));
  }
  const mixtureBenchmarks=[];
  for(const id of ['R407C'])mixtureBenchmarks.push(await page.evaluate(`(()=>{const {module:m,engine,cycle}=globalThis.probe;
    const p=new engine.Properties(m,${JSON.stringify(id)},'full-mixture'),pressure=p.pressureAtSaturationC(40,'bubble'),sat=p.saturation(pressure);
    p.prop('T','P',pressure,'Q',.5);try{p.prop('A','P',pressure,'Q',.5);throw Error('Two-phase sound unexpectedly defined');}catch(e){if(e.message.includes('unexpectedly'))throw e;}
    const h=p.prop('H','P',pressure,'Q',.5),middle=p.ph(pressure,h),c=engine.defaultEngineConfig(1);c.fluid=p.fluid;
    if(Math.abs(middle.qualityMass-.5)<.001)throw Error('Mixture molar quality was presented as mass quality');
    if(p.refrigerant.qualification.reference)throw Error('Full-mixture circuit unexpectedly released');
    try{cycle.solveCycle(p,c,{});throw Error('Unqualified mixture cycle unexpectedly accepted');}catch(e){if(e.message.includes('unexpectedly'))throw e;}
    const result={id:p.fluid,model:p.model,saturation:sat,middle,qualification:p.refrigerant.qualification};p.dispose();return result;})()`));
  const exceptions=page.events.filter(e=>e.method==='Runtime.exceptionThrown').map(e=>e.params);
  if(exceptions.length)throw Error('Unexpected native/browser exceptions');
  const wasm=await readFile(new URL('../public/vendor/coolprop-safe/coolprop.wasm',import.meta.url));
  const result={coolpropCommit:'ae81610e7d23efc57f9d051c8e70a4d66e87537f',wasmSHA256:createHash('sha256').update(wasm).digest('hex'),checkedAt:new Date().toISOString(),browser:await page.evaluate('navigator.userAgent'),fluids,mixtureBenchmarks,exceptions};
  await writeFile(new URL('../reviews/refrigerants-browser-results.json',import.meta.url),JSON.stringify(result,null,2)+'\n');
  console.log(fluids.map(f=>({id:f.id,glideK:f.saturation.dewTemperatureC-f.saturation.bubbleTemperatureC,cycles:f.cycles.length})));
}finally{await page.close();}
