import assert from 'node:assert/strict';
import test from 'node:test';
import { parseChapterProofreadingResult, shouldProofreadChapter } from '../src/lib/chapter-proofreading.ts';

test('detects chapter and bounded review boundaries', () => {
  assert.equal(shouldProofreadChapter(['a', '# Next'], 0, 1), true);
  assert.equal(shouldProofreadChapter(['a', 'b'], 0, 6), true);
  assert.equal(shouldProofreadChapter(['a', 'b'], 0, 1), false);
  assert.equal(shouldProofreadChapter(['a'], 0, 1), true);
});

test('parses strict chapter proofreading output', () => {
  const result = parseChapterProofreadingResult('{"correctedChapter":"譯文","consistencyIssues":[],"newTerms":[],"newCharacters":[]}');
  assert.equal(result.correctedChapter, '譯文');
});
