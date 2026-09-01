import assert from 'node:assert/strict';
import test from 'node:test';
import { estimateTextTokens, splitMarkdownIntoTokenChunks, splitTextIntoChunks } from '../src/lib/text.ts';

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

test('token estimator is conservative for CJK and compact for Latin text', () => {
  assert.equal(estimateTextTokens('繁體中文'), 4);
  assert.equal(estimateTextTokens('abcdefgh'), 2);
});

test('Markdown token chunking preserves headings and fenced code blocks', () => {
  const source = '# Heading\n\nA long paragraph. Another sentence.\n\n```ts\nconst value = 123;\n```\n\n## Next';
  const chunks = splitMarkdownIntoTokenChunks(source, 10);
  assert.equal(chunks.join('\n\n'), source);
  assert.ok(chunks.some((chunk) => chunk.includes('```ts\nconst value = 123;\n```')));
});

test('Markdown token chunking splits oversized prose without dropping content', () => {
  const source = '這是一個很長的句子。這是第二個很長的句子。這是第三個很長的句子。';
  const chunks = splitMarkdownIntoTokenChunks(source, 10);
  assert.ok(chunks.length > 1);
  assert.equal(chunks.join(''), source);
  assert.ok(chunks.every((chunk) => estimateTextTokens(chunk) <= 10));
});

