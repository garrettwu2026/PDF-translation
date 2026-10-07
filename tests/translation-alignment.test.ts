import assert from 'node:assert/strict';
import test from 'node:test';
import { buildAlignment, rebaseAlignment, sourceChunkLocations } from '../src/lib/translation-alignment.ts';
import { protectContent } from '../src/lib/protected-content.ts';
import { annotateTranslationSegments } from '../src/lib/sentence-segments.ts';
import { encodeProject, decodeProject, sanitizeProject } from '../src/lib/project-backup.ts';

test('alignment uses validated IDs and restored offsets even when translation changes paragraph boundaries', () => {
  const source = 'Run `npm test`. Second sentence.';
  const protectedSource = protectContent(source);
  const annotated = annotateTranslationSegments(protectedSource.text);
  const translated = '[[PDFT_SEG:S0001]]執行 __PDFT_PROTECTED_0001__。\n\n[[PDFT_SEG:S0002]]第二句。';
  const plain = '執行 `npm test`。\n\n第二句。';
  const rows = buildAlignment(annotated.text, translated, annotated.segments, protectedSource.entries, 2);
  assert.equal(rows[1].id, 'C2-S0002');
  assert.equal(source.slice(rows[1].sourceStart, rows[1].sourceEnd), 'Second sentence.');
  assert.equal(plain.slice(rows[1].translatedStart, rows[1].translatedEnd), '第二句。');
  assert.ok(plain.slice(rows[0].translatedStart, rows[0].translatedEnd).includes('`npm test`'));
});
test('source locations preserve original CRLF, blank lines and repeated sentences after chunk normalization', () => {
  const source = '# Title\r\n\r\n\r\nSame sentence.\r\n\r\nSame sentence.';
  const chunks = ['# Title\n\nSame sentence.', 'Same sentence.'];
  const locations = sourceChunkLocations(source, chunks);
  assert.equal(source.slice(locations[1][0], locations[1].at(-1)), 'Same sentence.');
  assert.equal(locations[1][0], source.lastIndexOf('Same sentence.'));
  assert.throws(() => sourceChunkLocations(source, ['Invented text']), /定位/);
});
test('chapter revisions invalidate overlapping rows and shift subsequent offsets without mutating committed rows', () => {
  const rows = [{id:'C1-S0001',sourceStart:0,sourceEnd:1,translatedStart:0,translatedEnd:2}, {id:'C1-S0002',sourceStart:1,sourceEnd:2,translatedStart:2,translatedEnd:4}];
  const rebased = rebaseAlignment(rows, '甲。乙。', '甲很好。乙。');
  assert.equal(rebased[0].stale, true);
  assert.equal(rebased[1].translatedStart, 4);
  assert.equal(rows[1].translatedStart, 2);
});
test('alignment and OCR choices round trip in portable backups, malformed ranges are rejected', async () => {
  const record = {id:'book',title:'book',author:'',coverImage:null,extractedText:'Hello.',translatedText:'你好。',currentChunk:1,totalChunks:1,status:'completed' as const,timestamp:1,model:'gpt-5.6-luna',
    forceOcrPages:[1],alignment:[{id:'C1-S0001',sourceStart:0,sourceEnd:6,translatedStart:0,translatedEnd:3}]};
  const decoded = await decodeProject(await encodeProject({record,requests:[]}));
  assert.deepEqual(decoded.record.alignment, record.alignment);
  assert.deepEqual(decoded.record.forceOcrPages, [1]);
  assert.throws(() => sanitizeProject({record:{...record,alignment:[{...record.alignment[0],sourceEnd:100}]},requests:[]}), /對應/);
});
