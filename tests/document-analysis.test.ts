import assert from 'node:assert/strict';
import test from 'node:test';
import { buildDocumentAnalysisPrompt, parseDocumentAnalysis, sampleDocumentForAnalysis } from '../src/lib/document-analysis.ts';

test('combined analysis prompt includes the source only once and caps its length', () => {
  const marker = 'SOURCE_MARKER';
  const prompt = buildDocumentAnalysisPrompt(marker + 'a'.repeat(60_000));
  assert.equal(prompt.match(new RegExp(marker, 'g'))?.length, 1);
  assert.ok(prompt.length < 52_000);
});

test('analysis parser accepts JSON fences and normalizes missing values', () => {
  assert.deepEqual(parseDocumentAnalysis('```json\n{"glossary":"A: 甲","characterMap":"","styleGuide":"正式","globalSummary":"摘要"}\n```'), {
    glossary: 'A: 甲',
    characterMap: '無',
    styleGuide: '正式',
    globalSummary: '摘要',
    documentType: 'general',
  });
  assert.deepEqual(parseDocumentAnalysis('invalid'), {
    glossary: '無',
    characterMap: '無',
    styleGuide: '一般/通用',
    globalSummary: '',
    documentType: 'general',
  });
});

test('analysis sampling covers the beginning, middle, and end of long documents', () => {
  const source = Array.from({ length: 100 }, (_, index) => `${String(index).padStart(3, '0')}:${'x'.repeat(100)}`).join('\n');
  const sample = sampleDocumentForAnalysis(source, 3_000, 3);
  assert.match(sample, /000:/);
  assert.match(sample, /099:/);
  assert.match(sample, /文件取樣 2\/3/);
});
