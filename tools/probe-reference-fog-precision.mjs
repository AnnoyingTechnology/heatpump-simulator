// Compare only the numerical fog-root tolerance in disposable compiled source; no physical limits change.
import{readFile,writeFile,unlink}from'node:fs/promises';
import{pathToFileURL}from'node:url';
import{resolve}from'node:path';
import{createHash}from'node:crypto';
import factory from'../public/vendor/coolprop-safe/adapter.js';
const [buildArg,resultArg='research/reference-fog-precision.json']=process.argv.slice(2),build=resolve(buildArg??'');
if(!build.startsWith('/tmp/'))throw new Error('Provide an isolated /tmp compiled engine directory');
const airPath=resolve(build,'air.js'),text=await readFile(airPath,'utf8'),tight=text.replace('1e-5 + 1e-10','5e-6 + 5e-11');
if(text===tight)throw new Error('Expected fog tolerance source absent');
const tightPath=resolve(build,`air-half-${Date.now()}.js`);await writeFile(tightPath,tight);
const{Properties}=await import(pathToFileURL(resolve(build,'index.js'))),{equilibrateExhaust:a}=await import(pathToFileURL(airPath)),{equilibrateExhaust:b}=await import(pathToFileURL(tightPath));
const p=new Properties(await factory()),P=101325;let maxT=0,maxH=0,maxBudgetFraction=0,n=0;
try{
 for(const T of[-20,-2,-.01,0,.01,1,10])for(const fog of[1e-7,.0002,.002]){
  const w=p.airW(T,1,P)+fog,h=p.airH(T,w-fog,P)+fog*(T<0?-333500+2100*T:4180*T),x=a(p,h,w,P,30),y=b(p,h,w,P,30);
  maxT=Math.max(maxT,Math.abs(x.temperatureC-y.temperatureC));
  const back=s=>p.airH(s.temperatureC,s.vaporWater,P)+(s.fogWater-s.fogIceWater)*4180*s.temperatureC+s.fogIceWater*(-333500+2100*s.temperatureC);
  const error=Math.max(Math.abs(back(x)-h),Math.abs(back(y)-h));maxH=Math.max(maxH,error);maxBudgetFraction=Math.max(maxBudgetFraction,error/(1e-5+1e-10*Math.abs(h)));n++;
 }
 const result={samples:n,maxHalfToleranceTemperatureDifferenceC:maxT,maxReconstructedEnthalpyResidualJkg:maxH,maxDeclaredBudgetFraction:maxBudgetFraction,compiledAirSha256:createHash('sha256').update(text).digest('hex')};
 await writeFile(resultArg,JSON.stringify(result,null,2));console.log(result);
}finally{p.dispose();await unlink(tightPath)}
