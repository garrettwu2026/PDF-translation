import { useMemo } from 'react';
import { estimateTextTokens, splitMarkdownIntoTokenChunks } from '../lib/text';
import { sampleDocumentForAnalysis } from '../lib/document-analysis';
import { resolveDocumentType, type DocumentTypeId, type DetectedDocumentType } from '../lib/document-types';
import { formatNovelContinuity, type NovelContinuityMemory } from '../lib/novel-continuity';
import { forecastDocumentCost, type CostSample } from '../lib/cost-forecast';
import { estimatePromptOverheads } from '../lib/cost-prompts';

type Options = { extractionComplete: boolean; extractedText: string; splitTranslation: boolean;
  tokenCount: number | null; completedCostChunks: number; translationStyle: string | null;
  glossary: string; characterMap: string; plotSummary: string; customInstructions: string;
  novelContinuity: NovelContinuityMemory; documentType: DocumentTypeId;
  resolvedDocumentType: DetectedDocumentType | null; selectedModel: string;
  analysisComplete: boolean; chapterProofreading: boolean; totalPages: number;
  completedExtractionChunks: number; translationRetryLimit: number;
  actualCost: { totalUsd: number }; costSamples: CostSample[]; inFlightStartUsd: number | null; };

/** Shared by the display and budget preflight; segmentation remains memoized. */
export function useDocumentCostForecast({ extractionComplete, extractedText, splitTranslation, tokenCount, completedCostChunks, translationStyle, glossary, characterMap, plotSummary, customInstructions, novelContinuity, documentType, resolvedDocumentType, selectedModel, analysisComplete, chapterProofreading, totalPages, completedExtractionChunks, translationRetryLimit, actualCost, costSamples, inFlightStartUsd }: Options) {
  // Cache book segmentation; streaming preview updates must not rescan the entire book.
  const sourceChunkTokens = useMemo(() => extractionComplete && extractedText
    ? (splitTranslation ? splitMarkdownIntoTokenChunks(extractedText, 1800) : [extractedText]).map(estimateTextTokens)
    : [], [extractionComplete, extractedText, splitTranslation]);
  const estimatedSourceChunks = tokenCount ? (splitTranslation ? Math.ceil(tokenCount / 1800) : 1) : 0;
  const remainingSourceTokens = sourceChunkTokens.length
    ? sourceChunkTokens.slice(completedCostChunks).reduce((sum, tokens) => sum + tokens, 0) : tokenCount;
  const memoryTokens = useMemo(() => estimateTextTokens([
    translationStyle, glossary, characterMap, plotSummary, customInstructions,
    formatNovelContinuity(novelContinuity),
  ].filter(Boolean).join('\n')), [translationStyle, glossary, characterMap, plotSummary, customInstructions, novelContinuity]);
  const forecastDocumentType = resolveDocumentType(documentType, resolvedDocumentType ?? 'general');
  const analysisSourceTokens = useMemo(() => extractionComplete && extractedText
    ? estimateTextTokens(sampleDocumentForAnalysis(extractedText)) : undefined, [extractionComplete, extractedText]);
  const promptOverheads = useMemo(() => estimatePromptOverheads({
    style: translationStyle || '一般/通用', glossary: glossary || '無', characterMap: characterMap || '無',
    plotSummary: [plotSummary, formatNovelContinuity(novelContinuity)].filter(Boolean).join('\n'),
    customInstructions, documentType: forecastDocumentType,
  }), [translationStyle, glossary, characterMap, plotSummary, novelContinuity, customInstructions, forecastDocumentType]);
  const forecastOptions = {
    model: selectedModel, documentTokens: tokenCount, remainingTokens: remainingSourceTokens,
    remainingChunks: sourceChunkTokens.length ? Math.max(0, sourceChunkTokens.length - completedCostChunks) : estimatedSourceChunks,
    extractionComplete, analysisComplete, chapterReview: chapterProofreading,
    documentType: forecastDocumentType, promptOverheads, analysisSourceTokens,
    extractionChunks: totalPages > 0 ? totalPages : undefined,
    extractionNativeOnly: totalPages > 0 && tokenCount !== null,
    remainingExtractionRatio: totalPages > 0 ? 1 - completedExtractionChunks / totalPages : 1,
    currentChunkTokens: sourceChunkTokens[completedCostChunks],
    retryLimit: translationRetryLimit, memoryTokens, customInstructions,
    spentUsd: actualCost.totalUsd, samples: costSamples,
    inFlightUsd: inFlightStartUsd === null ? 0 : Math.max(0, actualCost.totalUsd - inFlightStartUsd),
  };
  const costForecast = forecastDocumentCost(forecastOptions);

  return { sourceChunkTokens, estimatedSourceChunks, forecastOptions, costForecast };
}
