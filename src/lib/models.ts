export type ModelConfig = {
  id: string;
  name: string;
  provider: 'google' | 'openai';
  inputPrice: number;
  cachedInputPrice: number;
  outputPrice: number;
  badge: string;
  priceNote?: string;
};

// Paid-tier standard pricing in USD per 1M tokens, verified against the
// providers' official pricing pages on 2026-08-31.
export const MODELS: readonly ModelConfig[] = [
  { id: 'gemini-3.7-flash', name: 'Gemini 3.7 Flash', provider: 'google', inputPrice: 0.75, cachedInputPrice: 0.075, outputPrice: 3.75, badge: '最新推薦', priceNote: '優惠價至 2026/12/31' },
  { id: 'gemini-3.5-flash-lite', name: 'Gemini 3.5 Flash-Lite', provider: 'google', inputPrice: 0.30, cachedInputPrice: 0.03, outputPrice: 2.50, badge: '翻譯省錢' },
  { id: 'gemini-3.1-pro-preview', name: 'Gemini 3.1 Pro Preview', provider: 'google', inputPrice: 2.00, cachedInputPrice: 0.20, outputPrice: 12.00, badge: '最強品質', priceNote: '單次提示 ≤ 200K tokens' },
  { id: 'gpt-5.6-luna', name: 'GPT-5.6 Luna', provider: 'openai', inputPrice: 0.20, cachedInputPrice: 0.02, outputPrice: 1.20, badge: '翻譯省錢' },
  { id: 'gpt-5.6-terra', name: 'GPT-5.6 Terra', provider: 'openai', inputPrice: 2.00, cachedInputPrice: 0.20, outputPrice: 12.00, badge: '均衡推薦' },
  { id: 'gpt-5.6-sol', name: 'GPT-5.6 Sol', provider: 'openai', inputPrice: 4.00, cachedInputPrice: 0.40, outputPrice: 20.00, badge: '最強品質', priceNote: '優惠價至少至 2026/11/21' },
];

export const DEFAULT_MODEL_ID = 'gemini-3.7-flash';
export const USD_TO_TWD = 32.5;
export const PIPELINE_INPUT_MULTIPLIER = 4;
export const PIPELINE_OUTPUT_MULTIPLIER = 2.5;

export const getModelConfig = (modelId: string) =>
  MODELS.find((model) => model.id === modelId) ?? MODELS[0];

export const calculateTokenCost = (
  model: ModelConfig,
  inputTokens: number,
  outputTokens: number,
) => {
  const inputUsd = (Math.max(0, inputTokens) / 1_000_000) * model.inputPrice;
  const outputUsd = (Math.max(0, outputTokens) / 1_000_000) * model.outputPrice;
  const totalUsd = inputUsd + outputUsd;
  return { inputUsd, outputUsd, totalUsd, totalTwd: totalUsd * USD_TO_TWD };
};

export const estimatePipelineCost = (model: ModelConfig, documentTokens: number) => {
  const inputTokens = Math.round(Math.max(0, documentTokens) * PIPELINE_INPUT_MULTIPLIER);
  const outputTokens = Math.round(Math.max(0, documentTokens) * PIPELINE_OUTPUT_MULTIPLIER);
  return { inputTokens, outputTokens, ...calculateTokenCost(model, inputTokens, outputTokens) };
};
