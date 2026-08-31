import assert from 'node:assert/strict';
import test from 'node:test';
import { splitTextIntoChunks } from '../src/lib/text.ts';

test('splitTextIntoChunks preserves ordinary Markdown content', () => {
  const source = '# Title\n\nFirst paragraph.\n\n## Section\n\nSecond paragraph.';
  const chunks = splitTextIntoChunks(source, 40);

  assert.ok(chunks.length > 1);
  assert.ok(chunks.every((chunk) => chunk.length <= 40));
  assert.equal(chunks.join('\n\n').replace(/\n{3,}/g, '\n\n'), source);
});

test('splitTextIntoChunks hard-splits a sentence longer than the limit', () => {
  const chunks = splitTextIntoChunks('a'.repeat(101), 25);

  assert.deepEqual(chunks.map((chunk) => chunk.length), [25, 25, 25, 25, 1]);
  assert.equal(chunks.join(''), 'a'.repeat(101));
});

test('splitTextIntoChunks handles empty input and invalid limits', () => {
  assert.deepEqual(splitTextIntoChunks('   '), []);
  assert.throws(() => splitTextIntoChunks('content', 0), RangeError);
});
