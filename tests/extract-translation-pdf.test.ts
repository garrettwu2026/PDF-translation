import assert from 'node:assert/strict';
import test from 'node:test';
import { extractTranslationPdf, type ExtractionWorker } from '../src/lib/extract-translation-pdf.ts';
import { TranslationBudgetExceededError } from '../src/lib/translation-budget.ts';
import type { ContentResult, GenerateContentOptions } from '../src/lib/ai-providers.ts';

class FakeWorker {
  messages: Array<{ type: string; payload: { requestId: string; index?: number } }> = [];
  listeners = new Set<(event: MessageEvent) => unknown>();
  addEventListener(_type: string, listener: (event: MessageEvent) => unknown) { this.listeners.add(listener); }
  removeEventListener(_type: string, listener: (event: MessageEvent) => unknown) { this.listeners.delete(listener); }
  postMessage(message: typeof this.messages[number]) { this.messages.push(message); }
  async emit(type: string, payload: Record<string, unknown> = {}) {
    await Promise.all([...this.listeners].map(listener => listener({ data: { type, payload: { requestId: 'task', ...payload } } } as MessageEvent)));
  }
}

function setup(generate: (options: GenerateContentOptions) => Promise<ContentResult>, onUsage = () => {}) {
  const worker = new FakeWorker();
  const controller = new AbortController();
  const progress: Array<{ completed: number; total: number; markdown: string }> = [];
  const job = extractTranslationPdf({
    worker: worker as unknown as ExtractionWorker, fileBuffer: new ArrayBuffer(0), requestId: 'task',
    model: 'gemini-3.7-flash', retryLimit: 1, signal: controller.signal, isCancelled: () => false,
    generate, onUsage, onTotal: () => {}, onProgress: p => progress.push(p), onWarning: () => {},
  });
  return { worker, controller, progress, job };
}

test('extraction keeps native/OCR requests, usage, ordered progress and ACKs scoped to the task', async () => {
  const calls: GenerateContentOptions[] = [];
  let billed = 0;
  const run = setup(async options => {
    calls.push(options);
    return { text: calls.length === 1 ? 'Native page' : 'Scanned page', usageMetadata: { promptTokenCount: 10 } };
  }, () => { billed++; });
  await run.worker.emit('EXTRACTION_CHUNK', { requestId: 'old-task', index: 0, rawText: 'Ignored' });
  assert.equal(calls.length, 0);
  await run.worker.emit('TOTAL_CHUNKS', { totalChunks: 2 });
  await run.worker.emit('EXTRACTION_CHUNK', { index: 0, rawText: 'Readable native source text', base64: 'unused' });
  assert.equal(billed, 1);
  assert.equal(run.progress[0].markdown, 'Native page');
  assert.equal(calls[0].base64Pdf, undefined);
  assert.equal(calls[0].maxOutputTokens, 8192);
  assert.equal(calls[0].signal, run.controller.signal);
  await run.worker.emit('EXTRACTION_CHUNK', { index: 1, rawText: '', base64: 'synthetic-pdf' });
  assert.equal(calls[1].base64Pdf, 'synthetic-pdf');
  assert.equal(await run.job, 'Native page\n\nScanned page');
  assert.equal(billed, 2);
  assert.deepEqual(run.worker.messages.filter(m => m.type === 'EXTRACTION_CHUNK_ACK').map(m => m.payload.index), [0, 1]);
  assert.equal(run.worker.listeners.size, 0);
});

test('extraction rejects a failed final batch and retains only successful progress', async () => {
  let calls = 0;
  const run = setup(async () => { if (++calls === 2) throw new Error('synthetic failure'); return { text: 'Completed' }; });
  const rejected = assert.rejects(run.job, /synthetic failure/);
  await run.worker.emit('TOTAL_CHUNKS', { totalChunks: 2 });
  await run.worker.emit('EXTRACTION_CHUNK', { index: 0, rawText: 'Readable native source text' });
  await run.worker.emit('EXTRACTION_CHUNK', { index: 1, rawText: 'Readable native source text' });
  await rejected;
  assert.equal(run.progress.length, 1);
  assert.equal(run.worker.listeners.size, 0);
  assert.equal(run.worker.messages.at(-1)!.type, 'CANCEL_TASK');
});

test('extraction budget stops propagate without acknowledging the uncommitted batch', async () => {
  const error = new TranslationBudgetExceededError(5.1, 5);
  const run = setup(async () => ({ text: 'Paid result', usageMetadata: { promptTokenCount: 10 } }), () => { throw error; });
  const rejected = assert.rejects(run.job, actual => actual === error);
  await run.worker.emit('TOTAL_CHUNKS', { totalChunks: 1 });
  await run.worker.emit('EXTRACTION_CHUNK', { index: 0, rawText: 'Readable native source text' });
  await rejected;
  assert.equal(run.progress.length, 0);
  assert.equal(run.worker.messages.filter(m => m.type === 'EXTRACTION_CHUNK_ACK').length, 0);
  assert.equal(run.worker.listeners.size, 0);
});

test('aborting extraction settles promptly and ignores an obsolete provider response', async () => {
  let finish!: (result: ContentResult) => void;
  let billed = 0;
  const run = setup(() => new Promise(resolve => { finish = resolve; }), () => { billed++; });
  const rejected = assert.rejects(run.job, { name: 'AbortError' });
  await run.worker.emit('TOTAL_CHUNKS', { totalChunks: 1 });
  const pending = run.worker.emit('EXTRACTION_CHUNK', { index: 0, rawText: 'Readable native source text' });
  run.controller.abort();
  await rejected;
  finish({ text: 'Late result', usageMetadata: { promptTokenCount: 10 } });
  await pending;
  assert.equal(run.progress.length, 0);
  assert.equal(billed, 0);
  assert.equal(run.worker.listeners.size, 0);
});

test('worker-reported errors clean up listeners', async () => {
  const run = setup(async () => ({ text: '' }));
  const rejected = assert.rejects(run.job, /worker failed/);
  await run.worker.emit('ERROR', { message: 'worker failed' });
  await rejected;
  assert.equal(run.worker.listeners.size, 0);
});

test('worker startup failure still cleans listeners when cancellation also fails', async () => {
  const worker = new FakeWorker();
  const failure = new Error('worker unavailable');
  worker.postMessage = () => { throw failure; };
  const job = extractTranslationPdf({
    worker: worker as unknown as ExtractionWorker, fileBuffer: new ArrayBuffer(0), requestId: 'task',
    model: 'gemini-3.7-flash', retryLimit: 1, signal: new AbortController().signal, isCancelled: () => false,
    generate: async () => ({ text: '' }), onUsage: () => {}, onTotal: () => {},
    onProgress: () => {}, onWarning: () => {},
  });
  await assert.rejects(job, actual => actual === failure);
  assert.equal(worker.listeners.size, 0);
});
