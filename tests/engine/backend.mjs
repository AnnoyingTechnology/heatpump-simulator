// Exercise identical physical assertions against either exact HEOS artifact.
// The public loader is configured separately; this selector affects tests only.
const backend = process.env.HEATPUMP_TEST_BACKEND ?? 'legacy';
if (!['legacy', 'guarded'].includes(backend)) throw new Error(`Unknown test backend: ${backend}`);
const url = backend === 'guarded'
  ? '../../public/vendor/coolprop-safe/adapter.js'
  : '../../public/vendor/coolprop/coolprop.js';
export default (await import(url)).default;
