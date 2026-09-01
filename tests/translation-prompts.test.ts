import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildCorrectionPrompt,
  buildExtractionPrompt,
  buildTranslationPrompt,
  buildTranslationSystemInstruction,
  parseCorrectionResult,
} from '../src/lib/translation-prompts.ts';

test('translation prompt builders preserve source and context fields', () => {
  assert.match(buildTranslationPrompt('SOURCE'), /SOURCE/);
  const system = buildTranslationSystemInstruction({
    style: '正式',
    glossary: 'AI: 人工智慧',
    characterMap: 'Alice: 主角',
    plotSummary: '抵達城市',
    previousSourceText: 'Previous',
    previousTranslatedText: '前文',
    customInstructions: '保留品牌名稱',
  });
  for (const value of ['正式', 'AI: 人工智慧', 'Alice: 主角', '抵達城市', 'Previous', '前文', '保留品牌名稱']) {
    assert.ok(system.includes(value));
  }
});

test('correction and extraction prompts retain required content', () => {
  const correction = buildCorrectionPrompt({
    sourceText: 'SOURCE',
    draftTranslation: '草稿',
    glossary: 'TERM',
    characterMap: 'CHARACTER',
    customInstructions: '',
  });
  for (const value of ['SOURCE', '草稿', 'TERM', 'CHARACTER', 'JSON Schema']) {
    assert.ok(correction.includes(value));
  }
  assert.ok(buildExtractionPrompt('RAW_TEXT', true).includes('RAW_TEXT'));
  assert.ok(!buildExtractionPrompt('', false).includes('RAW_TEXT'));
});

test('correction parser enforces the structured output contract', () => {
  const result = parseCorrectionResult(JSON.stringify({
    correctedTranslation: '修正版',
    newTerms: [],
    newCharacters: [],
    chunkSummary: '摘要',
    foundHallucinations: false,
    missingContentDetected: false,
  }));
  assert.equal(result.correctedTranslation, '修正版');
  assert.throws(() => parseCorrectionResult('{"correctedTranslation":"缺少欄位"}'));
});

