import assert from 'node:assert/strict';
import test from 'node:test';
import { assessPdfPage } from '../src/lib/pdf-page-quality.ts';

test('image pages with only a text header require OCR even above the old character threshold', () => {
  const items = [{str: 'Annual report 2026', transform: [1,0,0,12,20,780]}];
  assert.equal(assessPdfPage('Annual report 2026', items, 1, 800).reason, 'mixed');
  assert.equal(assessPdfPage('Real body text. '.repeat(80), [{str:'body',transform:[1,0,0,12,20,600]},{str:'body',transform:[1,0,0,12,20,200]}], 1, 800).needsOcr, false);
});
test('sparse and garbled text require OCR; readable native prose remains free', () => {
  assert.equal(assessPdfPage('page 1').reason, 'sparse');
  assert.equal(assessPdfPage('broken \uFFFD\uFFFD\uFFFD\uFFFD text layer').reason, 'garbled');
  assert.equal(assessPdfPage('Readable native source text').needsOcr, false);
});
