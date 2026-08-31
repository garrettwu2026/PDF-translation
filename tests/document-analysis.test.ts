import assert from 'node:assert/strict';
import test from 'node:test';
import { buildDocumentAnalysisPrompt, parseDocumentAnalysis } from '../src/lib/document-analysis.ts';

test('combined analysis prompt includes the source only once and caps its length', () => {
  const marker = 'SOURCE_MARKER';
  const prompt = buildDocumentAnalysisPrompt(marker + 'a'.repeat(60_000));
  assert.equal(prompt.match(new RegExp(marker, 'g'))?.length, 1);
  assert.ok(prompt.length < 52_000);
});

test('analysis parser accepts JSON fences and normalizes missing values', () => {
  assert.deepEqual(parseDocumentAnalysis('```json\n{"glossary":"A: 甲","characterMap":"","styleGuide":"正式"}\n```'), {
    glossary: 'A: 甲',
    characterMap: '無',
    styleGuide: '正式',
  });
  assert.deepEqual(parseDocumentAnalysis('invalid'), {
    glossary: '無',
    characterMap: '無',
    styleGuide: '一般/通用',
  });
});
