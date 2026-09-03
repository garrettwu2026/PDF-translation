import { buildChapterProofreadingPrompt, CHAPTER_PROOFREADING_SCHEMA, parseChapterProofreadingResult } from './chapter-proofreading.ts';
import { protectContent, restoreProtectedContent } from './protected-content.ts';
import { assessTranslationQuality } from './translation-quality.ts';
import type { ContentResult, GenerateContentOptions, UsageMetadata } from './ai-providers.ts';

type Options = Parameters<typeof buildChapterProofreadingPrompt>[0] & {
  model: string;
  generate: (options: GenerateContentOptions) => Promise<ContentResult>;
  onUsage: (usage: UsageMetadata) => void;
};

/** Paid review + validation only. The caller commits text/memory atomically. */
export async function reviewTranslatedChapter(options: Options) {
  const protectedChapter = protectContent(options.translatedChapter);
  const response = await options.generate({
    model: options.model,
    promptText: buildChapterProofreadingPrompt({ ...options, translatedChapter: protectedChapter.text }),
    temperature: 0, maxOutputTokens: 16_384, jsonSchema: CHAPTER_PROOFREADING_SCHEMA,
  });
  // Rejected revisions still incurred usage.
  if (response.usageMetadata) options.onUsage(response.usageMetadata);
  const review = parseChapterProofreadingResult(response.text || '{}');
  const restored = restoreProtectedContent(review.correctedChapter, protectedChapter.entries);
  const quality = assessTranslationQuality(options.sourceChapter, restored.text, { documentType: options.documentType });
  if (restored.missing.length || restored.unknown.length || restored.duplicates.length || restored.outOfOrder || quality.blocking) {
    throw new Error('Chapter review failed completeness checks');
  }
  return { ...review, correctedChapter: restored.text };
}
