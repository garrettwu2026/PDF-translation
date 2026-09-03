import assert from 'node:assert/strict';
import test from 'node:test';
import { costProfile, forecastDocumentCost, normalizeCostSamples, type ForecastOptions } from '../src/lib/cost-forecast.ts';
import { calculateTokenCost, getModelConfig } from '../src/lib/models.ts';
import { TranslationUsageMeter } from '../src/lib/translation-budget.ts';
import { estimatePromptOverheads } from '../src/lib/cost-prompts.ts';

const base: ForecastOptions = {
  model: 'gpt-5.6-luna', documentTokens: 18000, remainingTokens: 18000,
  remainingChunks: 10, extractionComplete: true, analysisComplete: false,
  chapterReview: true, documentType: 'novel', retryLimit: 2, memoryTokens: 800, spentUsd: 0,
};
const close = (a: number, b: number) => assert.ok(Math.abs(a - b) < 1e-9, a + ' != ' + b);

test('prompt overheads follow current templates, schemas and actual document memory', () => {
  const context = { style: 'formal', glossary: '無', characterMap: '無', plotSummary: '',
    customInstructions: '', documentType: 'novel' as const };
  const minimal = estimatePromptOverheads(context);
  const expanded = estimatePromptOverheads({ ...context, glossary: '角色：固定名稱。'.repeat(100) });
  assert.ok(minimal.draft > 1250);
  for (const stage of ['draft', 'correction', 'semantic_review', 'chapter_review'] as const) {
    assert.ok(expanded[stage] > minimal[stage]);
  }
  assert.ok(forecastDocumentCost({ ...base, promptOverheads: expanded }).remainingUsd
    > forecastDocumentCost({ ...base, promptOverheads: minimal }).remainingUsd);
});

test('analysis sampling and five-page PDF extraction batches are estimated independently', () => {
  const first = forecastDocumentCost({ ...base, extractionComplete: false, extractionChunks: 2,
    analysisSourceTokens: 20000 });
  const second = forecastDocumentCost({ ...base, extractionComplete: false, extractionChunks: 4,
    analysisSourceTokens: 40000 });
  assert.ok(second.rows.find(r => r.stage === 'extraction')!.inputUsd > first.rows.find(r => r.stage === 'extraction')!.inputUsd);
  assert.equal(second.rows.find(r => r.stage === 'analysis')!.inputTokens - first.rows.find(r => r.stage === 'analysis')!.inputTokens, 20000);
  close(first.rows.find(r => r.stage === 'draft')!.inputUsd, second.rows.find(r => r.stage === 'draft')!.inputUsd);
});

test('forecast uses reviewer model pricing rather than the cheaper translation model', () => {
  const result = forecastDocumentCost(base);
  const review = result.rows.find(r => r.stage === 'semantic_review')!;
  assert.equal(review.model, 'gpt-5.6-terra');
  const billed = calculateTokenCost(getModelConfig(review.model), review);
  close(review.inputUsd + review.outputUsd, billed.totalUsd);
  assert.ok(result.rows.some(r => r.stage === 'correction'));
});

test('completed extraction and analysis are excluded from remaining cost', () => {
  const before = forecastDocumentCost({ ...base, extractionComplete: false });
  const setup = before.rows.filter(r => ['analysis', 'extraction'].includes(r.stage))
    .reduce((sum, r) => sum + r.inputUsd + r.outputUsd, 0);
  const after = forecastDocumentCost({ ...base, analysisComplete: true, spentUsd: setup });
  assert.ok(!after.rows.some(r => ['analysis', 'extraction'].includes(r.stage)));
  close(before.totalUsd, after.totalUsd);
  close(after.totalUsd, after.remainingUsd + setup);
  const halfway = forecastDocumentCost({ ...base, extractionComplete: false, remainingExtractionRatio: 0.5 });
  close(halfway.rows.find(r => r.stage === 'extraction')!.outputUsd,
    before.rows.find(r => r.stage === 'extraction')!.outputUsd / 2);
});

test('unknown scanned source is not treated as a known zero cost', () => {
  const result = forecastDocumentCost({ ...base, documentTokens: null, remainingTokens: null, spentUsd: 1.25 });
  assert.equal(result.known, false);
  assert.deepEqual(result.rows, []);
  assert.equal(result.totalUsd, 1.25);
});

test('completed document has zero remaining cost and keeps historical spend', () => {
  const result = forecastDocumentCost({ ...base, remainingTokens: 0, remainingChunks: 0, spentUsd: 2.5 });
  assert.equal(result.remainingUsd, 0);
  assert.equal(result.totalUsd, 2.5);
  assert.equal(result.highUsd, 2.5);
});

