import { writeFile } from 'node:fs/promises';
import { openPage } from './browser-session.mjs';

const page = await openPage('http://127.0.0.1:5174/browser-probe.html');
try {
  await page.waitFor('Boolean(window.probeResult || window.probeError)', 20000);
  const error = await page.evaluate('window.probeError');
  if (error) throw new Error(error);
  const result = await page.evaluate('window.probeResult');
  await writeFile('research/coolprop-probe/browser-results.json', JSON.stringify(result, null, 2) + '\n');
  console.log(JSON.stringify({ version: result.backendVersion, initMs: result.initMs, totalMs: result.totalMs,
    fluids: result.fluids.map(({ fluid, fourCallBatch, maxRoundTripK, error }) => ({ fluid, fourCallBatch, maxRoundTripK, error })),
    mixtureCoverage: result.explicitMixtures.map(({fluid, coverage}) => ({ fluid, results: Object.fromEntries(Object.entries(coverage).map(([name,value]) => [name, value.error || 'passed'])) })),
    browserErrors: page.events.filter((e) => e.method === 'Runtime.exceptionThrown').map((e) => e.params),
  }, null, 2));
} finally { await page.close(); }
