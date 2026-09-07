import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createLayeredDocumentMemory,
  serializeLayeredDocumentMemory,
  formatLayeredDocumentMemory,
  getNewKnowledgeLines,
  mergeKnowledgeLines,
  updateLayeredDocumentMemory,
} from '../src/lib/document-memory.ts';

test('layered memory keeps global, chapter, and recent context separately', () => {
  let memory = createLayeredDocumentMemory('一場跨城旅程。');
  memory = updateLayeredDocumentMemory(memory, '主角抵達港口。', '# 第一章\n\nArrival');
  memory = updateLayeredDocumentMemory(memory, '主角登上船。', 'They boarded the ship.', true);
  const formatted = formatLayeredDocumentMemory(memory);
  assert.match(formatted, /【全書摘要】/);
  assert.match(formatted, /【章節摘要】\n- 第一章：主角抵達港口。；主角登上船。/);
  assert.match(formatted, /【近期進展】/);
  assert.deepEqual(createLayeredDocumentMemory('', formatted), memory);
});

test('knowledge merge preserves an accepted term and removes duplicate additions', () => {
  assert.equal(
    mergeKnowledgeLines('- [API]: 應用程式介面', ['- [API]: API', '- [SDK]: 軟體開發套件']),
    '- [API]: 應用程式介面\n- [SDK]: 軟體開發套件',
  );
});

test('new knowledge detection only counts genuinely new keys', () => {
  assert.deepEqual(getNewKnowledgeLines('API：介面', ['API：接口', 'SDK：開發套件', 'SDK：工具']), ['SDK：開發套件']);
});

test('legacy summaries without chapter headings do not leak recent context into global memory', () => {
  for (const memory of [
    {globalSummary: '全書背景', chapterSummaries: [], recentSummaries: ['最新事件']},
    {globalSummary: '', chapterSummaries: [], recentSummaries: ['最新事件']},
    {globalSummary: '', chapterSummaries: ['第一章：事件'], recentSummaries: []},
  ]) {
    assert.deepEqual(createLayeredDocumentMemory('', formatLayeredDocumentMemory(memory)), memory);
  }
});

test('structured memory survives resume mid-chapter and aggregates later developments', () => {
  let memory = createLayeredDocumentMemory('全書背景');
  memory = updateLayeredDocumentMemory(memory, '抵達港口', '# 第一章\n\n抵達');
  const checkpoint = serializeLayeredDocumentMemory(memory);
  const resumed = createLayeredDocumentMemory('', checkpoint);
  assert.deepEqual(resumed, memory);
  const completed = updateLayeredDocumentMemory(resumed, '登船離港', '接續內文', true);
  assert.deepEqual(completed.chapterSummaries, ['第一章：抵達港口；登船離港']);
  assert.equal(completed.currentChapter, undefined);
  assert.equal(serializeLayeredDocumentMemory(memory), checkpoint);
  assert.deepEqual(createLayeredDocumentMemory('', serializeLayeredDocumentMemory(completed)), completed);
});

test('structured summary marker text remains ordinary content across repeated reloads', () => {
  const original = {globalSummary: '背景提及【近期進展】文字', chapterSummaries: [], recentSummaries: ['事件']};
  let restored: ReturnType<typeof createLayeredDocumentMemory> = original;
  for (let i = 0; i < 5; i++) restored = createLayeredDocumentMemory('', serializeLayeredDocumentMemory(restored));
  assert.deepEqual(restored, original);
});

