import { spawn, spawnSync } from 'node:child_process';
import { availableParallelism } from 'node:os';
import { createHash } from 'node:crypto';
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2), value = (name, fallback) => { const i = args.indexOf(`--${name}`); return i < 0 ? fallback : args[i + 1]; };
const preset = value('preset', 'quick'), seed = Number(value('seed', '20261011'));
if (!(Number.isInteger(seed) && seed >= 0 && seed <= 0xffffffff)) throw new Error('Seed must be a uint32 integer');
if (!['smoke','quick','endurance'].includes(preset)) throw new Error('Preset must be smoke, quick or endurance');
const requestedWorkers = Number(value('workers', '8'));
if (!(Number.isInteger(requestedWorkers) && requestedWorkers > 0)) throw new Error('Workers must be a positive integer');
const workers = Math.max(1, Math.min(12, availableParallelism() - 1 || 1, requestedWorkers));
const timeoutMs = Number(value('timeout', '240')) * 1000;
if (!(Number.isFinite(timeoutMs) && timeoutMs > 0)) throw new Error('Timeout must be positive and finite');
const destination = resolve(root, value('output', `/tmp/heatpump-robustness-${preset}-${seed}`));
if (existsSync(destination)) throw new Error(`Refusing to overwrite campaign evidence: ${destination}`);
mkdirSync(destination, { recursive: true }); const snapshot = `${destination}/snapshot`;
mkdirSync(snapshot); cpSync(`${root}/src/engine`, `${snapshot}/src`, { recursive: true });
cpSync(`${root}/public/vendor/coolprop-safe`, `${snapshot}/vendor`, { recursive: true });
cpSync(`${root}/tools/robustness-worker.mjs`, `${snapshot}/worker.mjs`);
cpSync(`${root}/tools/robustness-campaign.mjs`, `${snapshot}/campaign-source.mjs`);
writeFileSync(`${snapshot}/package.json`, '{"type":"module"}\n');
writeFileSync(`${snapshot}/tsconfig.json`, JSON.stringify({ compilerOptions: { target: 'ES2022', module: 'ESNext', moduleResolution: 'Bundler', lib: ['ES2022', 'DOM'], strict: true, skipLibCheck: true, rewriteRelativeImportExtensions: true, outDir: 'build', rootDir: 'src' }, include: ['src/**/*.ts'] }));
const compilation = spawnSync(`${root}/node_modules/.bin/tsc`, ['-p', `${snapshot}/tsconfig.json`], { encoding: 'utf8' });
if (compilation.status !== 0) throw new Error(compilation.stdout + compilation.stderr);
const hashes = {};
function hashTree(path, prefix) { for (const entry of readdirSync(path, { withFileTypes: true })) { if (entry.isDirectory()) hashTree(`${path}/${entry.name}`, `${prefix}/${entry.name}`); else hashes[`${prefix}/${entry.name}`] = createHash('sha256').update(readFileSync(`${path}/${entry.name}`)).digest('hex'); } }
hashTree(`${snapshot}/src`, 'src/engine'); hashTree(`${snapshot}/build`, 'compiled'); hashTree(`${snapshot}/vendor`, 'public/vendor/coolprop-safe');
hashes['tools/robustness-worker.mjs'] = createHash('sha256').update(readFileSync(`${snapshot}/worker.mjs`)).digest('hex');
hashes['tools/robustness-campaign.mjs'] = createHash('sha256').update(readFileSync(`${snapshot}/campaign-source.mjs`)).digest('hex');
const { defaultEngineConfig } = await import(pathToFileURL(`${snapshot}/build/defaults.js`));
let randomState = seed; const random = () => { randomState += 0x6d2b79f5; let t = randomState; t = Math.imul(t ^ t >>> 15, t | 1); t ^= t + Math.imul(t ^ t >>> 7, t | 61); return ((t ^ t >>> 14) >>> 0) / 4294967296; };
const pick = list => list[Math.floor(random() * list.length)], range = (a, b) => a + random() * (b - a);
const scenarios = [], base = n => { const c = defaultEngineConfig(n); c.indoorPortCapacity = Math.max(n, 5); return c; };
const add = (id, config, seconds, operations = []) => scenarios.push({ id, seed, config, operations: [{ type: 'step', seconds }, ...operations] });
const friend = base(3); friend.mode = 'cooling'; friend.outdoorTemperatureC = 5.5; friend.outdoorRelativeHumidity = .71;
friend.rooms.forEach((r, i) => Object.assign(r, { volumeM3: [65,43.75,187.5][i], setpointC: [21,23.5,21][i], envelopeWK: [238,249,255][i] }));
add('reported-friend-cold-cooling', friend, preset === 'smoke' ? 30 : 1100);
for (const house of [true, false]) {
  const c = base(3); c.indoorPortCapacity = 3; c.outdoorTemperatureC = 1; c.outdoorRelativeHumidity = .35;
  if (house) {
    const rooms = [{ volumeM3:84, initialTemperatureC:18.3, setpointC:21, enabled:false, envelopeWK:15, internalGainW:0 },
      { volumeM3:155, initialTemperatureC:21.5, setpointC:21.5, enabled:true, envelopeWK:25, internalGainW:0 },
      { volumeM3:100, initialTemperatureC:18, setpointC:17, enabled:true, envelopeWK:45, internalGainW:200 }];
    c.rooms.forEach((r,i)=>Object.assign(r,rooms[i]));
    c.interzoneLinks = [{ roomA:c.rooms[1].id, roomB:c.rooms[2].id, conductanceWK:200 },{ roomA:c.rooms[1].id,roomB:c.rooms[0].id,conductanceWK:120 }];
  }
  // Warm stores under strong heating, then reverse without restart. Speed 50×
  // affects caller pacing only; the real engine still accepts quarter-second steps.
  c.rooms.forEach(r=>{if(r.enabled)r.setpointC=26;});
  const cooling=structuredClone(c); cooling.mode='cooling'; cooling.outdoorTemperatureC=42;
  cooling.rooms.forEach(r=>r.setpointC=17);
  add(`reported-owner-reversal-${house?'winter-house':'old-generic'}`,c,preset==='smoke'?5:300,
    [{type:'update',config:cooling},{type:'step',seconds:preset==='smoke'?5:900}]);
}
for (const mode of ['heating', 'cooling']) for (const outdoorC of [-25, -5, 5.5, 25, 45]) for (const rh of [0, 1]) {
  const c = base(pick([1,3,5,8])); c.mode = mode; c.outdoorTemperatureC = outdoorC; c.outdoorRelativeHumidity = rh;
  c.rooms.forEach((r, i) => Object.assign(r, { initialTemperatureC: mode === 'cooling' ? 30 : 17, setpointC: mode === 'cooling' ? 17 : 26,
    envelopeWK: pick([0,45,255,750]), cleanFraction: i % 2 ? .1 : 1 }));
  c.outdoor.cleanFraction = pick([.1,1]);
  add(`grid-${mode}-${outdoorC}-${rh}`, c, preset === 'smoke' ? 2 : preset === 'quick' ? 20 : 120);
}
const sequences = preset === 'smoke' ? 2 : preset === 'quick' ? 8 : 32;
for (let s = 0; s < sequences; s++) {
  const c = base(pick([1,3,5,8])); c.mode = pick(['heating','cooling']); c.outdoorTemperatureC = range(-25,45); c.outdoorRelativeHumidity = random();
  c.rooms.forEach((r,i) => { Object.assign(r, { volumeM3: range(5,250) * range(2.2,6), initialTemperatureC: range(17,30), setpointC: range(17,26), envelopeWK: range(0,750), internalGainW: range(0,1000), ventilationACH: range(0,2), cleanFraction: range(.1,1), enabled: random() > .2 });
    if (i && random() > .3) (c.interzoneLinks ??= []).push({ roomA: c.rooms[i - 1].id, roomB: r.id, conductanceWK: range(0,2000) }); });
  c.outdoor.cleanFraction = range(.1,1); c.compressor.isentropicEfficiency = range(.4,.9);
  const operations = []; let next = structuredClone(c);
  for (let t=0;t<(preset === 'smoke' ? 2 : 6);t++) {
    next = structuredClone(next);
    if (t % 3 === 0) { next.mode = next.mode === 'heating' ? 'cooling' : 'heating'; next.outdoorTemperatureC = range(-25,45); next.outdoorRelativeHumidity = random(); }
    next.rooms.forEach(r => { r.setpointC = range(17,26); r.enabled = random() > .3; r.cleanFraction = range(.1,1); });
    operations.push({ type: 'update', config: next }, { type: 'step', seconds: preset === 'smoke' ? 2 : preset === 'quick' ? 10 : 120 });
  }
  add(`sequence-${s}`, c, preset === 'smoke' ? 2 : preset === 'quick' ? 10 : 120, operations);
}
if (args.includes('--extended')) {
  for (let s=0;s<12;s++) {
    const c=base([1,3,5,8][s%4]); c.mode=s%2?'cooling':'heating';
    c.outdoorTemperatureC=pick([-25,-5,5,25,45]); c.outdoorRelativeHumidity=pick([0,.5,1]);
    c.compressor.displacementM3rev*=pick([.2,1,5]); c.compressor.speedMaxRps=pick([18,75,375]); c.compressor.isentropicEfficiency=pick([.4,.7,.9]);
    c.control.defrostSpeedRps=Math.min(c.control.defrostSpeedRps,c.compressor.speedMaxRps);
    c.control.fixedSpeedRps=Math.min(c.control.fixedSpeedRps,c.compressor.speedMaxRps);
    c.outdoor.airConductanceWK*=pick([.2,1,5]); c.outdoor.refrigerantConductanceWK*=pick([.2,1,5]); c.outdoor.airMassFlowKgs*=pick([.2,1,5]); c.outdoor.depositionAreaM2*=pick([.2,1,5]);
    const indoorAir=pick([.2,1,5]), indoorFluid=pick([.2,1,5]), indoorFlow=pick([.2,1,5]);
    c.rooms.forEach(r=>{r.volumeM3=pick([11,60,1500]); r.setpointC=c.mode==='cooling'?17:26; r.initialTemperatureC=c.mode==='cooling'?30:17;
      r.airConductanceWK*=indoorAir; r.refrigerantConductanceWK*=indoorFluid; r.airMassFlowKgs*=indoorFlow;
      r.pipe.lengthM=pick([1,3,10,40]);r.pipe.gasInsideDiameterM=pick([.00792,.0111,.01388]);r.pipe.liquidInsideDiameterM=pick([.00475,.00792]);r.pipe.insulationConductanceWmK=pick([0,.05,1]);});
    const edited=structuredClone(c); edited.rooms[0].volumeM3=c.rooms[0].volumeM3===11?1500:11;
    add(`extended-physical-lines-and-component-bounds-${s}`,c,preset==='smoke'?2:30,[{type:'update',config:edited},{type:'step',seconds:preset==='smoke'?2:30}]);
  }
}
if (preset === 'endurance') {
  const c = base(3); c.outdoorTemperatureC = 2; c.outdoorRelativeHumidity = 1; c.rooms.forEach(r => r.setpointC = 26); add('endurance-humid-frost-defrost', c, 7200);
  const d = base(3); d.mode = 'cooling'; d.outdoorTemperatureC = 45; d.outdoorRelativeHumidity = 1; d.rooms.forEach(r => Object.assign(r, { initialTemperatureC: 30, setpointC: 17, envelopeWK: 350 })); add('endurance-hot-wet-cooling', d, 3600);
}
// Replay a retained failing input against newly frozen source, or select a
// bounded subset without altering the seed or generated scenario values.
const replayPath = value('replay', null), only = value('only', null);
if (replayPath) {
  const files = replayPath.split(',').flatMap(path => { const resolved=resolve(path); return statSync(resolved).isDirectory() ? readdirSync(resolved).filter(n=>n.endsWith('.json')).sort().map(n=>`${resolved}/${n}`) : [resolved]; });
  const retained=files.map(path=>({ ...JSON.parse(readFileSync(path,'utf8')), replayInputPath:path })), used=new Set();
  retained.forEach((s,i)=>{ if(used.has(s.id)){s.originalScenarioId=s.id;s.id=`${s.id}-replay-${i}`;}used.add(s.id); });
  scenarios.splice(0, scenarios.length, ...retained);
}
else if (only) { const selected = scenarios.filter(s => s.id.includes(only)); scenarios.splice(0, scenarios.length, ...selected); }
if (!scenarios.length) throw new Error('No scenarios selected');
const durationCap=Number(value('duration-cap','Infinity'));
if (!(durationCap>=.25)) throw new Error('Duration cap must be at least 0.25 seconds');
if (durationCap!==Infinity) scenarios.forEach(s=>s.operations.forEach(o=>{if(o.type==='step')o.seconds=Math.min(o.seconds,Math.floor(durationCap/.25)*.25);}));
const metadata = { createdAt: new Date().toISOString(), preset, seed, workers, timeoutMs, sourceHashes: hashes,
  nodeVersion: process.version, platform: process.platform, architecture: process.arch,
  extendedComponentAndLineBounds: args.includes('--extended'),
  segmentDurationCapSeconds: durationCap===Infinity ? null : durationCap,
  method: 'Independent Node child processes; immutable TypeScript snapshot compiled once; production guarded HEOS; fixed accepted 0.25-second steps; full before-step checkpoint persisted for native aborts.',
  limits: 'Reference R32 engine only. Passing a finite campaign is not proof of correctness. Generic component parameters, not calibrated manufacturer maps. The screenshot scenario is reconstructed from visible controls, not a saved exact pre-crash state.',
  scenarios: scenarios.map(s => ({ id: s.id, requestedSeconds: s.operations.filter(o => o.type === 'step').reduce((n,o)=>n+o.seconds,0) })) };
