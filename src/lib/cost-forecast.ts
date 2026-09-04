import { calculateTokenCost, getModelConfig, getQualityReviewModelId } from './models.ts';

export const COST_STAGE_LABELS = {
  extraction: 'PDF 擷取／排版', analysis: '文件分析', draft: '翻譯初稿',
  correction: '逐段校對', repair: '漏譯補修', semantic_review: '風險句複審',
  chapter_review: '章節校稿', retry: '重試追加用量', legacy: '舊紀錄／未分類',
} as const;
export type CostStage = keyof typeof COST_STAGE_LABELS;
export type CostBreakdown = {
  stage: CostStage; model: string; inputTokens: number; outputTokens: number;
  reasoningTokens: number; inputUsd: number; outputUsd: number;
};
export type CostSample = { profile: string; sourceTokens: number; costUsd: number };
// Non-sensitive configuration fingerprint; never persist the user's instructions in samples.
export const costProfile = (model: string, type: string, chapterReview: boolean, retryLimit: number, instructions = '') => {
  let hash = 2166136261;
  for (const character of instructions) hash = Math.imul(hash ^ character.codePointAt(0)!, 16777619);
  return `${model}:${type}:${chapterReview}:${retryLimit}:${hash >>> 0}`;
};
export const normalizeCostSamples = (value: unknown): CostSample[] => Array.isArray(value)
  ? value.filter((s): s is CostSample => s && typeof s.profile === 'string'
    && Number.isFinite(s.sourceTokens) && s.sourceTokens > 0
    && Number.isFinite(s.costUsd) && s.costUsd >= 0).slice(-12) : [];

export type ForecastOptions = {
  model: string; documentTokens: number | null; remainingTokens: number | null;
  remainingChunks: number; extractionComplete: boolean; analysisComplete: boolean;
  chapterReview: boolean; documentType: string; retryLimit: number;
  memoryTokens: number; spentUsd: number; samples?: CostSample[];
  customInstructions?: string; inFlightUsd?: number;
  promptOverheads?: Partial<Record<CostStage, number>>;
  analysisSourceTokens?: number; extractionChunks?: number; currentChunkTokens?: number;
  remainingExtractionRatio?: number;
  extractionNativeOnly?: boolean;
};

/** Heuristic planning assumptions, not provider quotas or a billing guarantee.
 * Stage rows include prompt/context overhead, visible output and a reasoning allowance.
 * No cache hits are assumed before observations; samples include real cache/reasoning costs.
 */
export function forecastDocumentCost(options: ForecastOptions) {
  const known = options.documentTokens !== null && options.remainingTokens !== null;
  const t = Math.max(0, options.remainingTokens ?? 0);
  const n = t > 0 ? Math.max(1, options.remainingChunks) : 0;
  const context = Math.max(800, options.memoryTokens);
  const overhead = (stage: CostStage, fallback: number) => options.promptOverheads?.[stage] ?? fallback;
  const rows: CostBreakdown[] = [];
  const add = (stage: CostStage, input: number, output: number, model = options.model) => {
    if (!known || input + output <= 0) return;
    const inputTokens = Math.ceil(input), outputTokens = Math.ceil(output);
    const cost = calculateTokenCost(getModelConfig(model), { inputTokens, outputTokens });
    rows.push({ stage, model, inputTokens, outputTokens, reasoningTokens: 0,
      inputUsd: cost.inputUsd, outputUsd: cost.outputUsd });
  };
  const extractionRatio = Math.min(1, Math.max(0, options.remainingExtractionRatio ?? 1));
  if (!options.extractionComplete && !options.extractionNativeOnly) add('extraction',
    (t + (options.extractionChunks ?? n) * overhead('extraction', 500)) * extractionRatio,
    t * 1.3 * extractionRatio);
  if (!options.analysisComplete && t > 0) add('analysis', (options.analysisSourceTokens ?? Math.min(options.documentTokens ?? 0, 12500)) + overhead('analysis', 1000), 2000);
  // Source markers/protected placeholders and translated JSON inflate the plain text.
  add('draft', t * 1.15 + n * overhead('draft', 1500 + context), t * 1.6 + n * 256);
  add('correction', t * 2.75 + n * overhead('correction', 1500 + context * 0.5), t * 1.6 + n * 512);
  // Expected repair/review frequencies. The UI exposes a wide planning range.
  add('repair', t * 0.15 + n * 100, t * 0.08 + n * 50);
  add('semantic_review', t * 0.5 + n * overhead('semantic_review', 300 + context * 0.25), t * 0.2 + n * 128,
    getQualityReviewModelId(options.model));
  if (options.chapterReview) {
    const coverage = options.documentType === 'novel' || options.documentType === 'business_legal' ? 1 : 0.5;
    add('chapter_review', (t * 2.6 + Math.ceil(n / 6) * overhead('chapter_review', 600 + context)) * coverage,
      (t * 1.6 + Math.ceil(n / 6) * 512) * coverage);
  }
  // Only the draft/correction/repair cycle retries; semantic review is capped once per chunk.
  const regular = rows.filter(r => ['draft', 'correction', 'repair'].includes(r.stage));
  const retryShare = Math.min(0.5, Math.max(0, options.retryLimit - 1) * 0.1);
  add('retry', regular.reduce((s, r) => s + r.inputTokens, 0) * retryShare,
    regular.reduce((s, r) => s + r.outputTokens, 0) * retryShare);
  const sum = (values: CostBreakdown[]) => values.reduce((s, r) => s + r.inputUsd + r.outputUsd, 0);
  const setupUsd = sum(rows.filter(r => r.stage === 'extraction' || r.stage === 'analysis'));
  const pipelineUsd = sum(rows) - setupUsd;
  const profile = costProfile(options.model, options.documentType, options.chapterReview, options.retryLimit, options.customInstructions);
  const samples = normalizeCostSamples(options.samples).filter(s => s.profile === profile);
  const sampleTokens = samples.reduce((s, v) => s + v.sourceTokens, 0);
  const calibrated = samples.length >= 3 && sampleTokens > 0;
  const empiricalUsd = calibrated ? t * samples.reduce((s, v) => s + v.costUsd, 0) / sampleTokens : pipelineUsd;
  // Blend observations with a baseline: short samples may not yet contain a chapter review.
  const weight = calibrated ? Math.min(0.8, samples.length / 12) : 0;
  const calibrationUsd = (empiricalUsd - pipelineUsd) * weight;
  // Overspend on one chunk must not erase the budget for all the untouched chunks.
  const currentShare = t > 0 ? Math.min(1, (options.currentChunkTokens ?? t / n) / t) : 0;
  const inFlightCreditUsd = Math.min((pipelineUsd + calibrationUsd) * currentShare, Math.max(0, options.inFlightUsd ?? 0));
  const remainingUsd = setupUsd + pipelineUsd + calibrationUsd - inFlightCreditUsd;
  const lowUsd = options.spentUsd + remainingUsd * (calibrated ? 0.75 : 0.6);
  const highUsd = options.spentUsd + remainingUsd * (calibrated ? 1.5 : 2);
  return { known, rows, remainingUsd, totalUsd: options.spentUsd + remainingUsd,
    lowUsd, highUsd, calibrated, sampleCount: samples.length, calibrationUsd, inFlightCreditUsd };
}
