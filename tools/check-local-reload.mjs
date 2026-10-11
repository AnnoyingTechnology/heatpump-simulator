// Isolate source-edit reloads from numerical failures; mutate only disposable QA copies.
import {cp,mkdtemp,symlink,writeFile,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {createServer} from 'vite';
import {openPage} from './browser-session.mjs';
const results=[];
for(const hmr of [true,false]){
  const root=await mkdtemp(join(tmpdir(),'heatpump-hmr-repro-'));
  let server,page;
  try{
    await Promise.all(['src','public','index.html','package.json'].map(n=>cp(resolve(n),join(root,n),{recursive:true})));
    await symlink(resolve('node_modules'),join(root,'node_modules'),'dir');
    server=await createServer({configFile:false,root,server:{host:'127.0.0.1',port:5214,strictPort:true,hmr},logLevel:'error'});
    await server.listen();
    page=await openPage('http://127.0.0.1:5214/');
    const run=fn=>page.evaluate(`(${fn.toString()})()`);
    await page.waitFor(`document.querySelector('.opstate')?.dataset.kind==='running'`,60000);
    await run(()=>{const s=document.querySelector('select[aria-label="Requested speed"]');s.value='50';s.dispatchEvent(new Event('change',{bubbles:true}))});
    const before=await run(()=>({origin:performance.timeOrigin,time:document.querySelector('.time').textContent}));
    const file=join(root,'src/equipment-data.ts');
    await writeFile(file,(await readFile(file,'utf8'))+'\n// QA source edit: only a comment.\n');
    await new Promise(r=>setTimeout(r,3000));
    const after=await run(()=>({origin:performance.timeOrigin,time:document.querySelector('.time').textContent,speed:document.querySelector('select[aria-label="Requested speed"]').value}));
    results.push({hmr,before,after,reloaded:before.origin!==after.origin});
  }finally{await page?.close();await server?.close();await rm(root,{recursive:true,force:true})}
}
const passed=results[0].reloaded&&!results[1].reloaded&&results[1].after.speed==='50';
await writeFile('reviews/local-source-reload-reproduction.json',JSON.stringify({checkedAt:new Date().toISOString(),results,passed,scope:'One comment-only edit to equipment-data.ts in isolated Vite copies; automatic reload versus disabled HMR; no physics changes'},null,2)+'\n');
console.log(JSON.stringify({passed,results},null,2));
if(!passed)process.exitCode=1;