test('context growth, chapter review and retries affect baseline independently', () => {
  const result = forecastDocumentCost(base);
  assert.ok(forecastDocumentCost({ ...base, memoryTokens: 4000 }).remainingUsd > result.remainingUsd);
  assert.ok(forecastDocumentCost({ ...base, chapterReview: false }).remainingUsd < result.remainingUsd);
  const noRetry = forecastDocumentCost({ ...base, retryLimit: 1 });
  assert.ok(!noRetry.rows.some(r => r.stage === 'retry'));
  const retry = forecastDocumentCost({ ...base, retryLimit: 6 });
  close(retry.rows.find(r => r.stage === 'semantic_review')!.outputUsd,
    result.rows.find(r => r.stage === 'semantic_review')!.outputUsd);
});

test('calibration requires three committed samples and retains a baseline allowance', () => {
  const profile = costProfile(base.model, base.documentType, base.chapterReview, base.retryLimit);
  const samples = Array.from({ length: 12 }, () => ({ profile, sourceTokens: 1800, costUsd: 1 }));
  const before = forecastDocumentCost({ ...base, samples: samples.slice(0, 2) });
  assert.equal(before.calibrated, false);
  const after = forecastDocumentCost({ ...base, analysisComplete: true, samples });
  const baseline = forecastDocumentCost({ ...base, analysisComplete: true });
  assert.equal(after.calibrated, true);
  close(after.remainingUsd, baseline.remainingUsd * 0.2 + 10 * 0.8);
  assert.ok(after.remainingUsd > baseline.remainingUsd);
  for (const changes of [{ model: 'gpt-5.6-terra' }, { documentType: 'technical' },
    { chapterReview: false }, { retryLimit: 3 }, { customInstructions: 'formal tone' }]) {
    assert.equal(forecastDocumentCost({ ...base, samples, ...changes }).calibrated, false);
  }
});

test('in-flight charges are credited only while pending and never make remaining negative', () => {
  const planned = forecastDocumentCost({ ...base, analysisComplete: true });
  const running = forecastDocumentCost({ ...base, analysisComplete: true, spentUsd: 0.001, inFlightUsd: 0.001 });
  close(planned.totalUsd, running.totalUsd);
  const paused = forecastDocumentCost({ ...base, analysisComplete: true, spentUsd: 0.001, inFlightUsd: 0 });
  close(paused.totalUsd, planned.totalUsd + 0.001);
  const overspent = forecastDocumentCost({ ...base, analysisComplete: true, spentUsd: 999, inFlightUsd: 999 });
  close(overspent.remainingUsd, planned.remainingUsd * 0.9);
  close(overspent.totalUsd, 999 + planned.remainingUsd * 0.9);
});

test('sample normalization drops malformed data and bounds history size', () => {
  assert.deepEqual(normalizeCostSamples({ samples: [] }), []);
  assert.deepEqual(normalizeCostSamples([null, { profile: 'x', sourceTokens: 0, costUsd: 1 },
    { profile: 'x', sourceTokens: 1, costUsd: NaN }]), []);
  assert.equal(normalizeCostSamples(Array.from({ length: 20 }, () => ({
    profile: 'x', sourceTokens: 1, costUsd: 1,
  }))).length, 12);
});

test('stage ledger persists mixed-model costs and billed reasoning exactly once', () => {
  const meter = new TranslationUsageMeter();
  meter.add({ promptTokenCount: 1000, cachedPromptTokenCount: 500, candidatesTokenCount: 200,
    billedOutputTokenCount: 300, reasoningTokenCount: 100 }, getModelConfig(base.model), 'draft');
  meter.add({ promptTokenCount: 500, billedOutputTokenCount: 100 }, getModelConfig('gpt-5.6-terra'), 'semantic_review');
  const restored = new TranslationUsageMeter();
  restored.restore(meter.snapshot());
  assert.deepEqual(restored.snapshot(), meter.snapshot());
  const rows = restored.snapshot().breakdown!;
  assert.equal(rows.length, 2);
  assert.equal(rows[0].outputTokens, 300);
  assert.equal(rows[0].reasoningTokens, 100);
  close(rows.reduce((sum, r) => sum + r.inputUsd + r.outputUsd, 0), restored.cost(getModelConfig(base.model)).totalUsd);
  restored.add({ candidatesTokenCount: 10 }, getModelConfig(base.model), 'retry');
  assert.equal(restored.snapshot().breakdown!.length, 3);
});

test('legacy and invalid stage breakdowns preserve stored costs without repricing', () => {
  const meter = new TranslationUsageMeter();
  const legacy = { inputTokens: 10, outputTokens: 20, inputUsd: 2, outputUsd: 3 };
  for (const breakdown of [undefined, 'invalid', [{ stage: 'draft', model: base.model,
    inputTokens: 1, outputTokens: 1, reasoningTokens: 0, inputUsd: 999, outputUsd: 999 }]]) {
    meter.restore({ ...legacy, breakdown } as never);
    assert.equal(meter.cost(getModelConfig(base.model)).totalUsd, 5);
    assert.equal(meter.snapshot().breakdown![0].stage, 'legacy');
    assert.equal(meter.snapshot().breakdown![0].model, 'unknown');
  }
  meter.reset();
  assert.deepEqual(meter.snapshot().breakdown, []);
});
