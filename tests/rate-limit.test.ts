import assert from 'node:assert/strict';
import test from 'node:test';
import { FixedWindowRateCounter } from '../server/rate-limit.ts';

test('fixed-window limiter blocks excess requests and resets', () => {
  const counter = new FixedWindowRateCounter(2, 1_000);
  assert.equal(counter.consume('client', 0).allowed, true);
  assert.equal(counter.consume('client', 100).remaining, 0);
  assert.equal(counter.consume('client', 200).allowed, false);
  assert.equal(counter.consume('client', 1_000).allowed, true);
});

test('expired client entries can be pruned', () => {
  const counter = new FixedWindowRateCounter(2, 1_000);
  counter.consume('a', 0);
  counter.consume('b', 500);
  counter.prune(1_100);
  assert.equal(counter.size, 1);
});
