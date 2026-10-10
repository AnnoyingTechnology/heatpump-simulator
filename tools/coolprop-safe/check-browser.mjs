import {writeFile} from 'node:fs/promises';
import {openPage} from '../browser-session.mjs';
const origin=process.env.HEATPUMP_PROBE_ORIGIN??'http://127.0.0.1:5181';
const page=await openPage(`${origin}/tools/coolprop-safe/blank.html`,1600,1000,{blockedUrls:['*/@vite/client']});
try{
  const result=await page.evaluate(`(async()=>{
    const [{default:safe},{default:reference},{validate}]=await Promise.all([
      import('/public/vendor/coolprop-safe/adapter.js'),import('/public/vendor/coolprop/coolprop.js'),
      import('/tools/coolprop-safe/validate.mjs')]);
    return validate(safe,reference,{safe:{locateFile:f=>'/public/vendor/coolprop-safe/'+f},
      reference:{locateFile:f=>'/public/vendor/coolprop/'+f}});
  })()`);
  result.browserExceptions=page.events.filter(e=>e.method==='Runtime.exceptionThrown').map(e=>e.params);
  if(result.browserExceptions.length)throw new Error('Unexpected browser native exceptions');
  await writeFile(new URL('browser-results.json',import.meta.url),JSON.stringify(result,null,2)+'\n');
  console.log({...result,records:undefined,humid:undefined});
}finally{await page.close();}
