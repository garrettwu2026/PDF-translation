import assert from 'node:assert/strict';
import test from 'node:test';
import { getDocumentTypeInstruction, normalizeDocumentType, resolveDocumentType } from '../src/lib/document-types.ts';

test('resolves automatic and explicit document modes', () => {
  assert.equal(resolveDocumentType('auto', 'technical'), 'technical');
  assert.equal(resolveDocumentType('novel', 'technical'), 'novel');
  assert.equal(normalizeDocumentType('unknown'), 'auto');
  assert.match(getDocumentTypeInstruction('business_legal'), /義務/);
});
