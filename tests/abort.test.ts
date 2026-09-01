import assert from 'node:assert/strict';
import test from 'node:test';
import { abortableDelay, isAbortError } from '../src/lib/abort.ts';

test('abortableDelay rejects immediately when aborted', async () => {
  const controller = new AbortController();
  const pending = abortableDelay(10_000, controller.signal);
  controller.abort();
  await assert.rejects(pending, (error) => isAbortError(error));
});
