// Experimental exact HEOS facade. No unsafe AbstractState binding is exported.
import initialize from './coolprop.js';
const pairs = Object.freeze(Object.fromEntries([
  'PT_INPUTS','HmassP_INPUTS','PSmass_INPUTS','PQ_INPUTS','QT_INPUTS',
  'DmassP_INPUTS','DmassUmass_INPUTS','DmassT_INPUTS',
].map((name, index) => [name, index])));
const getters = ['T','p','hmass','smass','rhomass','Q','cpmass','viscosity','speed_sound'];

export default async function create(options = {}) {
  const native = await initialize(options);
  const bytes = 2048, error = native._malloc(bytes);
  if (!error) throw new Error('Cannot allocate native error buffer');
  let disposed = false;
  const live = new Set();
  function strings(...values) { if (values.some(v => typeof v !== 'string')) throw new Error('Property names must be strings'); }
  function numbers(...values) { if (values.some(v => typeof v !== 'number')) throw new Error('Property inputs must be numbers'); }
  function call(name, types, args, failed) {
    if (disposed) throw new Error('CoolProp module disposed');
    const result = native.ccall(name, 'number', [...types, 'number', 'number'], [...args, error, bytes]);
    if (failed(result)) throw new Error(native.UTF8ToString(error) || `Native ${name} failed`);
    return result;
  }
  function numeric(name, args, failed) {
    if (disposed) throw new Error('CoolProp module disposed');
    const result = native[`_${name}`](...args, error, bytes);
    if (failed(result)) throw new Error(native.UTF8ToString(error) || `Native ${name} failed`);
    return result;
  }
  const module = {
    guardedStateApi: true,
    input_pairs: pairs,
    factory(backend, fluid) {
      strings(backend, fluid);
      const id = call('hp_create', ['string','string'], [backend, fluid], value => value === 0);
      let deleted = false;
      function alive() { if (deleted) throw new Error('CoolProp state deleted'); }
      const state = {
        update(pair, a, b) {
          alive();
          if (typeof a !== 'number' || typeof b !== 'number') {
            // Never let WASM's coercion throw before native invalidation.
            numeric('hp_update', [id, 0xffffffff, NaN, NaN], value => value !== 0);
          }
          // Invalid JS pair still crosses the guarded native boundary, so it
          // invalidates previous readouts rather than retaining stale state.
          numeric('hp_update',
            [id, Number.isInteger(pair) && pair >= 0 && pair < 8 ? pair : 0xffffffff, a, b], value => value !== 0);
        },
        delete() {
          if (deleted) return;
          numeric('hp_destroy', [id], value => value !== 0);
          deleted = true; live.delete(state);
        },
      };
      getters.forEach((name, index) => { state[name] = () => {
        alive(); return numeric('hp_read', [id, index], value => !Number.isFinite(value));
      }; });
      live.add(state); return state;
    },
    PropsSI(output, key1, a, key2, b, fluid) {
      strings(output, key1, key2, fluid); numbers(a, b);
      return call('hp_props', ['string','string','number','string','number','string'],
        [output,key1,a,key2,b,fluid], value => !Number.isFinite(value));
    },
    HAPropsSI(output, key1, a, key2, b, key3, c) {
      strings(output, key1, key2, key3); numbers(a, b, c);
      return call('hp_haprops', ['string','string','number','string','number','string','number'],
        [output,key1,a,key2,b,key3,c], value => !Number.isFinite(value));
    },
    dispose() {
      if (disposed) return;
      for (const state of [...live]) state.delete();
      native._free(error); disposed = true;
    },
  };
  return module;
}
