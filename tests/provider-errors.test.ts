import assert from 'node:assert/strict';
import test from 'node:test';
import {
  classifyProviderError,
  formatProviderErrorForUser,
  getRetryDelayMs,
  isRetryableProviderError,
  normalizeProviderError,
} from '../src/lib/provider-errors.ts';

test('classifies permanent provider errors without retrying them', () => {
  const auth = classifyProviderError(Object.assign(new Error('Invalid API key'), { status: 401 }));
  const request = classifyProviderError(Object.assign(new Error('Unsupported temperature'), { status: 400 }));
  assert.equal(auth.category, 'auth');
  assert.equal(request.category, 'invalid_request');
  assert.equal(isRetryableProviderError(auth), false);
  assert.equal(isRetryableProviderError(request), false);
  assert.match(formatProviderErrorForUser(request), /不接受目前的請求設定/);
});

test('classifies transient and rate-limit errors and honors Retry-After', () => {
  const limited = classifyProviderError({
    status: 429,
    message: 'Rate limit reached',
    headers: new Headers({ 'Retry-After': '7' }),
  });
  const unavailable = classifyProviderError(Object.assign(new Error('fetch failed'), { status: 503 }));
  const quota403 = classifyProviderError(Object.assign(new Error('Quota exceeded'), { status: 403 }));
  assert.equal(limited.category, 'rate_limit');
  assert.equal(getRetryDelayMs(limited, 0), 7_000);
  assert.equal(unavailable.category, 'transient');
  assert.equal(quota403.category, 'rate_limit');
  assert.equal(isRetryableProviderError(unavailable), true);
});

test('redacts API keys from provider error messages', () => {
  const normalized = normalizeProviderError(new Error('request failed for sk-abcdefghijklmnopqrstuvwxyz'));
  assert.doesNotMatch(normalized.message, /sk-abcdefghijklmnopqrstuvwxyz/);
  assert.equal(classifyProviderError(normalized).category, 'unknown');
});
