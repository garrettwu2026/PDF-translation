import { abortableDelay, isAbortError, throwIfAborted } from './abort.ts';
import type { ContentResult, GenerateContentOptions, GenerateStreamOptions } from './ai-providers.ts';
import { protectContent, restoreProtectedContent, formatProtectedContentInstruction } from './protected-content.ts';
import {
  annotateTranslationSegments,
  applySentenceRepairs,
  buildSentenceRepairPrompt,
  findMissingSegmentIds,
  parseSentenceRepairs,
  SENTENCE_REPAIR_SCHEMA,
  stripSegmentMarkers,
} from './sentence-segments.ts';
import {
  buildCorrectionPrompt,
  buildTranslationPrompt,
  buildTranslationSystemInstruction,
  CORRECTION_SCHEMA,
  parseCorrectionResult,
} from './translation-prompts.ts';
import { assessTranslationQuality, formatQualityIssuesForPrompt } from './translation-quality.ts';

export type ChunkTranslationResult = {
  translatedText: string;
  newTerms: string[];
  newCharacters: string[];
  chunkSummary: string;
};

type ChunkTranslationOptions = {
  sourceText: string;
  model: string;
  chunkNumber: number;
  totalChunks: number;
  retryLimit: number;
  style: string;
  glossary: string;
  characterMap: string;
  plotSummary: string;
  previousSourceText: string;
  previousTranslatedText: string;
  customInstructions: string;
  documentTypeInstruction: string;
  signal: AbortSignal;
  generate: (options: GenerateContentOptions) => Promise<ContentResult>;
  generateStream: (options: GenerateStreamOptions) => AsyncGenerator<ContentResult>;
  onUsage: (usage: NonNullable<ContentResult['usageMetadata']>) => void;
  onPreview: (text: string) => void;
  onStage: (stage: 'translating' | 'correcting' | 'repairing', message: string) => void;
  onWarning?: (code: string, metadata?: Record<string, string | number | boolean>) => void;
};

class TranslationQualityError extends Error {}

const previewText = (text: string, entries: ReturnType<typeof protectContent>['entries']) =>
  stripSegmentMarkers(restoreProtectedContent(text, entries).text);

