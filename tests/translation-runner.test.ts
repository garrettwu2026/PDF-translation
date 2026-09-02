import assert from 'node:assert/strict';
import test from 'node:test';
import { protectContent } from '../src/lib/protected-content.ts';
import { annotateTranslationSegments } from '../src/lib/sentence-segments.ts';
import { translateChunkWithQuality } from '../src/lib/translation-runner.ts';

test('chunk pipeline restores protected content and repairs only a missing sentence', async () => {
  const source = 'Run `npm test`. First sentence. Second sentence.';
  const protectedSource = protectContent(source);
  const annotated = annotateTranslationSegments(protectedSource.text);
  const missing = annotated.segments[1];
  const draft = annotated.text.replace(`${missing.marker}${missing.source}`, '');
  let generatedCalls = 0;

  const result = await translateChunkWithQuality({
    sourceText: source,
    model: 'test-model',
    chunkNumber: 1,
    totalChunks: 1,
    retryLimit: 2,
    style: '一般',
    glossary: '無',
    characterMap: '無',
    plotSummary: '',
    previousSourceText: '',
    previousTranslatedText: '',
    customInstructions: '',
    documentTypeInstruction: '一般文件',
    documentType: 'general',
    signal: new AbortController().signal,
    generateStream: async function* () { yield { text: draft }; },
    generate: async () => {
      generatedCalls++;
      if (generatedCalls === 1) {
        return { text: JSON.stringify({
          correctedTranslation: draft,
          newTerms: [],
          newCharacters: [],
          chunkSummary: '摘要',
          foundHallucinations: false,
          missingContentDetected: true,
          missingSentenceIds: [missing.id],
        }) };
      }
      return { text: JSON.stringify({ repairs: [{ id: missing.id, translation: '第一句。' }] }) };
    },
    onUsage: () => undefined,
    onPreview: () => undefined,
    onStage: () => undefined,
  });

  assert.equal(generatedCalls, 2);
  assert.ok(result.translatedText.includes('`npm test`'));
  assert.ok(result.translatedText.includes('第一句。'));
});

test('chunk pipeline selectively sends risky meaning to the stronger review model', async () => {
  const source = 'The supplier shall not disclose the trade secret.';
  const annotated = annotateTranslationSegments(source);
  const draft = `${annotated.segments[0].marker}供應商應揭露營業秘密。`;
  const models: string[] = [];
  let generatedCalls = 0;
  const result = await translateChunkWithQuality({
    sourceText: source,
    model: 'gpt-5.6-luna',
    chunkNumber: 1,
    totalChunks: 1,
    retryLimit: 2,
    style: '正式',
    glossary: '- trade secret: 商業機密',
    characterMap: '無',
    plotSummary: '',
    previousSourceText: '',
    previousTranslatedText: '',
    customInstructions: '',
    documentTypeInstruction: '法律文件',
    documentType: 'business_legal',
    signal: new AbortController().signal,
    generateStream: async function* () { yield { text: draft }; },
    generate: async ({ model }) => {
      models.push(model);
      generatedCalls++;
      if (generatedCalls === 1) {
        return { text: JSON.stringify({
          correctedTranslation: draft,
          newTerms: [],
          newCharacters: [],
          chunkSummary: '',
          foundHallucinations: false,
          missingContentDetected: false,
          missingSentenceIds: [],
        }) };
      }
      return { text: JSON.stringify({ revisions: [{
        id: annotated.segments[0].id,
        translation: '供應商不得揭露商業機密。',
        reason: '修復否定與術語',
      }] }) };
    },
    onUsage: () => undefined,
    onPreview: () => undefined,
    onStage: () => undefined,
  });
  assert.deepEqual(models, ['gpt-5.6-luna', 'gpt-5.6-terra']);
  assert.equal(result.translatedText, '供應商不得揭露商業機密。');
});

test('a chunk retry does not pay for semantic review more than once', async () => {
  const source = 'The cache policy applies after deployment.';
  const annotated = annotateTranslationSegments(source);
  const wrong = `${annotated.segments[0].marker}部署後會套用暫存規則。`;
  const corrected = `${annotated.segments[0].marker}部署後會套用快取策略。`;
  const models: string[] = [];
  let correctionCalls = 0;
  const result = await translateChunkWithQuality({
    sourceText: source,
    model: 'gpt-5.6-luna',
    chunkNumber: 1,
    totalChunks: 1,
    retryLimit: 2,
    style: '正式',
    glossary: '- cache policy: 快取策略',
    characterMap: '無',
    plotSummary: '',
    previousSourceText: '',
    previousTranslatedText: '',
    customInstructions: '',
    documentTypeInstruction: '技術文件',
    documentType: 'technical',
    signal: new AbortController().signal,
    generateStream: async function* () { yield { text: wrong }; },
    generate: async ({ model }) => {
      models.push(model);
      if (model === 'gpt-5.6-terra') return { text: '{"revisions":[]}' };
      correctionCalls++;
      return { text: JSON.stringify({
        correctedTranslation: correctionCalls === 1 ? wrong : corrected,
        newTerms: [],
        newCharacters: [],
        chunkSummary: '',
        foundHallucinations: false,
        missingContentDetected: false,
        missingSentenceIds: [],
      }) };
    },
    onUsage: () => undefined,
    onPreview: () => undefined,
    onStage: () => undefined,
  });
  assert.equal(models.filter((model) => model === 'gpt-5.6-terra').length, 1);
  assert.equal(correctionCalls, 2);
  assert.equal(result.translatedText, '部署後會套用快取策略。');
});
