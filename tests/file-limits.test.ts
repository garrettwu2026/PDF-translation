import assert from 'node:assert/strict';
import test from 'node:test';
import {
  assertPdfPageLimit,
  MAX_MARKDOWN_FILE_BYTES,
  MAX_PDF_FILE_BYTES,
  MAX_PDF_PAGES,
  validateUpload,
} from '../src/lib/file-limits.ts';

test('validateUpload accepts supported files at the size limit', () => {
  assert.deepEqual(
    validateUpload({ name: 'document.pdf', type: '', size: MAX_PDF_FILE_BYTES }),
    { kind: 'pdf' },
  );
  assert.deepEqual(
    validateUpload({ name: 'notes.MD', type: 'text/markdown', size: MAX_MARKDOWN_FILE_BYTES }),
    { kind: 'markdown' },
  );
});

test('validateUpload rejects unsupported and oversized files', () => {
  assert.throws(
    () => validateUpload({ name: 'archive.zip', type: 'application/zip', size: 10 }),
    /PDF or MD/,
  );
  assert.throws(
    () => validateUpload({ name: 'large.pdf', type: 'application/pdf', size: MAX_PDF_FILE_BYTES + 1 }),
    /50 MB/,
  );
  assert.throws(
    () => validateUpload({ name: 'large.md', type: 'text/markdown', size: MAX_MARKDOWN_FILE_BYTES + 1 }),
    /12 MB/,
  );
});

test('assertPdfPageLimit rejects invalid and excessive page counts', () => {
  assert.doesNotThrow(() => assertPdfPageLimit(MAX_PDF_PAGES));
  assert.throws(() => assertPdfPageLimit(MAX_PDF_PAGES + 1), /3,600/);
  assert.throws(() => assertPdfPageLimit(-1), /無效/);
  assert.throws(() => assertPdfPageLimit(1.5), /無效/);
});