export async function translateChunkWithQuality(options: ChunkTranslationOptions): Promise<ChunkTranslationResult> {
  const protectedSource = protectContent(options.sourceText);
  const annotatedSource = annotateTranslationSegments(protectedSource.text);
  const systemInstruction = buildTranslationSystemInstruction({
    style: options.style,
    glossary: options.glossary,
    characterMap: options.characterMap,
    plotSummary: options.plotSummary,
    previousSourceText: options.previousSourceText,
    previousTranslatedText: options.previousTranslatedText,
    customInstructions: options.customInstructions,
    documentTypeInstruction: options.documentTypeInstruction,
    preservePlaceholdersInstruction: formatProtectedContentInstruction(protectedSource.entries),
  });

  for (let attempt = 0; attempt < options.retryLimit; attempt++) {
    let draft = '';
    try {
      throwIfAborted(options.signal);
      options.onStage('translating', `正在翻譯初稿 (第 ${options.chunkNumber}/${options.totalChunks} 部分)...`);
      const stream = options.generateStream({
        model: options.model,
        systemInstruction,
        promptText: buildTranslationPrompt(annotatedSource.text),
        temperature: 0.2,
        signal: options.signal,
      });
      for await (const chunk of stream) {
        throwIfAborted(options.signal);
        draft += chunk.text || '';
        options.onPreview(previewText(draft, protectedSource.entries));
        if (chunk.usageMetadata) options.onUsage(chunk.usageMetadata);
      }

      const draftQuality = assessTranslationQuality(annotatedSource.text, draft);
      options.onStage('correcting', `正在自我校對與更新術語 (第 ${options.chunkNumber}/${options.totalChunks} 部分)...`);
      const correctionResponse = await options.generate({
        model: options.model,
        promptText: buildCorrectionPrompt({
          sourceText: annotatedSource.text,
          draftTranslation: draft,
          glossary: options.glossary,
          characterMap: options.characterMap,
          customInstructions: options.customInstructions,
          documentTypeInstruction: options.documentTypeInstruction,
          deterministicFindings: formatQualityIssuesForPrompt(draftQuality),
        }),
        temperature: 0,
        jsonSchema: CORRECTION_SCHEMA,
        signal: options.signal,
      });
      if (correctionResponse.usageMetadata) options.onUsage(correctionResponse.usageMetadata);
      const correction = parseCorrectionResult(correctionResponse.text || '{}');
      let corrected = correction.correctedTranslation || draft;

      const missingIds = [...new Set([
        ...findMissingSegmentIds(corrected, annotatedSource.segments),
        ...correction.missingSentenceIds.filter((id) => annotatedSource.segments.some((segment) => segment.id === id)),
      ])];
      if (missingIds.length) {
        options.onWarning?.('translation_sentence_omission_detected', { count: missingIds.length, chunk: options.chunkNumber });
        options.onStage('repairing', `正在補譯 ${missingIds.length} 個缺漏句子 (第 ${options.chunkNumber}/${options.totalChunks} 部分)...`);
        const repairResponse = await options.generate({
          model: options.model,
          promptText: buildSentenceRepairPrompt(annotatedSource.segments, missingIds, corrected),
          temperature: 0,
          jsonSchema: SENTENCE_REPAIR_SCHEMA,
          signal: options.signal,
        });
        if (repairResponse.usageMetadata) options.onUsage(repairResponse.usageMetadata);
        corrected = applySentenceRepairs(corrected, annotatedSource.segments, parseSentenceRepairs(repairResponse.text || '{}'));
      } else if (correction.missingContentDetected) {
        throw new TranslationQualityError('Model reported missing content without sentence IDs');
      }

      const stillMissing = findMissingSegmentIds(corrected, annotatedSource.segments);
      if (stillMissing.length) throw new TranslationQualityError(`Missing sentence markers: ${stillMissing.join(', ')}`);
      const restored = restoreProtectedContent(stripSegmentMarkers(corrected), protectedSource.entries);
      if (restored.missing.length || restored.unknown.length) {
        throw new TranslationQualityError('Protected placeholders were changed or removed');
      }
      const finalQuality = assessTranslationQuality(options.sourceText, restored.text);
      if (finalQuality.blocking) throw new TranslationQualityError('Translation failed deterministic completeness checks');
      options.onPreview(restored.text);
      return {
        translatedText: restored.text,
        newTerms: correction.newTerms,
        newCharacters: correction.newCharacters,
        chunkSummary: correction.chunkSummary,
      };
    } catch (error) {
      if (isAbortError(error) || error instanceof DOMException && error.name === 'AbortError' || (error instanceof Error && error.name === 'TranslationBudgetExceededError')) throw error;
      const message = error instanceof Error ? error.message : String(error);
      const status = typeof error === 'object' && error && 'status' in error ? Number((error as { status?: unknown }).status) : 0;
      const retryable = error instanceof TranslationQualityError || status === 429 || /429|quota|rate limit|schema/i.test(message);
      if (!retryable || attempt + 1 >= options.retryLimit) {
        throw new Error(`翻譯失敗：模型輸出未通過完整性檢查或達到 API 限制。(${message})`);
      }
      options.onWarning?.('translation_chunk_retry', { attempt: attempt + 1, chunk: options.chunkNumber });
      const waitSeconds = error instanceof TranslationQualityError ? 1 : (attempt + 1) * 5;
      options.onStage('translating', error instanceof TranslationQualityError
        ? `譯文完整性檢查未通過，正在重新嘗試 (${attempt + 1}/${options.retryLimit})...`
        : `API 限制，等待 ${waitSeconds} 秒後重試...`);
      await abortableDelay(waitSeconds * 1000, options.signal);
    }
  }
  throw new Error('Translation retries exhausted');
}
