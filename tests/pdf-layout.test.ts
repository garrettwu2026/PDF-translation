import assert from 'node:assert/strict';
import test from 'node:test';
import {
  cleanPdfPages,
  orderPdfPageText,
  removeRepeatedHeadersAndFooters,
  repairPdfLineBreaks,
} from '../src/lib/pdf-layout.ts';

const item = (str: string, x: number, y: number, width = 70) => ({ str, width, height: 10, transform: [1, 0, 0, 10, x, y] });

test('orders two-column PDF text down the left column before the right', () => {
  const text = orderPdfPageText([
    item('L1', 10, 400), item('R1', 300, 400),
    item('L2', 10, 380), item('R2', 300, 380),
    item('L3', 10, 360), item('R3', 300, 360),
    item('L4', 10, 340), item('R4', 300, 340),
  ]);
  assert.equal(text, 'L1\nL2\nL3\nL4\nR1\nR2\nR3\nR4');
});

test('removes repeated headers, footers, and page numbers', () => {
  const pages = [1, 2, 3].map((page) => `Quarterly Report\nBody ${page}\nConfidential\n${page}`);
  const cleaned = removeRepeatedHeadersAndFooters(pages);
  assert.ok(cleaned.every((page) => !page.includes('Quarterly Report') && !page.includes('Confidential')));
  assert.ok(cleaned[1].includes('Body 2'));
});

test('repairs hyphenated and soft line breaks across PDF lines and pages', () => {
  assert.equal(repairPdfLineBreaks('inter-\nnational standard.\nNext section.'), 'international standard.\nNext section.');
  assert.equal(cleanPdfPages(['A sentence that con-', 'tinues across pages.']), 'A sentence that continues across pages.');
});
