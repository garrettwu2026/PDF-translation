import type { DetectedDocumentType } from './document-types';

export type ChapterProofreadingResult = {
  correctedChapter: string;
  consistencyIssues: string[];
  newTerms: string[];
  newCharacters: string[];
};

export const CHAPTER_PROOFREADING_SCHEMA = {
  name: 'chapter_consistency_proofreading',
  schema: {
    type: 'object',
    additionalProperties: false,
    properties: {
      correctedChapter: { type: 'string' },
      consistencyIssues: { type: 'array', items: { type: 'string' } },
      newTerms: { type: 'array', items: { type: 'string' } },
      newCharacters: { type: 'array', items: { type: 'string' } },
    },
    required: ['correctedChapter', 'consistencyIssues', 'newTerms', 'newCharacters'],
  },
} as const;

export function shouldProofreadChapter(chunks: string[], index: number, chapterChunkCount: number, maxChunks = 6) {
  if (index >= chunks.length - 1 || chapterChunkCount >= maxChunks) return true;
  return /^#{1,3}\s+/m.test(chunks[index + 1]);
}

export function buildChapterProofreadingPrompt(input: {
  sourceChapter: string;
  translatedChapter: string;
  documentType: DetectedDocumentType;
  style: string;
  glossary: string;
  characterMap: string;
}) {
  return `請對下列一個章節或章節片段做一致性校稿。只修正跨段不一致、誤譯、漏譯、代名詞、術語、角色語氣及銜接問題；不得摘要、增添資訊或改變 Markdown 結構。所有 __PDFT_PROTECTED_XXXX__ 佔位符必須逐字保留。依 JSON Schema 回傳。\n\n【文件類型】\n${input.documentType}\n\n【風格指南】\n${input.style}\n\n【術語表】\n${input.glossary}\n\n【角色圖譜】\n${input.characterMap}\n\n【本章原文】\n${input.sourceChapter}\n\n【本章譯文】\n${input.translatedChapter}`;
}

export function parseChapterProofreadingResult(text: string): ChapterProofreadingResult {
  const normalized = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  const parsed = JSON.parse(normalized) as Partial<ChapterProofreadingResult>;
  const arraysAreStrings = (value: unknown) => Array.isArray(value) && value.every((item) => typeof item === 'string');
  if (typeof parsed.correctedChapter !== 'string' || !arraysAreStrings(parsed.consistencyIssues) || !arraysAreStrings(parsed.newTerms) || !arraysAreStrings(parsed.newCharacters)) {
    throw new Error('Chapter proofreading response does not match the required schema');
  }
  return parsed as ChapterProofreadingResult;
}
