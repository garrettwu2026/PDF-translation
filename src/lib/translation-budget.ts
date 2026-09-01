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
  outputTokens = 0;

  reset() {
    this.inputTokens = 0;
    this.outputTokens = 0;
  }

  add(usage?: UsageMetadata) {
    this.inputTokens += Math.max(0, usage?.promptTokenCount ?? 0);
    this.outputTokens += Math.max(0, usage?.candidatesTokenCount ?? 0);
    return { inputTokens: this.inputTokens, outputTokens: this.outputTokens };
  }

  cost(model: ModelConfig) {
    return calculateTokenCost(model, this.inputTokens, this.outputTokens);
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
