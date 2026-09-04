import { HistoryStorageError, type HistoryRecord, type SavedRequest } from './db.ts';
import { savedRequestKey } from './durable-requests.ts';
import { assertCompleteOutput, contentDigest } from './request-integrity.ts';
import type { GenerateContentOptions, GenerateStreamOptions, ContentResult } from './ai-providers.ts';
import { buildDocumentAnalysisPrompt, DOCUMENT_ANALYSIS_SCHEMA, parseDocumentAnalysis } from './document-analysis.ts';
import { splitMarkdownIntoTokenChunks } from './text.ts';
import { createLayeredDocumentMemory, formatLayeredDocumentMemory } from './document-memory.ts';
import { normalizeNovelContinuity, seedNovelContinuity, formatNovelContinuity } from './novel-continuity.ts';
import { resolveDocumentType, normalizeDocumentType, normalizeDetectedDocumentType, getDocumentTypeInstruction } from './document-types.ts';
import { translateChunkWithQuality } from './translation-runner.ts';
import type { CostStage } from './cost-forecast.ts';

export type CachePlan = {matches: number; stages: {stage: CostStage; model: string}[]};
export const EMPTY_CACHE_PLAN: CachePlan = {matches: 0, stages: []};
export type ResumeSettings = {selectedModel: string; splitTranslation: boolean; documentType: string; customInstructions: string; chapterProofreading: boolean};
export const resumeSettingsDigest = (settings: ResumeSettings) => contentDigest(JSON.stringify({version: 1, ...settings}));

/** Read-only execution of cached analysis and the next chunk. No credentials, network or writes.
 * Stop at the FIRST missing/invalid entry. Chapter review / OCR stay conservatively uncredited.
 */
export async function inspectResumeCache(record: HistoryRecord, settings: ResumeSettings, get: (id: string) => Promise<SavedRequest | undefined>, retryLimit = 3): Promise<CachePlan> {
  const result: CachePlan = {matches: 0, stages: []};
  if (record.extractionComplete === false || !record.extractedText || record.status === 'completed'
    || !record.resumeSettings || record.resumeSettings !== await resumeSettingsDigest(settings)) return result;
  const chunks = settings.splitTranslation ? splitMarkdownIntoTokenChunks(record.extractedText, 1800) : [record.extractedText];
  const index = record.currentChunk;
  if (!chunks[index]) return result;
  const visited = new Set<string>();
  const lookup = async (options: GenerateContentOptions, stream: boolean): Promise<ContentResult> => {
    const id = await savedRequestKey(record.id, options, stream);
    const saved = await get(id);
    if (!saved?.response || !['complete','unknown'].includes(saved.state)) throw new HistoryStorageError('unknown', 'cache-plan-stop');
    try { assertCompleteOutput(saved.response); } catch { throw new HistoryStorageError('unknown', 'cache-plan-stop'); }
    if (!visited.has(id)) { visited.add(id); result.matches++; result.stages.push({stage: options.costStage ?? 'legacy', model: options.model}); }
    return {text: saved.response.text, finishReason: saved.response.finishReason};
  };
  try {
    let style = record.translationStyle || '一般/通用', glossary = record.glossaryText || '無', characters = record.characterMap || '', globalSummary = '';
    let type = normalizeDetectedDocumentType(record.effectiveDocumentType) ?? 'general';
    let novel = normalizeNovelContinuity(record.novelContinuity);
    if (index === 0 || (settings.documentType === 'auto' && !record.effectiveDocumentType)) {
      const response = await lookup({model: settings.selectedModel, costStage: 'analysis',
        promptText: buildDocumentAnalysisPrompt(record.extractedText), temperature: 0, maxOutputTokens: 4096, jsonSchema: DOCUMENT_ANALYSIS_SCHEMA}, false);
      const analysis = parseDocumentAnalysis(response.text);
      style = analysis.styleGuide; glossary = analysis.glossary; characters = analysis.characterMap; globalSummary = analysis.globalSummary; type = analysis.documentType;
      novel = seedNovelContinuity(characters);
    }
    const effective = resolveDocumentType(normalizeDocumentType(settings.documentType), type);
    if (effective === 'novel' && novel.entities.length === 0) novel = seedNovelContinuity(characters, index);
    const memory = createLayeredDocumentMemory(globalSummary, index > 0 ? record.plotSummary || '' : '');
    const plot = [formatLayeredDocumentMemory(memory), effective === 'novel' ? formatNovelContinuity(novel) : ''].filter(Boolean).join('\n\n');
    await translateChunkWithQuality({
      sourceText: chunks[index], model: settings.selectedModel, chunkNumber: index + 1, totalChunks: chunks.length, retryLimit: Math.min(1, retryLimit),
      style, glossary, characterMap: characters, plotSummary: plot,
      previousSourceText: index > 0 ? chunks[index - 1].slice(-1000) : '',
      previousTranslatedText: record.chapterContext?.previousTranslation ?? (index > 0 ? record.translatedText.slice(-1000) : ''),
      customInstructions: settings.customInstructions, documentTypeInstruction: getDocumentTypeInstruction(effective), documentType: effective,
      signal: new AbortController().signal, generate: options => lookup(options, false),
      generateStream: async function* (options: GenerateStreamOptions) { yield await lookup(options, true); },
      onUsage: () => {}, onPreview: () => {}, onStage: () => {},
    });
  } catch { /* A missing entry, invalid result or changed pipeline leaves the rest uncredited. */ }
  return result;
}
