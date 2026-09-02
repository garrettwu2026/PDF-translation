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
  assert.deepEqual(meter.add(), {
    inputTokens: 0,
    cachedInputTokens: 0,
    cacheWriteInputTokens: 0,
    outputTokens: 0,
    reasoningTokens: 0,
  });
});

test('usage meter applies cached input pricing and Gemini reasoning output', () => {
  const meter = new TranslationUsageMeter();
  meter.add({
    promptTokenCount: 1_000_000,
    cachedPromptTokenCount: 200_000,
    candidatesTokenCount: 500_000,
    reasoningTokenCount: 100_000,
    billedOutputTokenCount: 600_000,
  });
  const cost = meter.cost(getModelConfig('gemini-3.7-flash'));
  assert.equal(cost.cachedInputTokens, 200_000);
  assert.ok(Math.abs(cost.inputUsd - 0.615) < Number.EPSILON);
  assert.equal(cost.outputUsd, 2.25);
  assert.ok(Math.abs(cost.totalUsd - 2.865) < Number.EPSILON);
});

test('retry limit is clamped to the supported range', () => {
  assert.equal(clampRetryLimit(0), 1);
  assert.equal(clampRetryLimit(3.4), 3);
  assert.equal(clampRetryLimit(99), 6);
});

test('usage meter prices mixed translation and review models independently', () => {
  const meter = new TranslationUsageMeter();
  meter.add({ promptTokenCount: 1_000_000 }, getModelConfig('gpt-5.6-luna'));
  meter.add({ candidatesTokenCount: 100_000 }, getModelConfig('gpt-5.6-sol'));
  const cost = meter.cost(getModelConfig('gpt-5.6-luna'));
  assert.equal(cost.inputUsd, 0.2);
  assert.equal(cost.outputUsd, 2);
  assert.equal(cost.totalUsd, 2.2);
});
