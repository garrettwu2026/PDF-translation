import { buildChapterProofreadingPrompt, CHAPTER_PROOFREADING_SCHEMA, parseChapterProofreadingResult } from './chapter-proofreading.ts';
import { applyChapterRevisions, chapterSentences } from './chapter-revisions.ts';
import { protectContent, restoreProtectedContent } from './protected-content.ts';
import { assessTranslationQuality } from './translation-quality.ts';
import type { ContentResult, GenerateContentOptions, UsageMetadata } from './ai-providers.ts';

type Options = Parameters<typeof buildChapterProofreadingPrompt>[0] & {
  model: string;
  generate: (options: GenerateContentOptions) => Promise<ContentResult>;
  signal?: AbortSignal;
  onUsage: (usage: UsageMetadata) => void;
};

/** Paid review + validation only. The caller commits text/memory atomically. */
export async function reviewTranslatedChapter(options: Options) {
  const protectedChapter = protectContent(options.translatedChapter);
  const response = await options.generate({
    model: options.model,
    costStage: 'chapter_review', cacheScope: 'chapter-patches:v2', signal: options.signal,
    promptText: buildChapterProofreadingPrompt({ ...options, translatedChapter: protectedChapter.text }),
    temperature: 0, maxOutputTokens: 16_384, jsonSchema: CHAPTER_PROOFREADING_SCHEMA,
  });
  // Rejected revisions still incurred usage.
  if (response.usageMetadata) options.onUsage(response.usageMetadata);
  const review = parseChapterProofreadingResult(response.text || '{}');
  const patched = applyChapterRevisions(protectedChapter.text, chapterSentences(protectedChapter.text), review.revisions);
  const restored = restoreProtectedContent(patched, protectedChapter.entries);
  const quality = assessTranslationQuality(options.sourceChapter, restored.text, { documentType: options.documentType, glossary: options.glossary });
  if (restored.missing.length || restored.unknown.length || restored.duplicates.length || restored.outOfOrder || quality.blocking) {
    throw new Error('Chapter review failed completeness checks');
  }
  return { ...review, correctedChapter: restored.text };
}
