import type { UsageMetadata } from './ai-providers';
import { calculateTokenCost, type ModelConfig, USD_TO_TWD } from './models.ts';
import { estimateTextTokens } from './text.ts';

export const DEFAULT_TRANSLATION_BUDGET_USD = 5;
export const DEFAULT_TRANSLATION_RETRY_LIMIT = 3;
export const MIN_TRANSLATION_RETRY_LIMIT = 1;
export const MAX_TRANSLATION_RETRY_LIMIT = 6;
export const DEFAULT_REQUEST_MAX_OUTPUT_TOKENS = 4_096;

// Leave room for Chinese expansion, sentence markers and structured metadata.
export const estimateTranslationOutputLimit = (source: string) => {
  const estimate = Math.max(DEFAULT_REQUEST_MAX_OUTPUT_TOKENS, estimateTextTokens(source) * 3 + 2_048);
  if (estimate > 32_768) {
    throw new Error('單段內容太長，請開啟分段翻譯；若已開啟，請先拆分過長的表格或程式碼區塊。');
  }
  return Math.ceil(estimate);
};

export type TranslationUsageSnapshot = {
  inputTokens: number;
  cachedInputTokens: number;
  cacheWriteInputTokens: number;
  outputTokens: number;
  reasoningTokens: number;
  inputUsd: number;
  outputUsd: number;
};

export type RequestBudgetEstimate = {
  inputTokens: number;
  outputTokens: number;
};

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

export class TranslationBudgetReservationError extends TranslationBudgetExceededError {
  readonly currentUsd: number;
  readonly reservedUsd: number;

  constructor(currentUsd: number, reservedUsd: number, limitUsd: number) {
    super(currentUsd + reservedUsd, limitUsd);
    this.name = 'TranslationBudgetReservationError';
    this.currentUsd = currentUsd;
    this.reservedUsd = reservedUsd;
    this.message = `剩餘預算不足以開始下一次請求（已花費 $${currentUsd.toFixed(4)}，下一次估計預留 $${reservedUsd.toFixed(4)}，上限 $${limitUsd.toFixed(2)} USD）`;
  }
}

const finiteNonNegative = (value: unknown) => {
  const number = typeof value === 'number' && Number.isFinite(value) ? value : 0;
  return Math.max(0, number);
};

export const normalizeUsageSnapshot = (snapshot?: Partial<TranslationUsageSnapshot> | null): TranslationUsageSnapshot => ({
  inputTokens: finiteNonNegative(snapshot?.inputTokens),
  cachedInputTokens: finiteNonNegative(snapshot?.cachedInputTokens),
  cacheWriteInputTokens: finiteNonNegative(snapshot?.cacheWriteInputTokens),
  outputTokens: finiteNonNegative(snapshot?.outputTokens),
  reasoningTokens: finiteNonNegative(snapshot?.reasoningTokens),
  inputUsd: finiteNonNegative(snapshot?.inputUsd),
  outputUsd: finiteNonNegative(snapshot?.outputUsd),
});

export const estimateRequestBudget = (input: {
  systemInstruction?: string;
  promptText?: string;
  base64Pdf?: string;
  maxOutputTokens?: number;
}): RequestBudgetEstimate => ({
  inputTokens: estimateTextTokens(`${input.systemInstruction ?? ''}\n${input.promptText ?? ''}`)
    + (input.base64Pdf ? 4_096 : 0),
  outputTokens: Math.max(1, Math.round(input.maxOutputTokens ?? DEFAULT_REQUEST_MAX_OUTPUT_TOKENS)),
});

export class TranslationUsageMeter {
  inputTokens = 0;
  cachedInputTokens = 0;
  cacheWriteInputTokens = 0;
  outputTokens = 0;
  reasoningTokens = 0;
  private itemizedInputUsd = 0;
  private itemizedOutputUsd = 0;
  private hasItemizedCost = false;

  restore(snapshot?: Partial<TranslationUsageSnapshot> | null) {
    const value = normalizeUsageSnapshot(snapshot);
    this.inputTokens = value.inputTokens;
    this.cachedInputTokens = Math.min(value.inputTokens, value.cachedInputTokens);
    this.cacheWriteInputTokens = Math.min(
      value.inputTokens - this.cachedInputTokens,
      value.cacheWriteInputTokens,
    );
    this.outputTokens = value.outputTokens;
    this.reasoningTokens = value.reasoningTokens;
    this.itemizedInputUsd = value.inputUsd;
    this.itemizedOutputUsd = value.outputUsd;
    this.hasItemizedCost = value.inputUsd > 0 || value.outputUsd > 0;
    return this.snapshot();
  }

  reset() {
    this.inputTokens = 0;
    this.cachedInputTokens = 0;
    this.cacheWriteInputTokens = 0;
    this.outputTokens = 0;
    this.reasoningTokens = 0;
    this.itemizedInputUsd = 0;
    this.itemizedOutputUsd = 0;
    this.hasItemizedCost = false;
  }

  add(usage?: UsageMetadata, model?: ModelConfig) {
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
    if (model) {
      const incrementalCost = calculateTokenCost(model, {
        inputTokens,
        cachedInputTokens,
        cacheWriteInputTokens,
        outputTokens: Math.max(0, usage?.billedOutputTokenCount ?? usage?.candidatesTokenCount ?? 0),
      });
      this.itemizedInputUsd += incrementalCost.inputUsd;
      this.itemizedOutputUsd += incrementalCost.outputUsd;
      this.hasItemizedCost = true;
    }
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

  snapshot(): TranslationUsageSnapshot {
    return {
      ...this.totals(),
      inputUsd: this.itemizedInputUsd,
      outputUsd: this.itemizedOutputUsd,
    };
  }

  cost(model: ModelConfig) {
    const fallback = calculateTokenCost(model, this.totals());
    if (!this.hasItemizedCost) return fallback;
    const totalUsd = this.itemizedInputUsd + this.itemizedOutputUsd;
    return {
      ...fallback,
      inputUsd: this.itemizedInputUsd,
      outputUsd: this.itemizedOutputUsd,
      totalUsd,
      totalTwd: totalUsd * USD_TO_TWD,
    };
  }

  enforce(model: ModelConfig, limitUsd: number) {
    const cost = this.cost(model);
    if (limitUsd > 0 && cost.totalUsd > limitUsd) {
      throw new TranslationBudgetExceededError(cost.totalUsd, limitUsd);
    }
    return cost;
  }

  assertCanReserve(model: ModelConfig, estimate: RequestBudgetEstimate, limitUsd: number) {
    const current = this.cost(model);
    const reserved = calculateTokenCost(model, estimate);
    if (limitUsd > 0 && current.totalUsd + reserved.totalUsd > limitUsd) {
      throw new TranslationBudgetReservationError(current.totalUsd, reserved.totalUsd, limitUsd);
    }
    return { currentUsd: current.totalUsd, reservedUsd: reserved.totalUsd };
  }
}

export const clampRetryLimit = (value: number) =>
  Math.min(MAX_TRANSLATION_RETRY_LIMIT, Math.max(MIN_TRANSLATION_RETRY_LIMIT, Math.round(value)));
