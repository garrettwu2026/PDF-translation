import { abortableDelay, isAbortError, throwIfAborted } from './abort.ts';
import type { ContentResult, GenerateContentOptions, GenerateStreamOptions } from './ai-providers.ts';
import { protectContent, restoreProtectedContent, formatProtectedContentInstruction } from './protected-content.ts';
import {
  annotateTranslationSegments,
  applySentenceRepairs,
  buildSentenceRepairPrompt,
  findMissingSegmentIds,
  inspectTranslationSegments,
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
import type { DetectedDocumentType } from './document-types.ts';
import {
  classifyProviderError,
  formatProviderErrorForUser,
  getRetryDelayMs,
  isRetryableProviderError,
} from './provider-errors.ts';

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
  documentType: DetectedDocumentType;
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

      const draftQuality = assessTranslationQuality(annotatedSource.text, draft, { documentType: options.documentType });
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

      const segmentInspection = inspectTranslationSegments(corrected, annotatedSource.segments);
      const invalidSegmentIds = [...new Set([
        ...segmentInspection.missing,
        ...segmentInspection.empty,
        ...segmentInspection.duplicates,
        ...segmentInspection.unknown,
      ])];
      if (invalidSegmentIds.length || segmentInspection.outOfOrder) {
        throw new TranslationQualityError(`Invalid sentence markers: ${invalidSegmentIds.join(', ') || 'out of order'}`);
      }
      const restored = restoreProtectedContent(stripSegmentMarkers(corrected), protectedSource.entries);
      if (restored.missing.length || restored.unknown.length || restored.duplicates.length || restored.outOfOrder) {
        throw new TranslationQualityError('Protected placeholders were changed, duplicated, removed, or reordered');
      }
      const finalQuality = assessTranslationQuality(options.sourceText, restored.text, { documentType: options.documentType });
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
      const providerError = classifyProviderError(error);
      const retryable = error instanceof TranslationQualityError || isRetryableProviderError(providerError);
      if (!retryable || attempt + 1 >= options.retryLimit) {
        if (error instanceof TranslationQualityError) {
          throw new Error(`翻譯失敗：模型輸出未通過完整性檢查。(${error.message})`);
        }
        throw new Error(formatProviderErrorForUser(providerError));
      }
      options.onWarning?.('translation_chunk_retry', { attempt: attempt + 1, chunk: options.chunkNumber });
      const waitMilliseconds = error instanceof TranslationQualityError ? 1_000 : getRetryDelayMs(providerError, attempt);
      const waitSeconds = Math.max(1, Math.ceil(waitMilliseconds / 1000));
      options.onStage('translating', error instanceof TranslationQualityError
        ? `譯文完整性檢查未通過，正在重新嘗試 (${attempt + 1}/${options.retryLimit})...`
        : `API 暫時無法使用，等待 ${waitSeconds} 秒後重試...`);
      await abortableDelay(waitMilliseconds, options.signal);
    }
  }
  throw new Error('Translation retries exhausted');
}
