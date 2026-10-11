// Reviewer diagnostic; immutable engine snapshot, raw native EOS quadrature.
import fs from 'node:fs';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
const base = process.argv[2];
if (!base) throw Error('Pass the immutable robustness snapshot directory');
const { Properties, solveCycle } = await import(`${base}/build/index.js`);
const { default: Module } = await import(`${base}/vendor/adapter.js`);
const native = await Module(), p = new Properties(native);
const root = new URL('../', import.meta.url);
const fixture = JSON.parse(fs.readFileSync(new URL('tests/engine/fixtures/eight-head-shared-header.json', root)));
const prop = (o,a,x,b,y) => native.PropsSI(o,a,x,b,y,'R32');
function independentIntegral(pressure, h1, h2, metal, panels) {
  const liquid = prop('H','P',pressure,'Q',0), vapor = prop('H','P',pressure,'Q',1);
  const saturationC = prop('T','P',pressure,'Q',1)-273.15;
  const low = Math.min(h1,h2), high = Math.max(h1,h2);
  const knots = [low,...[liquid,vapor].filter(h => h>low && h<high),high];
  let result = 0;
  for (let k=1;k<knots.length;k++) {
    const a=knots[k-1],b=knots[k];
    if (a>=liquid && b<=vapor) { result+=(b-a)/Math.abs(saturationC-metal); continue; }
    const temperature = h => h===liquid || h===vapor ? saturationC : prop('T','P',pressure,'H',h)-273.15;
    const za=Math.log(Math.abs(temperature(a)-metal)),zb=Math.log(Math.abs(temperature(b)-metal));
    const start=Math.min(za,zb),end=Math.max(za,zb),dz=(end-start)/panels;
    let sum=0;
    for (let j=0;j<=panels;j++) {
      const t=metal+Math.exp(start+j*dz)+273.15;
      const cp=prop('C','P',pressure,b<=liquid?'T|liquid':'T|gas',t);
      assert.ok(Number.isFinite(cp) && cp>0);
      sum+=(j===0 || j===panels ? 1 : j%2===0 ? 2 : 4)*cp;
    }
    result+=sum*dz/3;
  }
  return result;
}
const cases=[];
for (const {label,input} of fixture.cases) {
  const out=solveCycle(p,fixture.config,input),branches=[];
  let qsum=0,hsum=0,msum=0;
  out.branchMassFlowsKgs.forEach((flow,i) => {
    if (!input.active[i]) return;
    const metal=input.indoorMetalC[i],inlet=out.branchInlets[i],outlet=out.branchOutlets[i];
    const ua=fixture.config.rooms[i].refrigerantConductanceWK;
    assert.ok(inlet.temperatureC>outlet.temperatureC && outlet.temperatureC>metal);
    const coarse=flow*independentIntegral(inlet.pPa,inlet.hJkg,outlet.hJkg,metal,1024);
    const fine=flow*independentIntegral(inlet.pPa,inlet.hJkg,outlet.hJkg,metal,2048);
    assert.ok(Math.abs(fine-coarse)*(inlet.temperatureC-metal)<1e-4);
    const terminal=outlet.temperatureC-metal<=2e-5;
    let limitingHeatGapW=null;
    if (terminal) {
      const equilibriumH=prop('H','P',inlet.pPa,metal<out.condensingC?'T|liquid':'T|gas',metal+273.15);
      limitingHeatGapW=flow*Math.abs(outlet.hJkg-equilibriumH);
      // An independently checked terminal heat bound; engine tolerances unchanged.
      assert.ok(limitingHeatGapW<2e-4);
      assert.ok(fine<=ua+.01);
    } else assert.ok(Math.abs(fine-ua)*(inlet.temperatureC-metal)<1e-4);
    const heatW=flow*(inlet.hJkg-outlet.hJkg);
    qsum+=heatW;hsum+=flow*outlet.hJkg;msum+=flow;
    branches.push({index:i,phase:outlet.phase,metalC:metal,outletC:outlet.temperatureC,heatW,
      configuredUA:ua,simpsonUA1024:coarse,simpsonUA2048:fine,terminal,limitingHeatGapW});
  });
  const headerH=hsum/msum,heatResidualW=qsum-out.evaporatorHeatW-out.compressorWorkW;
  assert.ok(Math.abs(headerH-out.condenserOutlet.hJkg)<1e-7);
  assert.ok(Math.abs(headerH-out.expansionOutlet.hJkg)<1e-7);
  assert.ok(Math.abs(heatResidualW)<1e-7);
  assert.equal(out.condenserOutlet.phase,'liquid');
  cases.push({label,evaporatingC:out.evaporatingC,condensingC:out.condensingC,
    closureResidualW:out.closureResidualW,massResidualKgs:out.massResidualKgs,
    headerPhase:out.condenserOutlet.phase,heatResidualW,branches});
}
const sourceHashes={};
for (const file of ['cycle','engine','envelope','drive','types','properties']) {
  const hash = path => crypto.createHash('sha256').update(fs.readFileSync(path)).digest('hex');
  sourceHashes[`src/engine/${file}.ts`]=hash(`${base}/src/${file}.ts`);
  assert.equal(sourceHashes[`src/engine/${file}.ts`],hash(new URL(`src/engine/${file}.ts`,root)));
}
for (const file of ['adapter.js','coolprop.js','coolprop.wasm']) {
  const hash = path => crypto.createHash('sha256').update(fs.readFileSync(path)).digest('hex');
  sourceHashes[`public/vendor/coolprop-safe/${file}`]=hash(`${base}/vendor/${file}`);
  assert.equal(sourceHashes[`public/vendor/coolprop-safe/${file}`],hash(new URL(`public/vendor/coolprop-safe/${file}`,root)));
}
sourceHashes['tests/engine/fixtures/eight-head-shared-header.json']=crypto.createHash('sha256')
  .update(fs.readFileSync(new URL('tests/engine/fixtures/eight-head-shared-header.json',root))).digest('hex');
const receipt={reviewedAt:new Date().toISOString(),snapshot:base,
  method:'Reviewer-operated native solve of both exact retained eight-head checkpoints; independent raw guarded PropsSI composite Simpson integration in log-temperature (1024/2048 panels per sensible phase), exact latent segment, mass/PH/energy checks. Production conductanceIntegral is not used by independent integration. Near-terminal outlet heat is checked against raw metal-equilibrium enthalpy; PH inverse resolution makes implied-UA residual ill-conditioned near zero approach.',
  sourceHashes,cases};
const outputUrl=new URL('reviews/eight-head-science-independent-results.json',root);
if (fs.existsSync(outputUrl)) {
  const earlier=JSON.parse(fs.readFileSync(outputUrl));
  if (earlier.snapshot===base && earlier.sourceHashes?.['src/engine/cycle.ts']===sourceHashes['src/engine/cycle.ts']) {
    if (earlier.restartMethod) receipt.restartMethod=earlier.restartMethod;
    if (earlier.restartCases) receipt.restartCases=earlier.restartCases;
  }
}
fs.writeFileSync(outputUrl,JSON.stringify(receipt,null,2)+'\n');
console.log(JSON.stringify({sourceHashes,cases:cases.map(z=>({label:z.label,te:z.evaporatingC,
  tc:z.condensingC,residualW:z.closureResidualW,heatResidualW:z.heatResidualW,
  maximumTerminalGapW:Math.max(...z.branches.map(b=>b.limitingHeatGapW??0)),phases:z.branches.map(b=>b.phase)}))},null,2));
