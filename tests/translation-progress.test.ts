import assert from 'node:assert/strict';
import test from 'node:test';
import {
  beginTranslationChunk,
  commitTranslationChunk,
  createTranslationProgress,
  pauseTranslationProgress,
} from '../src/lib/translation-progress.ts';

test('an unfinished chunk is never committed to resumable progress', () => {
  const started = beginTranslationChunk(createTranslationProgress(3), 3);
  assert.deepEqual(started, { completedChunks: 3, inFlightChunk: 3 });
  assert.deepEqual(pauseTranslationProgress(started), { completedChunks: 3, inFlightChunk: null });
});

test('a chunk becomes resumable only after it commits successfully', () => {
  const started = beginTranslationChunk(createTranslationProgress(3), 3);
  assert.deepEqual(commitTranslationChunk(started, 3), { completedChunks: 4, inFlightChunk: null });
});