writeFileSync(`${destination}/manifest.json`, JSON.stringify(metadata, null, 2));
let cursor=0; const results=[];
const failureCategory = result => {
  if (result.outcome === 'pass') return null;
  const message = result.error?.message ?? '';
  if (message.includes('Indoor coil icing')) return 'indoor-icing-guard';
  if (message.includes('Indoor air outlet fog')) return 'indoor-fog-guard';
  if (message.includes('Humid air')) return 'psychrometric-domain';
  if (message.includes('shared-pressure') || message.includes('controller closes')) return 'pressure-solver-or-envelope';
  return result.outcome;
};
async function run(s) {
  const dir = `${destination}/${s.id}`; mkdirSync(dir); writeFileSync(`${dir}/input.json`, JSON.stringify(s,null,2));
  const stdout = [], stderr = [];
  return await new Promise(resolveResult => {
    const child = spawn(process.execPath, [`${snapshot}/worker.mjs`, snapshot, `${dir}/input.json`, `${dir}/progress.json`, `${dir}/result.json`], { cwd: snapshot, stdio: ['ignore','pipe','pipe'] });
    child.stdout.on('data',d => stdout.push(d)); child.stderr.on('data',d => stderr.push(d));
    let timedOut = false; const timer = setTimeout(() => { timedOut=true; child.kill('SIGKILL'); }, timeoutMs);
    child.on('close',(code,signal) => { clearTimeout(timer); writeFileSync(`${dir}/stdout.log`,Buffer.concat(stdout)); writeFileSync(`${dir}/stderr.log`,Buffer.concat(stderr));
      let result = existsSync(`${dir}/result.json`) ? JSON.parse(readFileSync(`${dir}/result.json`)) : { id:s.id, outcome: timedOut ? 'timeout' : 'native-abort-or-process-failure', exitCode:code, signal,
        acceptedProgress: existsSync(`${dir}/progress.json`) ? JSON.parse(readFileSync(`${dir}/progress.json`)) : null, stderr:Buffer.concat(stderr).toString() };
      // A result written before disposal cannot hide a subsequent WASM abort,
      // uncaught exception or process timeout. Expected recorded failures exit1.
      if (timedOut || signal || (code !== 0 && result.outcome === 'pass') || (code !== 0 && code !== 1)) {
        result = { ...result, recordedOutcomeBeforeExit: result.outcome, outcome: timedOut ? 'timeout' : 'native-abort-or-process-failure',
          exitCode: code, signal, stderr: Buffer.concat(stderr).toString(), acceptedProgress: existsSync(`${dir}/progress.json`) ? JSON.parse(readFileSync(`${dir}/progress.json`)) : null };
      }
      result.failureCategory = failureCategory(result);
      writeFileSync(`${dir}/result.json`,JSON.stringify(result,null,2));
      console.log(JSON.stringify({ id: s.id, outcome:result.outcome, simulatedSeconds: result.simulatedSeconds ?? result.acceptedProgress?.acceptedOutput?.simulatedSeconds, error:result.error?.message, originalException:result.originalException?.message, wallSeconds:result.wallSeconds }));
      resolveResult(result);
    });
  });
}
await Promise.all(Array.from({length:Math.min(workers,scenarios.length)},async()=>{ while(cursor<scenarios.length) { const scenario=scenarios[cursor++]; results.push(await run(scenario)); writeFileSync(`${destination}/summary.json`,JSON.stringify({...metadata,completed:results.length,counts:results.reduce((a,r)=>(a[r.outcome]=(a[r.outcome]??0)+1,a),{}),results:results.map(({final,...r})=>r)},null,2)); } }));
console.log(`Evidence: ${destination}`); if(results.some(r=>r.outcome!=='pass'))process.exitCode=1;
