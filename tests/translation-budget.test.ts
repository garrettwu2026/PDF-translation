import assert from 'node:assert/strict';
import test from 'node:test';
import { getModelConfig } from '../src/lib/models.ts';
import {
  TranslationBudgetExceededError,
  TranslationUsageMeter,
  clampRetryLimit,
} from '../src/lib/translation-budget.ts';

test('usage meter accumulates provider usage and enforces a USD limit', () => {
  const meter = new TranslationUsageMeter();
  meter.add({ promptTokenCount: 1_000_000, candidatesTokenCount: 500_000 });
  assert.throws(() => meter.enforce(getModelConfig('gpt-5.6-luna'), 0.5), TranslationBudgetExceededError);
  assert.equal(meter.enforce(getModelConfig('gpt-5.6-luna'), 1).totalUsd, 0.8);
  meter.reset();
  assert.deepEqual(meter.add(), { inputTokens: 0, outputTokens: 0 });
});

test('retry limit is clamped to the supported range', () => {
  assert.equal(clampRetryLimit(0), 1);
  assert.equal(clampRetryLimit(3.4), 3);
  assert.equal(clampRetryLimit(99), 6);
});
