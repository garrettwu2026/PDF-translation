export type ModelConfig = {
  id: string;
  name: string;
  provider: 'google' | 'openai';
  inputPrice: number;
  cachedInputPrice: number;
  outputPrice: number;
  badge: string;
  priceNote?: string;
  pricingReviewDate?: string;
  supportsCustomTemperature: boolean;
};

export type TokenUsage = {
  inputTokens: number;
  cachedInputTokens?: number;
  cacheWriteInputTokens?: number;
  outputTokens: number;
};

export type ModelCatalogStatus = {
  lastVerified: string;
  nextReview: string;
  daysUntilReview: number;
  needsReview: boolean;
  upcomingPricingReview?: { modelName: string; date: string; daysUntil: number };
};

// Paid-tier standard pricing in USD per 1M tokens, verified against the
// providers' official pricing pages on 2026-09-01.
export const MODEL_CATALOG_LAST_VERIFIED = '2026-09-01';
export const MODEL_CATALOG_REVIEW_INTERVAL_DAYS = 45;
export const MODEL_PRICING_SOURCES = {
  google: 'https://ai.google.dev/gemini-api/docs/pricing',
  openai: 'https://developers.openai.com/api/docs/models/compare',
} as const;

export const MODELS: readonly ModelConfig[] = [
  { id: 'gemini-3.7-flash', name: 'Gemini 3.7 Flash', provider: 'google', inputPrice: 0.75, cachedInputPrice: 0.075, outputPrice: 3.75, badge: '最新推薦', priceNote: '優惠價至 2026/12/31', pricingReviewDate: '2026-12-01', supportsCustomTemperature: true },
  { id: 'gemini-3.5-flash-lite', name: 'Gemini 3.5 Flash-Lite', provider: 'google', inputPrice: 0.30, cachedInputPrice: 0.03, outputPrice: 2.50, badge: '翻譯省錢', supportsCustomTemperature: true },
  { id: 'gemini-3.1-pro-preview', name: 'Gemini 3.1 Pro Preview', provider: 'google', inputPrice: 2.00, cachedInputPrice: 0.20, outputPrice: 12.00, badge: '最強品質', priceNote: '單次提示 ≤ 200K tokens', supportsCustomTemperature: true },
  { id: 'gpt-5.6-luna', name: 'GPT-5.6 Luna', provider: 'openai', inputPrice: 0.20, cachedInputPrice: 0.02, outputPrice: 1.20, badge: '翻譯省錢', supportsCustomTemperature: false },
  { id: 'gpt-5.6-terra', name: 'GPT-5.6 Terra', provider: 'openai', inputPrice: 2.00, cachedInputPrice: 0.20, outputPrice: 12.00, badge: '均衡推薦', supportsCustomTemperature: false },
  { id: 'gpt-5.6-sol', name: 'GPT-5.6 Sol', provider: 'openai', inputPrice: 4.00, cachedInputPrice: 0.40, outputPrice: 20.00, badge: '最強品質', priceNote: '優惠價至少至 2026/11/21', pricingReviewDate: '2026-11-01', supportsCustomTemperature: false },
];

export const DEFAULT_MODEL_ID = 'gemini-3.7-flash';
export const USD_TO_TWD = 32.5;
export const PIPELINE_INPUT_MULTIPLIER = 4;
export const PIPELINE_OUTPUT_MULTIPLIER = 2.5;

export const getModelConfig = (modelId: string) =>
  MODELS.find((model) => model.id === modelId) ?? MODELS[0];

export const getTemperatureConfig = (model: ModelConfig, temperature: number) =>
  model.supportsCustomTemperature ? { temperature } : {};

export const calculateTokenCost = (
  model: ModelConfig,
  usage: TokenUsage,
) => {
  const inputTokens = Math.max(0, usage.inputTokens);
  const cachedInputTokens = Math.min(inputTokens, Math.max(0, usage.cachedInputTokens ?? 0));
  const cacheWriteInputTokens = Math.min(
    inputTokens - cachedInputTokens,
    Math.max(0, usage.cacheWriteInputTokens ?? 0),
  );
  const regularInputTokens = inputTokens - cachedInputTokens - cacheWriteInputTokens;
  const regularInputUsd = (regularInputTokens / 1_000_000) * model.inputPrice;
  const cachedInputUsd = (cachedInputTokens / 1_000_000) * model.cachedInputPrice;
  const cacheWriteInputUsd = (cacheWriteInputTokens / 1_000_000) * model.inputPrice;
  const inputUsd = regularInputUsd + cachedInputUsd + cacheWriteInputUsd;
  const outputUsd = (Math.max(0, usage.outputTokens) / 1_000_000) * model.outputPrice;
  const totalUsd = inputUsd + outputUsd;
  return {
    regularInputTokens,
    cachedInputTokens,
    cacheWriteInputTokens,
    regularInputUsd,
    cachedInputUsd,
    cacheWriteInputUsd,
    inputUsd,
    outputUsd,
    totalUsd,
    totalTwd: totalUsd * USD_TO_TWD,
  };
};

export const estimatePipelineCost = (model: ModelConfig, documentTokens: number) => {
  const inputTokens = Math.round(Math.max(0, documentTokens) * PIPELINE_INPUT_MULTIPLIER);
  const outputTokens = Math.round(Math.max(0, documentTokens) * PIPELINE_OUTPUT_MULTIPLIER);
  return { inputTokens, outputTokens, ...calculateTokenCost(model, { inputTokens, outputTokens }) };
};

const addUtcDays = (isoDate: string, days: number) => {
  const date = new Date(`${isoDate}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
};

const daysBetween = (from: string, to: string) =>
  Math.ceil((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);

export const getModelCatalogStatus = (today = new Date().toISOString().slice(0, 10)): ModelCatalogStatus => {
  const nextReview = addUtcDays(MODEL_CATALOG_LAST_VERIFIED, MODEL_CATALOG_REVIEW_INTERVAL_DAYS);
  const upcomingPricingReview = MODELS
    .filter((model): model is ModelConfig & { pricingReviewDate: string } => Boolean(model.pricingReviewDate))
    .map((model) => ({
      modelName: model.name,
      date: model.pricingReviewDate,
      daysUntil: daysBetween(today, model.pricingReviewDate),
    }))
    .sort((a, b) => a.daysUntil - b.daysUntil)
    .find((item) => item.daysUntil >= 0 && item.daysUntil <= 30);
  const daysUntilReview = daysBetween(today, nextReview);

  return {
    lastVerified: MODEL_CATALOG_LAST_VERIFIED,
    nextReview,
    daysUntilReview,
    needsReview: daysUntilReview <= 0 || Boolean(upcomingPricingReview),
    upcomingPricingReview,
  };
};

