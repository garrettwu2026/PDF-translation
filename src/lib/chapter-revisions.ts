import { assessTranslationQuality } from './translation-quality.ts';

export type ChapterSentence = {id: string; text: string; start: number; end: number};
export type ChapterRevision = {id: string; original: string; replacement: string};

export function formatChapterForReview(text: string) {
  let result = text;
  for (const sentence of chapterSentences(text).reverse()) {
    result = result.slice(0, sentence.start) + '[[' + sentence.id + ']]' + result.slice(sentence.start);
  }
  return result;
}

/** Exact offsets preserve whitespace, Markdown prefixes and every untouched sentence. */
export function chapterSentences(text: string): ChapterSentence[] {
  const sentences: ChapterSentence[] = [];
  const segmenter = new Intl.Segmenter('zh-Hant', {granularity: 'sentence'});
  for (const line of text.matchAll(/[^\r\n]+/g)) {
    const prefix = line[0].match(/^\s*(?:#{1,6}\s+|[-*+]\s+|\d+[.)]\s+|>\s+)?/)?.[0] ?? '';
    const body = line[0].slice(prefix.length);
    // Tables and standalone protected blocks are immutable during consistency review.
    if (/^\s*\||^\s*(?:[-*_]\s*){3,}$|^\s*=+\s*$/.test(line[0]) || /^\s*__PDFT_PROTECTED_\d+__\s*$/.test(body)) continue;
    for (const part of segmenter.segment(body)) {
      const value = part.segment.trim();
      if (!value) continue;
      const start = line.index! + prefix.length + part.index + part.segment.indexOf(value);
      sentences.push({id: 'C' + String(sentences.length + 1).padStart(5, '0'), text: value, start, end: start + value.length});
    }
  }
  return sentences;
}

export function applyChapterRevisions(text: string, sentences: ChapterSentence[], revisions: ChapterRevision[]) {
  const byId = new Map(sentences.map(sentence => [sentence.id, sentence]));
  const seen = new Set<string>();
  const patches = revisions.map(revision => {
    const sentence = byId.get(revision.id);
    if (!sentence || seen.has(revision.id) || sentence.text !== revision.original || !revision.replacement.trim()
      || revision.replacement !== revision.replacement.trim() || /[\r\n]|\[\[PDFT_SEG:|\[\[C\d+\]\]|^(?:#{1,6}\s|[-*+>]\s|\d+[.)]\s|\|)/.test(revision.replacement)) {
      throw new Error('Chapter revision failed sentence completeness checks');
    }
    seen.add(revision.id);
    // Each edit must retain local protected values and cannot collapse multiple sentences.
    if (chapterSentences(revision.replacement).length !== 1
      || assessTranslationQuality(sentence.text, revision.replacement, {documentType: 'technical'}).blocking) {
      throw new Error('Chapter revision failed sentence completeness checks');
    }
    const protectedIds = (value: string) => value.match(/__PDFT_PROTECTED_\d+__/g) ?? [];
    if (JSON.stringify(protectedIds(sentence.text)) !== JSON.stringify(protectedIds(revision.replacement))) {
      throw new Error('Chapter revision failed protected-content completeness checks');
    }
    return {...sentence, replacement: revision.replacement};
  });
  let result = text;
  for (const patch of patches.sort((a, b) => b.start - a.start)) {
    result = result.slice(0, patch.start) + patch.replacement + result.slice(patch.end);
  }
  if (chapterSentences(result).length !== sentences.length) throw new Error('Chapter revision changed sentence coverage');
  return result;
}
