import assert from 'node:assert/strict';
import test from 'node:test';
import { protectContent, restoreProtectedContent } from '../src/lib/protected-content.ts';

test('protects and restores code, links, URLs, email and math exactly', () => {
  const source = 'See [docs](https://example.com/a) and `npm run build`, mail a@b.com. $$x^2$$\n```ts\nconst x = 1;\n```';
  const protectedValue = protectContent(source);
  assert.ok(protectedValue.entries.length >= 5);
  assert.equal(restoreProtectedContent(protectedValue.text, protectedValue.entries).text, source);
});

test('reports a placeholder removed by a model', () => {
  const protectedValue = protectContent('Run `npm test`.');
  const result = restoreProtectedContent(protectedValue.text.replace(protectedValue.entries[0].placeholder, ''), protectedValue.entries);
  assert.deepEqual(result.missing, [protectedValue.entries[0].placeholder]);
});

test('rejects duplicated and reordered protected placeholders', () => {
  const protectedValue = protectContent('Run `npm test` and visit https://example.com.');
  const [first, second] = protectedValue.entries;
  const duplicated = restoreProtectedContent(`${protectedValue.text} ${first.placeholder}`, protectedValue.entries);
  assert.deepEqual(duplicated.duplicates, [first.placeholder]);

  const reorderedText = protectedValue.text
    .replace(first.placeholder, '__TEMP__')
    .replace(second.placeholder, first.placeholder)
    .replace('__TEMP__', second.placeholder);
  const reordered = restoreProtectedContent(reorderedText, protectedValue.entries);
  assert.equal(reordered.outOfOrder, true);
});
