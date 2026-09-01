import assert from 'node:assert/strict';
import test from 'node:test';
import { getUsageDelta, normalizeGoogleUsage, normalizeOpenAIUsage } from '../src/lib/provider-usage.ts';

test('Gemini usage bills generated candidates and thinking tokens', () => {
  assert.deepEqual(normalizeGoogleUsage({
    promptTokenCount: 1_000,
    cachedContentTokenCount: 200,
    candidatesTokenCount: 500,
    thoughtsTokenCount: 100,
  }), {
    promptTokenCount: 1_000,
    cachedPromptTokenCount: 200,
    candidatesTokenCount: 500,
    reasoningTokenCount: 100,
    billedOutputTokenCount: 600,
  });
});

test('OpenAI usage does not add reasoning tokens twice', () => {
  assert.deepEqual(normalizeOpenAIUsage({
    prompt_tokens: 1_000,
    completion_tokens: 600,
    prompt_tokens_details: { cached_tokens: 200 },
    completion_tokens_details: { reasoning_tokens: 100 },
  }), {
    promptTokenCount: 1_000,
    cachedPromptTokenCount: 200,
    cacheWriteTokenCount: 0,
    candidatesTokenCount: 600,
    reasoningTokenCount: 100,
    billedOutputTokenCount: 600,
  });
});

test('stream usage delta prevents cumulative metadata from being counted twice', () => {
  const first = normalizeGoogleUsage({ promptTokenCount: 100, candidatesTokenCount: 20 });
  const second = normalizeGoogleUsage({ promptTokenCount: 100, candidatesTokenCount: 50 });
  assert.equal(getUsageDelta(second, first)?.promptTokenCount, 0);
  assert.equal(getUsageDelta(second, first)?.billedOutputTokenCount, 30);
});
