// Exercise the reported scenario through production controls, without development imports.
import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { openPage } from './browser-session.mjs';
import { activateControl } from './browser-controls.mjs';

const url = process.argv[2] ?? 'https://annoyingtechnology.github.io/heatpump-simulator/';
const page = await openPage(url);
const result = { checkedAt: new Date().toISOString(), url, requestedSpeed: 5,
  outdoorC: -.5, humidityPct: 35, atticEnabled: false, upstairsTargetC: 22.5,
  groundTargetC: 17.5, samples: [], passed: false };
try {
  await page.send('Page.bringToFront');
  await page.waitFor('document.querySelector(".opstate")?.dataset.kind === "running"', 60000);
  await activateControl(page, 'Pause');
  await new Promise(r => setTimeout(r, 1200));
  await page.evaluate(`(() => {
    const edit = (input, value) => { if (!input) throw Error('Missing control');
      input.value = String(value); input.dispatchEvent(new Event('input', { bubbles: true })); };
    const weather = document.querySelectorAll('[aria-label="Outdoor air"] input[type="number"]');
    edit(weather[0], -.5); edit(weather[1], 35);
    const targets = [...document.querySelectorAll('input[type="number"]')]
      .filter(e => e.getAttribute('aria-label')?.startsWith('Requested target temperature'));
    edit(targets.find(e => e.getAttribute('aria-label').includes('Upstairs')), 22.5);
    edit(targets.find(e => e.getAttribute('aria-label').includes('Ground')), 17.5);
    const attic = document.querySelector('input[role="switch"][aria-label^="Attic "]');
    if (!attic) throw Error('Missing attic control');
    if (attic.checked) attic.click();
    const speed = document.querySelector('select[aria-label="Requested speed"]');
    speed.value = '5'; speed.dispatchEvent(new Event('change', { bubbles: true }));
  })()`);
  result.confirmedControls = await page.evaluate(`(() => {
    const weather = document.querySelectorAll('[aria-label="Outdoor air"] input[type="number"]');
    const targets = [...document.querySelectorAll('input[type="number"]')]
      .filter(e => e.getAttribute('aria-label')?.startsWith('Requested target temperature'));
    return { outdoorC: Number(weather[0].value), humidityPct: Number(weather[1].value),
      groundTargetC: Number(targets.find(e => e.getAttribute('aria-label').includes('Ground')).value),
      upstairsTargetC: Number(targets.find(e => e.getAttribute('aria-label').includes('Upstairs')).value),
      atticEnabled: document.querySelector('input[role="switch"][aria-label^="Attic "]').checked,
      requestedSpeed: Number(document.querySelector('select[aria-label="Requested speed"]').value) };
  })()`);
  assert.deepEqual(result.confirmedControls, { outdoorC: -.5, humidityPct: 35,
    groundTargetC: 17.5, upstairsTargetC: 22.5, atticEnabled: false, requestedSpeed: 5 });
  result.startSeconds = await page.evaluate(`(() => {
    const [m,s] = document.querySelector('.time').textContent.split(':').map(Number);
    return m*60+s;
  })()`);
  await activateControl(page, 'Resume');
  const start = Date.now();
  let last = -1, minute = -1;
  while (Date.now() - start < 300000) {
    await new Promise(r => setTimeout(r, 1000));
    const reading = await page.evaluate(`(() => {
      const text = document.querySelector('.time').textContent;
      const [m,s] = text.split(':').map(Number);
      return { time: m*60+s, state: document.querySelector('.opstate').dataset.kind,
        fault: document.querySelector('.mismatch').textContent,
        dischargeC: document.querySelector('[data-probe="compressor-discharge"]')?.dataset.exact };
    })()`);
    assert.notEqual(reading.state, 'fault', reading.fault);
    assert.ok(Number.isFinite(reading.time) && reading.time >= last, 'clock reset');
    if (reading.dischargeC && Number.isFinite(Number(reading.dischargeC))) {
      assert.ok(Number(reading.dischargeC) <= 145, 'hard discharge limit');
    }
    if (Math.floor(reading.time / 60) !== minute) {
      result.samples.push(reading); console.log(JSON.stringify(reading));
    }
    last = reading.time; minute = Math.floor(last / 60);
    if (last - result.startSeconds >= 600) {
      result.passed = true; result.finalSeconds = last;
      result.scenarioSeconds = last - result.startSeconds; break;
    }
  }
  assert.equal(result.passed, true, 'production endurance timeout');
  assert.deepEqual(page.events.filter(e => e.method === 'Runtime.exceptionThrown'), []);
  result.wallSeconds = (Date.now() - start) / 1000;
  console.log('PASS hosted owner controls at 5× past 600 physical seconds');
} catch (error) {
  result.error = String(error); throw error;
} finally {
  await writeFile('reviews/github-pages-stability-browser-results.json', JSON.stringify(result, null, 2) + '\n');
  await page.close();
}
