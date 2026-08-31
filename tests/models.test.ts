import assert from 'node:assert/strict';
import test from 'node:test';
import { calculateTokenCost, estimatePipelineCost, getModelConfig } from '../src/lib/models.ts';

test('model lookup falls back to the default model', () => {
  assert.equal(getModelConfig('missing-model').id, 'gemini-3.7-flash');
  assert.equal(getModelConfig('gpt-5.6-luna').provider, 'openai');
});

test('token cost calculation uses per-million-token prices', () => {
  const cost = calculateTokenCost(getModelConfig('gpt-5.6-luna'), 1_000_000, 500_000);
  assert.equal(cost.inputUsd, 0.2);
  assert.equal(cost.outputUsd, 0.6);
  assert.equal(cost.totalUsd, 0.8);
  assert.equal(cost.totalTwd, 26);
});

test('pipeline estimate keeps document and billable token counts separate', () => {
  const estimate = estimatePipelineCost(getModelConfig('gemini-3.7-flash'), 1_000);
  assert.equal(estimate.inputTokens, 4_000);
  assert.equal(estimate.outputTokens, 2_500);
});
