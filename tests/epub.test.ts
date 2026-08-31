import assert from 'node:assert/strict';
import test from 'node:test';
import {
  contentDisposition,
  InvalidEpubInputError,
  markdownToChapters,
  parseEpubRequest,
  sanitizeEpubHtml,
} from '../server/epub.ts';

test('parseEpubRequest normalizes metadata and validates content', () => {
  const result = parseEpubRequest({
    title: '  My\u0000 Book  ',
    author: '',
    markdown: '# Chapter\n\nContent',
  });

  assert.equal(result.title, 'My Book');
  assert.equal(result.author, 'AI Translator');
  assert.throws(() => parseEpubRequest({ markdown: '' }), InvalidEpubInputError);
  assert.throws(
    () => parseEpubRequest({ markdown: 'ok', cover: 'https://example.com/cover.jpg' }),
    InvalidEpubInputError,
  );
});

test('sanitizeEpubHtml removes executable markup and unsupported images', () => {
  const unsafe = '<p onclick="run()">Safe</p><script>alert(1)</script><img src="x"><a href="javascript:run()">x</a>';
  const clean = sanitizeEpubHtml(unsafe);

  assert.equal(clean, '<p>Safe</p><a>x</a>');
});

test('markdownToChapters uses headings as chapter titles without duplicating them', async () => {
  const chapters = await markdownToChapters('Preface\n\n# One\n\nBody\n\n## Two\n\nMore');

  assert.deepEqual(chapters.map((chapter) => chapter.title), ['前言', 'One', 'Two']);
  assert.doesNotMatch(chapters[1].content, /<h1>/);
  assert.match(chapters[1].content, /Body/);
});

test('contentDisposition provides an ASCII fallback and encoded UTF-8 name', () => {
  const header = contentDisposition('翻譯書');
  assert.match(header, /filename="document\.epub"/);
  assert.match(header, /filename\*=UTF-8''/);
  assert.match(header, /%E7%BF%BB/);
});
