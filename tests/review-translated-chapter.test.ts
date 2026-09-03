import assert from 'node:assert/strict';
import test from 'node:test';
import { reviewTranslatedChapter } from '../src/lib/review-translated-chapter.ts';
import { TranslationBudgetExceededError } from '../src/lib/translation-budget.ts';

const input = {
  model: 'gemini-3.7-flash', sourceChapter: '# Setup\n\nRun `npm test`.',
  translatedChapter: '# 設定\n\n執行 `npm test`。', documentType: 'technical' as const,
  style: '一般', glossary: '無', characterMap: '無',
};

test('chapter service restores protected content and reports usage before returning', async () => {
  let billed = false;
  const result = await reviewTranslatedChapter({
    ...input,
    generate: async request => {
      assert.equal(request.maxOutputTokens, 16384);
      assert.equal(request.jsonSchema?.name, 'chapter_consistency_proofreading');
      assert.ok(request.promptText?.includes('__PDFT_PROTECTED_0001__'));
      return { text: JSON.stringify({
        correctedChapter: '# 設定\n\n執行 __PDFT_PROTECTED_0001__。',
        consistencyIssues: [], newTerms: ['setup: 設定'], newCharacters: [],
      }), usageMetadata: { promptTokenCount: 10 } };
    },
    onUsage: () => { billed = true; },
  });
  assert.equal(billed, true);
  assert.equal(result.correctedChapter, input.translatedChapter);
  assert.deepEqual(result.newTerms, ['setup: 設定']);
});

test('invalid chapter edits retain incurred usage and reject instead of replacing text', async () => {
  let billed = 0;
  await assert.rejects(reviewTranslatedChapter({
    ...input,
    generate: async () => ({ text: JSON.stringify({
      correctedChapter: '# 設定\n\n執行測試。', consistencyIssues: [], newTerms: [], newCharacters: [],
    }), usageMetadata: { promptTokenCount: 10 } }),
    onUsage: () => { billed++; },
  }), /completeness/);
  assert.equal(billed, 1);
});

test('chapter service preserves budget errors for transactional rollback by the caller', async () => {
  const error = new TranslationBudgetExceededError(5.1, 5);
  await assert.rejects(reviewTranslatedChapter({
    ...input, generate: async () => ({ text: '{}', usageMetadata: { promptTokenCount: 10 } }),
    onUsage: () => { throw error; },
  }), actual => actual === error);
});
