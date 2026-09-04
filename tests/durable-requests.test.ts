import assert from 'node:assert/strict';
import test from 'node:test';
import { durableRequests } from '../src/lib/durable-requests.ts';
import { TranslationUsageMeter, TranslationBudgetExceededError } from '../src/lib/translation-budget.ts';
import { getModelConfig } from '../src/lib/models.ts';
import type { SavedRequest } from '../src/lib/db.ts';
import type { ContentResult, GenerateContentOptions } from '../src/lib/ai-providers.ts';
import { acquireDocumentLock } from '../src/lib/document-lock.ts';

const options: GenerateContentOptions = { model: 'gpt-5.6-luna', promptText: 'synthetic', costStage: 'analysis' };
function harness() {
  const entries = new Map<string, SavedRequest>();
  const meter = new TranslationUsageMeter();
  let calls = 0, limit = 0, failSave = false;
  let result: ContentResult = { text: '完整結果', finishReason: 'stop', usageMetadata: { promptTokenCount: 100, candidatesTokenCount: 10 } };
  const create = () => durableRequests({
    documentId: 'document', get: async id => entries.get(id),
    save: async (entry, snapshot) => {
      if (failSave) throw new Error('storage failure');
      entries.set(entry.id, structuredClone(entry));
      if (snapshot) persisted = structuredClone(snapshot);
    },
    charge: (part, request) => { meter.add(part.usageMetadata, getModelConfig(request.model), request.costStage); return meter.snapshot(); },
    enforce: request => meter.enforce(getModelConfig(request.model), limit),
    reserve: () => {},
    generate: async () => { calls++; return result; },
    stream: async function* () {
      calls++;
      yield { text: '完整', finishReason: undefined };
      yield { ...result, text: '結果' };
    },
  });
  let persisted = meter.snapshot();
  return { entries, meter, create, calls: () => calls, persisted: () => persisted,
    setLimit: (value: number) => { limit = value; }, failSave: () => { failSave = true; },
    setResult: (value: ContentResult) => { result = value; } };
}

test('reloaded clients reuse exact stage results without charging twice', async () => {
  const h = harness();
  const first = await h.create().generate(options);
  assert.equal(first.usageMetadata, undefined);
  const usage = h.persisted();
  h.meter.restore(usage);
  assert.equal((await h.create().generate(options)).text, first.text);
  assert.equal(h.calls(), 1);
  assert.deepEqual(h.persisted(), usage);
  await h.create().generate({ ...options, costStage: 'retry' });
  assert.equal(h.calls(), 1, 'billing labels must not invalidate successful stage output');
  await h.create().generate({ ...options, promptText: 'changed instructions' });
  await h.create().generate({ ...options, model: 'gpt-5.6-terra' });
  assert.equal(h.calls(), 3);
});

test('budget stop persists the paid result before throwing and resumes without paying again', async () => {
  const h = harness();
  h.setLimit(0.000001);
  await assert.rejects(h.create().generate(options), TranslationBudgetExceededError);
  assert.ok(h.persisted().inputUsd > 0);
  assert.equal([...h.entries.values()][0].state, 'complete');
  h.setLimit(5);
  await h.create().generate(options);
  assert.equal(h.calls(), 1);
});

test('stream completion is cached without repeating usage on replay', async () => {
  const h = harness();
  const request = { ...options, promptText: 'draft', costStage: 'draft' as const };
  for await (const _ of h.create().stream(request)) {}
  const snapshot = h.persisted();
  for await (const _ of h.create().stream(request)) {}
  assert.equal(h.calls(), 1);
  assert.deepEqual(h.persisted(), snapshot);
});

test('truncated results are billed but never reused as successful stages', async () => {
  const h = harness();
  h.setResult({ text: 'partial', finishReason: 'length', usageMetadata: { promptTokenCount: 100 } });
  await assert.rejects(h.create().generate(options), /未完整結束/);
  await assert.rejects(h.create().generate(options), /未完整結束/);
  assert.equal(h.calls(), 2);
  assert.equal(h.persisted().inputTokens, 200);
});

test('a completed response with missing usage stays uncertain but is reusable', async () => {
  const h = harness();
  h.setResult({ text: 'complete', finishReason: 'stop' });
  await h.create().generate(options);
  assert.equal([...h.entries.values()][0].state, 'unknown');
  await h.create().generate(options);
  assert.equal(h.calls(), 1);
});

test('storage failure prevents starting paid requests', async () => {
  const h = harness(); h.failSave();
  await assert.rejects(h.create().generate(options), /storage failure/);
  assert.equal(h.calls(), 0);
});

test('document lock excludes duplicate work and releases on completion', async () => {
  const held = new Set<string>();
  const locks = { request: async (name: string, _options: unknown, callback: (lock: object | null) => Promise<void>) => {
    if (held.has(name)) return callback(null);
    held.add(name);
    try { await callback({ name }); } finally { held.delete(name); }
  } } as unknown as LockManager;
  const release = await acquireDocumentLock('same-source', locks);
  await assert.rejects(acquireDocumentLock('same-source', locks), /另一個分頁/);
  await release();
  await (await acquireDocumentLock('same-source', locks))();
  assert.equal(held.size, 0);
});
