import epubModule from 'epub-gen-memory';
import type { Options } from 'epub-gen-memory';
import { marked } from 'marked';

const epub = (epubModule as { default?: typeof epubModule }).default ?? epubModule;
const MAX_MARKDOWN_LENGTH = 12_000_000;
const MAX_COVER_BYTES = 5 * 1024 * 1024;

export class InvalidEpubInputError extends Error {}

export interface EpubRequest {
  title: string;
  markdown: string;
  author: string;
  cover?: string;
}

export function parseEpubRequest(value: unknown): EpubRequest {
  if (!value || typeof value !== 'object') {
    throw new InvalidEpubInputError('Request body must be a JSON object');
  }

  const body = value as Record<string, unknown>;
  if (typeof body.markdown !== 'string' || !body.markdown.trim()) {
    throw new InvalidEpubInputError('Markdown content is required');
  }
  if (body.markdown.length > MAX_MARKDOWN_LENGTH) {
    throw new InvalidEpubInputError('Markdown content is too large');
  }

  const title = cleanMetadata(body.title, 'Translated Document', 200);
  const author = cleanMetadata(body.author, 'AI Translator', 200);
  const cover = validateCover(body.cover);
  return { title, author, markdown: body.markdown, cover };
}

function cleanMetadata(value: unknown, fallback: string, maxLength: number): string {
  if (typeof value !== 'string') return fallback;
  const cleaned = value.replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, maxLength);
  return cleaned || fallback;
}

function validateCover(value: unknown): string | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  if (typeof value !== 'string' || !/^data:image\/(?:png|jpe?g);base64,/i.test(value)) {
    throw new InvalidEpubInputError('Cover must be a base64-encoded PNG or JPEG image');
  }

  const encoded = value.slice(value.indexOf(',') + 1);
  const approximateBytes = Math.floor((encoded.length * 3) / 4);
  if (approximateBytes > MAX_COVER_BYTES) {
    throw new InvalidEpubInputError('Cover image must not exceed 5 MB');
  }
  return value;
}

export function sanitizeEpubHtml(html: string): string {
  return html
    .replace(/<picture[^>]*>[\s\S]*?<\/picture\s*>/gi, '')
    .replace(/<svg[^>]*>[\s\S]*?<\/svg\s*>/gi, '')
    .replace(/<img[^>]*>/gi, '')
    .replace(/<(script|style|iframe|object|embed|form)[^>]*>[\s\S]*?<\/\1\s*>/gi, '')
    .replace(/<(script|style|iframe|object|embed|form)[^>]*\/?>/gi, '')
    .replace(/\son[a-z]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, '')
    .replace(/\s(?:href|src)\s*=\s*(["'])\s*javascript:[\s\S]*?\1/gi, '');
}

export async function markdownToChapters(markdown: string) {
  const tokens = marked.lexer(markdown);
  const chapters: Array<{ title: string; raw: string }> = [];
  let current = { title: '前言', raw: '' };

  for (const token of tokens) {
    if (token.type === 'heading' && token.depth <= 3) {
      if (current.raw.trim()) chapters.push(current);
      current = { title: cleanMetadata(token.text, '內容', 200), raw: '' };
    } else {
      current.raw += token.raw;
    }
  }
  if (current.raw.trim()) chapters.push(current);

  if (chapters.length === 0) chapters.push({ title: '內容', raw: markdown });

  return Promise.all(chapters.map(async (chapter) => ({
    title: chapter.title,
    content: sanitizeEpubHtml(await marked.parse(chapter.raw)),
  })));
}

export async function generateEpub(input: EpubRequest): Promise<Buffer> {
  const chapters = await markdownToChapters(input.markdown);
  const options: Options = {
    title: input.title,
    author: input.author,
    date: new Date().toISOString(),
    lang: 'zh-TW',
    tocTitle: '目錄',
  };
  if (input.cover) options.cover = input.cover;

  return epub(options, chapters);
}

export function contentDisposition(title: string): string {
  const encoded = encodeURIComponent(`${title}.epub`).replace(/['()*]/g, (char) =>
    `%${char.charCodeAt(0).toString(16).toUpperCase()}`,
  );
  return `attachment; filename="document.epub"; filename*=UTF-8''${encoded}`;
}
