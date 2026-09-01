import assert from 'node:assert/strict';
import test from 'node:test';
import type { HistoryRecord } from '../src/lib/db.ts';
import { selectHistoryRecordsToKeep } from '../src/lib/db.ts';

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
