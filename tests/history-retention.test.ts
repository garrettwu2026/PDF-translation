import assert from 'node:assert/strict';
import test from 'node:test';
import type { HistoryRecord } from '../src/lib/db.ts';
import { selectHistoryRecordsToKeep, shouldCheckpointTranslationProgress } from '../src/lib/db.ts';

const record = (id: string, timestamp: number, size = 10): HistoryRecord => ({
  id,
  timestamp,
  title: id,
  author: '',
  coverImage: null,
  extractedText: 'x'.repeat(size),
  translatedText: '',
  currentChunk: 0,
  totalChunks: 0,
  status: 'completed',
  model: 'gemini-3.7-flash',
});

test('history retention keeps the newest records within count and size limits', () => {
  const result = selectHistoryRecordsToKeep([
    record('old', 1, 20),
    record('middle', 2, 20),
    record('new', 3, 20),
  ], 2, 1_000);
  assert.deepEqual(result.keep.map((item) => item.id), ['new', 'middle']);
  assert.deepEqual(result.deleteIds, ['old']);
});

test('history retention always keeps the newest record even when it exceeds the size limit', () => {
  const result = selectHistoryRecordsToKeep([record('old', 1, 10), record('new', 2, 1_000)], 25, 50);
  assert.deepEqual(result.keep.map((item) => item.id), ['new']);
});

test('translation progress checkpoints the first, every third, and final chunk', () => {
  const checkpoints = Array.from({ length: 8 }, (_, index) => index + 1)
    .filter((chunk) => shouldCheckpointTranslationProgress(chunk, 8));
  assert.deepEqual(checkpoints, [1, 3, 6, 8]);
});

test('retention counts intermediate results and never prunes an unfinished translation', () => {
  const old = { ...record('working', 1), status: 'translating' as const };
  const result = selectHistoryRecordsToKeep([old, record('old', 2), { ...record('new', 3), requestCharacters: 1000 }], 1, 50);
  assert.deepEqual(result.keep.map(item => item.id), ['new', 'working']);
  assert.deepEqual(result.deleteIds, ['old']);
});
