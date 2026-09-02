import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createLayeredDocumentMemory,
  formatLayeredDocumentMemory,
  getNewKnowledgeLines,
  mergeKnowledgeLines,
  updateLayeredDocumentMemory,
} from '../src/lib/document-memory.ts';

test('layered memory keeps global, chapter, and recent context separately', () => {
  let memory = createLayeredDocumentMemory('一場跨城旅程。');
  memory = updateLayeredDocumentMemory(memory, '主角抵達港口。', '# 第一章\n\nArrival');
  memory = updateLayeredDocumentMemory(memory, '主角登上船。', 'They boarded the ship.');
  const formatted = formatLayeredDocumentMemory(memory);
  assert.match(formatted, /【全書摘要】/);
  assert.match(formatted, /【章節摘要】\n- 第一章：主角抵達港口。/);
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

