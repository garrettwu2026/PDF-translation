import { Lexer } from 'marked';

export const PREVIEW_PAGE_CHARACTERS = 12_000;
export type PreviewPage = { text: string; startLine: number; plain: boolean };

/** Block-aware display pages only. Never feeds translation or exports. */
export function paginatePreview(markdown: string, limit = PREVIEW_PAGE_CHARACTERS): PreviewPage[] {
  const source = markdown.replace(/\r\n?/g, '\n');
  const pages: PreviewPage[] = [];
  const definitions: string[] = [];
  let text = '', line = 1, startLine = 1;
  const flush = () => { if (text) pages.push({text, startLine, plain: false}); text = ''; startLine = line; };
  for (const token of Lexer.lex(source)) {
    if (token.type === 'def') definitions.push(token.raw);
    if (text && text.length + token.raw.length > limit) flush();
    if (token.raw.length > limit * 2) {
      flush();
      // A giant table/code block must not defeat the DOM bound. Show its exact raw text in windows.
      for (let offset = 0; offset < token.raw.length; offset += limit) {
        const part = token.raw.slice(offset, offset + limit);
        pages.push({text: part, startLine: line, plain: true});
        line += (part.match(/\n/g) || []).length;
      }
      startLine = line;
    } else {
      if (!text) startLine = line;
      text += token.raw;
      line += (token.raw.match(/\n/g) || []).length;
    }
  }
  flush();
  // Preserve reference links / images across page boundaries. Definitions do not render DOM.
  const refs = definitions.join('\n');
  if (refs) for (const page of pages) if (!page.plain) page.text += '\n\n' + refs;
  return pages.length ? pages : [{text: '', startLine: 1, plain: false}];
}

export function pageForLine(pages: PreviewPage[], line: number) {
  for (let i = pages.length - 1; i >= 0; i--) if (pages[i].startLine <= line) return i;
  return 0;
}
