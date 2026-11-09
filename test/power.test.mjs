// #17: a-priori voting power (normalized Banzhaf, Shapley-Shubik), exact, from seats alone.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { banzhaf, shapleyShubik, powerIndices, contextFor } from '../site/js/compat.js';
import { loadData } from '../scripts/lib.mjs';

const close = (got, want, msg) => got.forEach((x, i) => assert.ok(Math.abs(x - want[i]) < 1e-12, `${msg}: [${got}] vs [${want}]`));
const sum = (xs) => xs.reduce((n, x) => n + x, 0);

test('known small games', () => {
  // [4; 3, 2, 2]: any two of the three win, so the weights don't matter.
  close(banzhaf([3, 2, 2], 4), [1 / 3, 1 / 3, 1 / 3], 'Banzhaf [4; 3,2,2]');
  close(shapleyShubik([3, 2, 2], 4), [1 / 3, 1 / 3, 1 / 3], 'Shapley-Shubik [4; 3,2,2]');
  // [4; 3, 2, 1]: the first is a swing in 3 of the 5 swings, and pivotal in 4 of the 6 orders.
  close(banzhaf([3, 2, 1], 4), [3 / 5, 1 / 5, 1 / 5], 'Banzhaf [4; 3,2,1]');
  close(shapleyShubik([3, 2, 1], 4), [4 / 6, 1 / 6, 1 / 6], 'Shapley-Shubik [4; 3,2,1]');
  // [51; 50, 49, 1]: 49 seats and 1 seat have the same power.
  close(banzhaf([50, 49, 1], 51), [3 / 5, 1 / 5, 1 / 5], 'Banzhaf [51; 50,49,1]');
  close(shapleyShubik([50, 49, 1], 51), [4 / 6, 1 / 6, 1 / 6], 'Shapley-Shubik [51; 50,49,1]');
});

test('a dictator has all the power, and a faction with no swings has none', () => {
  close(banzhaf([4, 2, 1], 4), [1, 0, 0], 'Banzhaf dictator');
  close(shapleyShubik([4, 2, 1], 4), [1, 0, 0], 'Shapley-Shubik dictator');
  // [6; 3, 3, 1]: 1 seat never turns a losing set into a winning one (3 + 1 < 6, 3 + 3 already wins).
  assert.equal(banzhaf([3, 3, 1], 6)[2], 0);
  assert.equal(shapleyShubik([3, 3, 1], 6)[2], 0);
  assert.deepEqual([banzhaf([5, 0], 3)[1], shapleyShubik([5, 0], 3)[1]], [0, 0], 'zero seats');
});

// Brute force: every subset for Banzhaf, every order for Shapley-Shubik. Orders are walked by prefix: once a prefix
// reaches the quota, its last faction is the pivot for all (rest)! ways to finish the order.
const fact = (k) => (k < 2 ? 1 : k * fact(k - 1));
function bruteForce(w, q) {
  const n = w.length;
  const swings = new Array(n).fill(0);
  for (let m = 0; m < 1 << n; m++) {
    const s = w.reduce((t, x, i) => t + (m & (1 << i) ? x : 0), 0);
    w.forEach((x, i) => { if (!(m & (1 << i)) && s < q && s + x >= q) swings[i]++; });
  }
  const pivots = new Array(n).fill(0);
  const walk = (rest, s) => rest.forEach((i, j) => {
    const next = rest.filter((_, k) => k !== j);
    if (s + w[i] >= q) pivots[i] += fact(next.length);
    else walk(next, s + w[i]);
  });
  walk([...w.keys()], 0);
  const all = sum(swings);
  return { b: swings.map((x) => (all ? x / all : 0)), s: pivots.map((x) => x / fact(n)) };
}

test('matches brute force on random games, and each index sums to 1', () => {
  let seed = 17;
  const rand = (k) => { seed = (seed * 1103515245 + 12345) % 2 ** 31; return seed % k; };
  for (let g = 0; g < 200; g++) {
    const w = Array.from({ length: 1 + rand(6) }, () => rand(12));
    const total = sum(w);
    const q = 1 + rand(Math.max(1, total));
    const bf = bruteForce(w, q);
    close(banzhaf(w, q), bf.b, `Banzhaf [${q}; ${w}]`);
    close(shapleyShubik(w, q), bf.s, `Shapley-Shubik [${q}; ${w}]`);
    if (total >= q) {
      assert.ok(Math.abs(sum(banzhaf(w, q)) - 1) < 1e-12, `Banzhaf sums to 1 [${q}; ${w}]`);
      assert.ok(Math.abs(sum(shapleyShubik(w, q)) - 1) < 1e-12, `Shapley-Shubik sums to 1 [${q}; ${w}]`);
    }
  }
});

test('weights and quota must be whole numbers', () => {
  assert.throws(() => banzhaf([2.5, 3], 3), /whole seat counts/);
  assert.throws(() => shapleyShubik([2, 3], 0), /quota/);
});

test('the CEC results: every faction in party order, each index sums to 1, seats sum to 120', () => {
  const { meta, parties, topics, positions, results } = loadData();
  const ctx = contextFor({ meta: { ...meta, mode: 'results' }, parties, topics, positions, results });
  const rows = powerIndices(ctx);
  const order = ctx.parties.map((p) => p.id).filter((id) => ctx.passed(id));
  assert.deepEqual(rows.map((r) => r.partyId), order, 'party order, not by index');
  assert.equal(sum(rows.map((r) => r.seats)), 120);
  assert.ok(Math.abs(sum(rows.map((r) => r.banzhaf)) - 1) < 1e-12);
  assert.ok(Math.abs(sum(rows.map((r) => r.shapleyShubik)) - 1) < 1e-12);
  const bf = bruteForce(rows.map((r) => r.seats), 61);
  close(rows.map((r) => r.banzhaf), bf.b, 'Banzhaf on the results');
  close(rows.map((r) => r.shapleyShubik), bf.s, 'Shapley-Shubik on the results');
});
