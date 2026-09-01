import type { UsageMetadata } from './ai-providers';
import { calculateTokenCost, type ModelConfig } from './models.ts';

export const DEFAULT_TRANSLATION_BUDGET_USD = 5;
export const DEFAULT_TRANSLATION_RETRY_LIMIT = 3;
export const MIN_TRANSLATION_RETRY_LIMIT = 1;
export const MAX_TRANSLATION_RETRY_LIMIT = 6;

export class TranslationBudgetExceededError extends Error {
  readonly spentUsd: number;
  readonly limitUsd: number;

  constructor(spentUsd: number, limitUsd: number) {
    super(`翻譯費用已達 $${limitUsd.toFixed(2)} USD 上限（目前約 $${spentUsd.toFixed(4)} USD）`);
    this.name = 'TranslationBudgetExceededError';
    this.spentUsd = spentUsd;
    this.limitUsd = limitUsd;
  }
}

export class TranslationUsageMeter {
  inputTokens = 0;
  cachedInputTokens = 0;
  cacheWriteInputTokens = 0;
  outputTokens = 0;
  reasoningTokens = 0;

  reset() {
    this.inputTokens = 0;
    this.cachedInputTokens = 0;
    this.cacheWriteInputTokens = 0;
    this.outputTokens = 0;
    this.reasoningTokens = 0;
  }

  add(usage?: UsageMetadata) {
    const inputTokens = Math.max(0, usage?.promptTokenCount ?? 0);
    const cachedInputTokens = Math.min(inputTokens, Math.max(0, usage?.cachedPromptTokenCount ?? 0));
    const cacheWriteInputTokens = Math.min(
      inputTokens - cachedInputTokens,
      Math.max(0, usage?.cacheWriteTokenCount ?? 0),
    );
    this.inputTokens += inputTokens;
    this.cachedInputTokens += cachedInputTokens;
    this.cacheWriteInputTokens += cacheWriteInputTokens;
    this.outputTokens += Math.max(0, usage?.billedOutputTokenCount ?? usage?.candidatesTokenCount ?? 0);
    this.reasoningTokens += Math.max(0, usage?.reasoningTokenCount ?? 0);
    return this.totals();
  }

  totals() {
    return {
      inputTokens: this.inputTokens,
      cachedInputTokens: this.cachedInputTokens,
      cacheWriteInputTokens: this.cacheWriteInputTokens,
      outputTokens: this.outputTokens,
      reasoningTokens: this.reasoningTokens,
    };
  }

  cost(model: ModelConfig) {
    return calculateTokenCost(model, this.totals());
  }

  enforce(model: ModelConfig, limitUsd: number) {
    const cost = this.cost(model);
    if (limitUsd > 0 && cost.totalUsd > limitUsd) {
      throw new TranslationBudgetExceededError(cost.totalUsd, limitUsd);
    }
    return cost;
  }
}

export const clampRetryLimit = (value: number) =>
  Math.min(MAX_TRANSLATION_RETRY_LIMIT, Math.max(MIN_TRANSLATION_RETRY_LIMIT, Math.round(value)));
