import {readFile,writeFile,readdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {gzipSync,brotliCompressSync} from 'node:zlib';
const dir=new URL('../../public/vendor/coolprop-safe/',import.meta.url);
const artifacts={};
for(const name of ['coolprop.js','coolprop.wasm','adapter.js','LICENSE-CoolProp',...(await readdir(new URL('licenses/',dir))).sort().map(f=>'licenses/'+f)]) {
  const bytes=await readFile(new URL(name,dir));
  artifacts[name]={bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex'),
    gzipBytes:gzipSync(bytes).length,brotliBytes:brotliCompressSync(bytes).length};
}
const inputs={};
for(const name of ['safe-interface.cpp','prepare.py','build.sh','container-build.sh','notices.py','dependency-pins.json']) {
  const bytes=await readFile(new URL(name,import.meta.url));inputs[name]=createHash('sha256').update(bytes).digest('hex');
}
const provenance={status:'guarded HEOS artifact selected by the production loader; coupled fluid qualification is declared in src/engine/refrigerants.ts',builtAt:new Date().toISOString(),
  CoolProp:{version:'8.0.0',commit:'ae81610e7d23efc57f9d051c8e70a4d66e87537f',license:'MIT',
    repository:'https://github.com/CoolProp/CoolProp'},
  toolchain:{image:'emscripten/emsdk@sha256:744fb6a68941970951bacf9d6632041a0398260492232691ef22bbf54b0585c6',
    upstreamWorkflow:'https://github.com/CoolProp/CoolProp/blob/v8.0.0/.github/workflows/javascript_builder.yml',
    licenseNotices:'https://github.com/emscripten-core/emscripten/blob/4.0.12/LICENSE'},
  recipe:'tools/coolprop-safe/build.sh; official Javascript target with narrow guarded C ABI interface',
  dependencies:JSON.parse(await readFile(new URL('dependency-pins.json',import.meta.url),'utf8')),
  compilerVersion:await readFile(new URL('work/toolchain.txt',import.meta.url),'utf8'),
  compilerFlags:await readFile(new URL('work/build/CMakeFiles/coolprop.dir/flags.make',import.meta.url),'utf8'),
  linkerInvocation:await readFile(new URL('work/build/CMakeFiles/coolprop.dir/link.txt',import.meta.url),'utf8'),
  sourceInputSHA256:inputs,
  optimization:'Release, IEEE defaults, no fast-math; ASSERTIONS=1; DISABLE_EXCEPTION_CATCHING=0',artifacts};
await writeFile(new URL('provenance.json',dir),JSON.stringify(provenance,null,2)+'\n');
console.log(artifacts);
