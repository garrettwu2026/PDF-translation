import assert from 'node:assert/strict';
import test from 'node:test';
import { chapterSentences, applyChapterRevisions } from '../src/lib/chapter-revisions.ts';
import { reviewTranslatedChapter } from '../src/lib/review-translated-chapter.ts';
import { parseChapterProofreadingResult } from '../src/lib/chapter-proofreading.ts';

const text = '# 第一章\r\n\r\n  他到了港口。他登上船。\r\n\r\n- 最後一句。\r\n';
test('chapter patches preserve every unedited byte and Markdown separator', () => {
  const sentences = chapterSentences(text);
  const target = sentences.find(s => s.text === '他到了港口。')!;
  const edited = applyChapterRevisions(text, sentences, [{id: target.id, original: target.text, replacement: '他抵達了港口。'}]);
  assert.equal(edited, text.replace('他到了港口。', '他抵達了港口。'));
  assert.equal(applyChapterRevisions(text, sentences, []), text);
});
test('chapter patches reject deletion, duplicate IDs, stale text, injected structure and unknown IDs', () => {
  const sentences = chapterSentences(text);
  const target = sentences[1];
  const valid = {id: target.id, original: target.text, replacement: '他抵達了港口。'};
  for (const revisions of [
    [{...valid, replacement: ''}], [valid, valid], [{...valid, id: 'C99999'}],
    [{...valid, original: '不匹配的句子'}], [{...valid, replacement: '一句。\n另一句。'}],
    [{...valid, replacement: '# 改成標題。'}], [{...valid, replacement: '[[C00003]]刪除其他句子。'}],
  ]) assert.throws(() => applyChapterRevisions(text, sentences, revisions));
  assert.throws(() => parseChapterProofreadingResult(JSON.stringify({correctedChapter: '删除全文', consistencyIssues: [], newTerms: [], newCharacters: []})));
});
test('chapter patches keep each sentence protected content in the same location', () => {
  const protectedText = '請執行 __PDFT_PROTECTED_0001__。請執行 __PDFT_PROTECTED_0002__。';
  const sentences = chapterSentences(protectedText);
  assert.throws(() => applyChapterRevisions(protectedText, sentences, [{id: sentences[0].id, original: sentences[0].text, replacement: '請執行 __PDFT_PROTECTED_0002__。'}]));
});
test('valid chapter service revision keeps the other sentence and uses a versioned request', async () => {
  const result = await reviewTranslatedChapter({
    model: 'gpt-5.6-luna', sourceChapter: 'He arrived at the port. He boarded the ship.',
    translatedChapter: '他到了港口。他登上船。', documentType: 'general', style: '', glossary: '', characterMap: '',
    generate: async request => {
      assert.equal(request.cacheScope, 'chapter-patches:v2');
      assert.ok(request.promptText?.includes('[[C00001]]他到了港口。'));
      return {text: JSON.stringify({revisions: [{id: 'C00001', original: '他到了港口。', replacement: '他抵達了港口。'}],
        consistencyIssues: [], newTerms: [], newCharacters: []})};
    }, onUsage: () => {},
  });
  assert.equal(result.correctedChapter, '他抵達了港口。他登上船。');
});
