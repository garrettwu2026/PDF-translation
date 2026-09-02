import assert from 'node:assert/strict';
import test from 'node:test';
import { decideChapterProofreading, parseChapterProofreadingResult, shouldProofreadChapter } from '../src/lib/chapter-proofreading.ts';

test('detects chapter and bounded review boundaries', () => {
  assert.equal(shouldProofreadChapter(['a', '# Next'], 0, 1), true);
  assert.equal(shouldProofreadChapter(['a', 'b'], 0, 6), true);
  assert.equal(shouldProofreadChapter(['a', 'b'], 0, 1), false);
  assert.equal(shouldProofreadChapter(['a'], 0, 1), true);
});

test('chapter review only runs at a boundary when risk signals justify the extra request', () => {
  const quiet = decideChapterProofreading({
    chunks: ['a', 'b', 'c', 'd', 'e', 'f', 'g'],
    index: 5,
    chapterChunkCount: 6,
    documentType: 'general',
    newTermCount: 0,
    newCharacterCount: 0,
    qualityWarningCount: 0,
  });
  assert.equal(quiet.boundary, true);
  assert.equal(quiet.shouldReview, false);

  const risky = decideChapterProofreading({
    chunks: ['a', '# Next'],
    index: 0,
    chapterChunkCount: 1,
    documentType: 'novel',
    newTermCount: 0,
    newCharacterCount: 1,
    qualityWarningCount: 0,
  });
  assert.equal(risky.shouldReview, true);
  assert.deepEqual(risky.reasons, ['characters', 'high_risk_document']);
});

test('parses strict chapter proofreading output', () => {
  const result = parseChapterProofreadingResult('{"correctedChapter":"譯文","consistencyIssues":[],"newTerms":[],"newCharacters":[]}');
  assert.equal(result.correctedChapter, '譯文');
});
