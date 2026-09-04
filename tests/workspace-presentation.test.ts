import test from 'node:test';
import assert from 'node:assert/strict';
import { documentProgress, recoveryAdvice, comparisonParagraphs, documentHeadings } from '../src/lib/workspace-presentation.ts';

test('progress uses committed chunks and does not report completion during save', () => {
  assert.equal(documentProgress(2, 10, 'correcting'), 20);
  assert.equal(documentProgress(10, 10, 'saving'), 99);
  assert.equal(documentProgress(10, 10, 'completed'), 100);
  assert.equal(documentProgress(5, 5, 'extracting'), 0);
  assert.equal(documentProgress(0, 0, 'idle'), 0);
});
test('recovery directs budget, key and storage issues without restarting work', () => {
  assert.equal(recoveryAdvice('超過費用上限').action, 'budget');
  assert.equal(recoveryAdvice('OpenAI API Key 尚未設定').action, 'keys');
  assert.equal(recoveryAdvice('無法儲存翻譯歷史紀錄').action, 'results');
  assert.equal(recoveryAdvice('網路暫時中斷').action, 'none');
  assert.equal(recoveryAdvice('API 用量或速率已達限制。quota exceeded').title, '供應商額度或速率受限');
  assert.equal(recoveryAdvice('PDF 頁數超過上限').action, 'none');
});
test('comparison preserves positional paragraphs without inventing alignments', () => {
  assert.deepEqual(comparisonParagraphs(' A\nline\n\nB '), ['A\nline', 'B']);
  assert.deepEqual(comparisonParagraphs('   '), []);
});
test('chapter headings have unique source-line anchors and ignore fenced code', () => {
  assert.deepEqual(documentHeadings('# One\n\n~~~md\n# Not a heading\n~~~\n\n## One'), [
    {id: 'reading-line-1', title: 'One', level: 1}, {id: 'reading-line-7', title: 'One', level: 2},
  ]);
  assert.deepEqual(documentHeadings('Title\n==='), [{id: 'reading-line-1', title: 'Title', level: 1}]);
});
