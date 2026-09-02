import assert from 'node:assert/strict';
import test from 'node:test';
import { calculateTokenCost, estimatePipelineCost, getModelCatalogStatus, getModelConfig, getQualityReviewModelId, getTemperatureConfig } from '../src/lib/models.ts';

test('model lookup falls back to the default model', () => {
  assert.equal(getModelConfig('missing-model').id, 'gemini-3.7-flash');
  assert.equal(getModelConfig('gpt-5.6-luna').provider, 'openai');
});

test('sampling config omits unsupported GPT-5.6 temperatures', () => {
  assert.deepEqual(getTemperatureConfig(getModelConfig('gpt-5.6-luna'), 0.1), {});
  assert.deepEqual(getTemperatureConfig(getModelConfig('gpt-5.6-sol'), 0.2), {});
  assert.deepEqual(getTemperatureConfig(getModelConfig('gemini-3.7-flash'), 0.1), { temperature: 0.1 });
});

test('selective quality review stays with the provider and avoids an unnecessary premium-model upgrade', () => {
  assert.equal(getQualityReviewModelId('gemini-3.5-flash-lite'), 'gemini-3.7-flash');
  assert.equal(getQualityReviewModelId('gemini-3.1-pro-preview'), 'gemini-3.1-pro-preview');
  assert.equal(getQualityReviewModelId('gpt-5.6-luna'), 'gpt-5.6-terra');
  assert.equal(getQualityReviewModelId('gpt-5.6-terra'), 'gpt-5.6-terra');
  assert.equal(getQualityReviewModelId('gpt-5.6-sol'), 'gpt-5.6-sol');
});

test('token cost calculation uses per-million-token prices', () => {
  const cost = calculateTokenCost(getModelConfig('gpt-5.6-luna'), { inputTokens: 1_000_000, outputTokens: 500_000 });
  assert.equal(cost.inputUsd, 0.2);
  assert.equal(cost.outputUsd, 0.6);
  assert.equal(cost.totalUsd, 0.8);
  assert.equal(cost.totalTwd, 26);
});

test('token cost calculation discounts cached input without double-counting it', () => {
  const cost = calculateTokenCost(getModelConfig('gpt-5.6-luna'), {
    inputTokens: 1_000_000,
    cachedInputTokens: 200_000,
    cacheWriteInputTokens: 100_000,
    outputTokens: 500_000,
  });
  assert.equal(cost.regularInputTokens, 700_000);
  assert.equal(cost.cachedInputUsd, 0.004);
  assert.ok(Math.abs(cost.inputUsd - 0.164) < Number.EPSILON);
  assert.equal(cost.outputUsd, 0.6);
  assert.ok(Math.abs(cost.totalUsd - 0.764) < Number.EPSILON);
});

test('pipeline estimate keeps document and billable token counts separate', () => {
  const estimate = estimatePipelineCost(getModelConfig('gemini-3.7-flash'), 1_000);
  assert.equal(estimate.inputTokens, 4_000);
  assert.equal(estimate.outputTokens, 2_500);
});

test('catalog status reminds maintainers when routine or promotional review is due', () => {
  assert.equal(getModelCatalogStatus('2026-09-01').needsReview, false);
  assert.equal(getModelCatalogStatus('2026-10-16').needsReview, true);
  assert.equal(getModelCatalogStatus('2026-11-05').upcomingPricingReview?.modelName, 'Gemini 3.7 Flash');
});

