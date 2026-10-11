import test from 'node:test';
import assert from 'node:assert/strict';
import { TrendHistory } from './frontend/build/trends.js';

test('two-hour history follows accepted simulation time, bounds storage, and clears on a new run', () => {
  const h = new TrendHistory();
  for (let t = 0; t <= 20000; t += .25) h.accept(t, [3, 5, 1], 'heating');
  const p = h.plot(0);
  assert.ok(p.count >= 720 && p.count <= 721);
  assert.equal(h.accept(20000, [99, 99, 99], 'heating'), false, 'paused/duplicate time adds no samples');
  assert.equal(h.accept(10, [99, 99, 99], 'heating'), false, 'stale output adds no samples');
  assert.equal(h.plot(0).maximum, 3);
  const coords = [...p.path.matchAll(/[ML]([\d.]+) ([\d.]+)/g)].map(m => Number(m[1]));
  assert.ok(coords.every(x => x >= 1 && x <= 111)); assert.equal(coords.at(-1), 111);
  h.clear(); assert.equal(h.plot(0).count, 0); assert.equal(h.plot(0).path, '');
  assert.equal(h.accept(0, [null, 0, .015], 'heating'), true);
});

test('COP gaps, mode changes, negative defrost heat and unavailable numbers remain honest', () => {
  const h = new TrendHistory();
  h.accept(0, [3, 5, 1], 'heating'); h.accept(10, [null, -2, 1], 'heating'); h.accept(20, [2, 3, 1], 'heating');
  assert.equal((h.plot(0).path.match(/M/g) ?? []).length, 2);
  assert.equal(h.plot(1).minimum, -2);
  h.accept(30, [4, 4, 1], 'cooling');
  assert.equal((h.plot(0).path.match(/M/g) ?? []).length, 3);
  h.accept(100, [NaN, Infinity, null], 'cooling');
  assert.ok(!/NaN|Infinity/.test(h.plot(0).path)); assert.equal(h.plot(0).count, 3);
});
