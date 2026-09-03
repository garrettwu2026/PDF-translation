import { abortableDelay, isAbortError, throwIfAborted } from './abort.ts';
import type { ContentResult, GenerateContentOptions, GenerateStreamOptions } from './ai-providers.ts';
import { protectContent, restoreProtectedContent, formatProtectedContentInstruction } from './protected-content.ts';
import {
  annotateTranslationSegments,
  applySentenceRevisions,
  applySentenceRepairs,
  buildSentenceRepairPrompt,
  findMissingSegmentIds,
  inspectTranslationSegments,
  extractSegmentTranslations,
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
import { getQualityReviewModelId } from './models.ts';
import {
  buildSemanticReviewPrompt,
  parseSemanticReview,
  selectRiskySentences,
  SEMANTIC_REVIEW_SCHEMA,
} from './translation-risk.ts';
import {
  classifyProviderError,
  formatProviderErrorForUser,
  getRetryDelayMs,
  isRetryableProviderError,
} from './provider-errors.ts';
import { estimateTranslationOutputLimit, TranslationBudgetExceededError } from './translation-budget.ts';

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
  onUsage: (usage: NonNullable<ContentResult['usageMetadata']>, model: string) => void;
  onPreview: (text: string) => void;
  onStage: (stage: 'translating' | 'correcting' | 'repairing' | 'semantic_review', message: string) => void;
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
  let semanticReviewAttempted = false;
  const maxOutputTokens = estimateTranslationOutputLimit(annotatedSource.text);

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
        maxOutputTokens,
        signal: options.signal,
      });
      for await (const chunk of stream) {
        throwIfAborted(options.signal);
        draft += chunk.text || '';
        options.onPreview(previewText(draft, protectedSource.entries));
        if (chunk.usageMetadata) options.onUsage(chunk.usageMetadata, options.model);
      }

      const draftQuality = assessTranslationQuality(annotatedSource.text, draft, {
        documentType: options.documentType,
        glossary: options.glossary,
      });
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
        maxOutputTokens,
        jsonSchema: CORRECTION_SCHEMA,
        signal: options.signal,
      });
      if (correctionResponse.usageMetadata) options.onUsage(correctionResponse.usageMetadata, options.model);
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
          maxOutputTokens: 2_048,
          jsonSchema: SENTENCE_REPAIR_SCHEMA,
          signal: options.signal,
        });
        if (repairResponse.usageMetadata) options.onUsage(repairResponse.usageMetadata, options.model);
        corrected = applySentenceRepairs(corrected, annotatedSource.segments, parseSentenceRepairs(repairResponse.text || '{}'));
      } else if (correction.missingContentDetected) {
        throw new TranslationQualityError('Model reported missing content without sentence IDs');
      }

      let segmentInspection = inspectTranslationSegments(corrected, annotatedSource.segments);
      const invalidSegmentIds = [...new Set([
        ...segmentInspection.missing,
        ...segmentInspection.empty,
        ...segmentInspection.duplicates,
        ...segmentInspection.unknown,
      ])];
      if (invalidSegmentIds.length || segmentInspection.outOfOrder) {
        throw new TranslationQualityError(`Invalid sentence markers: ${invalidSegmentIds.join(', ') || 'out of order'}`);
      }

      const riskySentences = selectRiskySentences({
        segments: annotatedSource.segments,
        translations: extractSegmentTranslations(corrected, annotatedSource.segments),
        glossary: options.glossary,
        documentType: options.documentType,
        correctionUncertain: correction.foundHallucinations || correction.missingContentDetected,
      });
      if (riskySentences.length && !semanticReviewAttempted) {
        semanticReviewAttempted = true;
        options.onStage('semantic_review', `正在複審 ${riskySentences.length} 個高風險句子 (第 ${options.chunkNumber}/${options.totalChunks} 部分)...`);
        options.onWarning?.('translation_selective_semantic_review', { count: riskySentences.length, chunk: options.chunkNumber });
        try {
          const reviewModel = getQualityReviewModelId(options.model);
          const semanticReview = await options.generate({
            model: reviewModel,
            promptText: buildSemanticReviewPrompt({
              sentences: riskySentences,
              glossary: options.glossary,
              documentTypeInstruction: options.documentTypeInstruction,
            }),
            temperature: 0,
            maxOutputTokens: 2_048,
            jsonSchema: SEMANTIC_REVIEW_SCHEMA,
            signal: options.signal,
          });
          if (semanticReview.usageMetadata) options.onUsage(semanticReview.usageMetadata, reviewModel);
          const allowedIds = new Set(riskySentences.map((sentence) => sentence.id));
          corrected = applySentenceRevisions(
            corrected,
            annotatedSource.segments,
            parseSemanticReview(semanticReview.text || '{}', allowedIds),
          );
          segmentInspection = inspectTranslationSegments(corrected, annotatedSource.segments);
          if (segmentInspection.missing.length || segmentInspection.empty.length || segmentInspection.duplicates.length || segmentInspection.unknown.length || segmentInspection.outOfOrder) {
            throw new TranslationQualityError('Semantic review changed sentence markers');
          }
        } catch (reviewError) {
          if (isAbortError(reviewError) || reviewError instanceof TranslationBudgetExceededError) throw reviewError;
          if (reviewError instanceof TranslationQualityError) throw reviewError;
          options.onWarning?.('translation_selective_semantic_review_failed', { chunk: options.chunkNumber });
        }
      }

      const restored = restoreProtectedContent(stripSegmentMarkers(corrected), protectedSource.entries);
      if (restored.missing.length || restored.unknown.length || restored.duplicates.length || restored.outOfOrder) {
        throw new TranslationQualityError('Protected placeholders were changed, duplicated, removed, or reordered');
      }
      const finalQuality = assessTranslationQuality(options.sourceText, restored.text, {
        documentType: options.documentType,
        glossary: options.glossary,
      });
      if (finalQuality.blocking) throw new TranslationQualityError('Translation failed deterministic completeness checks');
      options.onPreview(restored.text);
      return {
        translatedText: restored.text,
        newTerms: correction.newTerms,
        newCharacters: correction.newCharacters,
        chunkSummary: correction.chunkSummary,
      };
    } catch (error) {
      if (isAbortError(error) || error instanceof DOMException && error.name === 'AbortError' || error instanceof TranslationBudgetExceededError) throw error;
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
