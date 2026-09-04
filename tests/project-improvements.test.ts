import assert from 'node:assert/strict';
import test from 'node:test';
import { paginatePreview, pageForLine } from '../src/lib/preview-pages.ts';
import { encodeProject, decodeProject, rekeyProject, sanitizeProject } from '../src/lib/project-backup.ts';
import { inspectResumeCache, resumeSettingsDigest } from '../src/lib/resume-cache-plan.ts';
import { forecastDocumentCost, type ForecastOptions } from '../src/lib/cost-forecast.ts';
import type { HistoryRecord, SavedRequest } from '../src/lib/db.ts';

const record: HistoryRecord = {id: 'book', title: 'book.md', author: '', coverImage: null, extractedText: 'A short source sentence.',
  translatedText: '', currentChunk: 0, totalChunks: 1, status: 'error', timestamp: 1, model: 'gpt-5.6-luna', extractionComplete: true};
const saved: SavedRequest = {id: 'book:' + 'a'.repeat(64), documentId: 'book', state: 'complete', response: {text: '完整內容', finishReason: 'stop'}};
test('preview pages preserve normal blocks, global lines and complete text', () => {
  const source = Array.from({length: 200}, (_, i) => '# Chapter ' + i + '\n\n' + 'text '.repeat(30) + '\n\n').join('');
  const pages = paginatePreview(source, 1000);
  assert.ok(pages.length > 20);
  assert.equal(pages.map(p => p.text).join(''), source);
  assert.ok(pages.every(p => p.text.length <= 1000));
  assert.equal(pageForLine(pages, pages[3].startLine), 3);
});
test('giant blocks cannot produce an unbounded preview DOM', () => {
  const source = '```\n' + 'very long block '.repeat(5000) + '\n```';
  const pages = paginatePreview(source);
  assert.ok(pages.every(p => p.plain && p.text.length <= 12000));
  assert.equal(pages.map(p => p.text).join(''), source);
});
test('backup round trip removes unknown fields, credentials and provider usage metadata', async () => {
  const text = await encodeProject({record: {...record, apiKey: 'never-export-key'} as HistoryRecord,
    requests: [{...saved, response: {...saved.response!, apiKey: 'never-export-key', usageMetadata: {inputTokens: 50}}} as SavedRequest]});
  assert.ok(!text.includes('never-export-key'));
  assert.ok(!text.includes('usageMetadata'));
  const decoded = await decodeProject(text);
  assert.equal(decoded.record.title, record.title);
  assert.equal(decoded.requests[0].response?.text, saved.response?.text);
  const changed = JSON.parse(text); changed.payload.record.title = 'tampered';
  await assert.rejects(decodeProject(JSON.stringify(changed)), /完整性/);
});
test('backup rejects duplicate, foreign, truncated requests and invalid progress', () => {
  for (const requests of [[saved, saved], [{...saved, documentId: 'foreign'}], [{...saved, response: {text: 'cut', finishReason: 'length'}}]]) {
    assert.throws(() => sanitizeProject({record, requests}));
  }
  assert.throws(() => sanitizeProject({record: {...record, currentChunk: 2}, requests: []}));
  assert.throws(() => sanitizeProject({record: {...record, usageSnapshot: {inputTokens: 1}}, requests: []}));
});
test('backup clones request identities and keeps unresolved billing evidence', () => {
  const clone = rekeyProject({record, requests: [{...saved, state: 'pending', response: undefined}]}, 'new-book');
  assert.equal(clone.record.id, 'new-book');
  assert.equal(clone.requests[0].id, 'new-book:' + 'a'.repeat(64));
  assert.equal(clone.requests[0].state, 'unknown');
  assert.equal(clone.record.pendingRequests, 1);
  assert.equal(record.id, 'book');
});
const settings = {selectedModel: record.model, splitTranslation: true, documentType: 'general', customInstructions: '', chapterProofreading: false};
test('resume inspection stops at the first cache miss without calling a provider', async () => {
  let reads = 0;
  const result = await inspectResumeCache({...record, resumeSettings: await resumeSettingsDigest(settings)}, settings, async () => { reads++; return undefined; });
  assert.equal(reads, 1); assert.equal(result.matches, 0);
  await inspectResumeCache({...record, resumeSettings: await resumeSettingsDigest(settings)}, {...settings, customInstructions: 'changed'}, async () => { throw new Error('must not read'); });
});
test('resume inspection only credits the verified analysis prefix', async () => {
  let reads = 0;
  const result = await inspectResumeCache({...record, resumeSettings: await resumeSettingsDigest(settings)}, settings, async id => {
    reads++;
    return reads === 1 ? {...saved, id, response: {text: '{}', finishReason: 'stop'}} : undefined;
  });
  assert.equal(result.matches, 1);
  assert.equal(result.stages[0].stage, 'analysis');
  assert.equal(reads, 2);
});
test('cache forecast credits one chunk, matches model and avoids duplicate discounts', () => {
  const base: ForecastOptions = {model: record.model, documentTokens: 18000, remainingTokens: 18000, remainingChunks: 10,
    extractionComplete: true, analysisComplete: true, chapterReview: true, documentType: 'general', retryLimit: 3, memoryTokens: 800, spentUsd: 1};
  const before = forecastDocumentCost(base);
  const stage = {stage: 'draft' as const, model: record.model};
  const after = forecastDocumentCost({...base, cachedStages: [stage, stage]});
  const draft = before.rows.find(row => row.stage === 'draft')!;
  assert.ok(Math.abs(after.cacheCreditUsd - (draft.inputUsd + draft.outputUsd) / 10) < 1e-10);
  assert.equal(forecastDocumentCost({...base, cachedStages: [{...stage, model: 'different'}]}).cacheCreditUsd, 0);
  assert.equal(forecastDocumentCost({...base, cachedStages: [stage], inFlightUsd: after.cacheCreditUsd}).remainingUsd, after.remainingUsd);
});
