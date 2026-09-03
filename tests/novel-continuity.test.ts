import assert from 'node:assert/strict';
import test from 'node:test';
import {
  formatNovelContinuity,
  getNovelCanonicalGlossary,
  mergeNovelContinuity,
  seedNovelContinuity,
  normalizeNovelContinuity,
} from '../src/lib/novel-continuity.ts';

test('an in-flight memory update cannot mutate the committed checkpoint', () => {
  const committed = seedNovelContinuity('- Alice: 愛麗絲（主角）');
  const before = structuredClone(committed);
  const draft = mergeNovelContinuity(committed, {
    characterLines: ['- Alice: 艾莉絲（新資訊）'], chunk: 2, chunkSummary: '未完成章節',
  });
  assert.deepEqual(committed, before);
  assert.notDeepEqual(draft.memory, committed);
  assert.deepEqual(normalizeNovelContinuity(JSON.parse(JSON.stringify(committed))), before);
});

test('malformed persisted aliases and non-finite timeline positions are ignored', () => {
  const malformed = JSON.parse('{"entities":[{"sourceName":"Alice","translatedName":"愛麗絲","aliases":[null],"facts":[],"firstSeenChunk":0,"lastSeenChunk":1}],"timeline":[{"chunk":null,"summary":"invalid"}]}');
  assert.deepEqual(normalizeNovelContinuity(malformed), { version: 1, entities: [], timeline: [] });
});

test('novel continuity preserves the first canonical name and reports later conflicts', () => {
  const seeded = seedNovelContinuity('- Alice: 愛麗絲（主角）');
  const result = mergeNovelContinuity(seeded, {
    characterLines: ['- Alice: 艾莉絲（她揭開了真相）'],
    chunk: 7,
    chunkSummary: '愛麗絲在鐘樓找到信件。',
    sourceChunk: '# 第三章\nAlice found the letter.',
  });

  assert.equal(result.memory.entities[0].translatedName, '愛麗絲');
  assert.deepEqual(result.conflicts, [{ sourceName: 'Alice', canonical: '愛麗絲', candidate: '艾莉絲' }]);
  assert.deepEqual(getNovelCanonicalGlossary(result.memory), ['- Alice: 愛麗絲']);
  assert.match(formatNovelContinuity(result.memory), /第 7 段（第三章）/);
});

test('novel continuity survives malformed legacy data safely', () => {
  const result = mergeNovelContinuity({ version: 1, entities: [], timeline: [] }, {
    characterLines: ['沒有冒號的內容', '- Bob: 鮑勃'],
    chunk: 2,
  });
  assert.equal(result.memory.entities.length, 1);
  assert.equal(result.memory.entities[0].translatedName, '鮑勃');
});
