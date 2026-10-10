import {readFile,writeFile} from 'node:fs/promises';
import safe from '../../public/vendor/coolprop-safe/adapter.js';
import reference from '../../public/vendor/coolprop/coolprop.js';
import {validate} from './validate.mjs';
const result=await validate(safe,reference,{safe:{wasmBinary:await readFile(new URL('../../public/vendor/coolprop-safe/coolprop.wasm',import.meta.url))},
  reference:{wasmBinary:await readFile(new URL('../../public/vendor/coolprop/coolprop.wasm',import.meta.url))}});
await writeFile(new URL('node-results.json',import.meta.url),JSON.stringify(result,null,2)+'\n');
console.log({...result,records:undefined,humid:undefined});
