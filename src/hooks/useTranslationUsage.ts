import { useCallback, useRef, useState } from 'react';
import type { UsageMetadata } from '../lib/ai-providers';
import { getModelConfig, USD_TO_TWD } from '../lib/models';
import {
  TranslationUsageMeter,
  type RequestBudgetEstimate,
  type TranslationUsageSnapshot,
} from '../lib/translation-budget';

const EMPTY_USAGE = {
  inputTokens: 0,
  cachedInputTokens: 0,
  cacheWriteInputTokens: 0,
  outputTokens: 0,
  reasoningTokens: 0,
};
const EMPTY_COST = { inputUsd: 0, outputUsd: 0, totalUsd: 0, totalTwd: 0 };

export const useTranslationUsage = () => {
  const meterRef = useRef(new TranslationUsageMeter());
  const [usageTotals, setUsageTotals] = useState(EMPTY_USAGE);
  const [actualCost, setActualCost] = useState(EMPTY_COST);

  const resetUsage = useCallback(() => {
    meterRef.current.reset();
    setUsageTotals(EMPTY_USAGE);
    setActualCost(EMPTY_COST);
  }, []);

  const restoreUsage = useCallback((snapshot?: Partial<TranslationUsageSnapshot> | null) => {
    const restored = meterRef.current.restore(snapshot);
    const totals = meterRef.current.totals();
    setUsageTotals(totals);
    const totalUsd = restored.inputUsd + restored.outputUsd;
    setActualCost({
      inputUsd: restored.inputUsd,
      outputUsd: restored.outputUsd,
      totalUsd,
      totalTwd: totalUsd * USD_TO_TWD,
    });
  }, []);

  const recordUsage = useCallback((usage: UsageMetadata | undefined, modelId: string, limitUsd: number) => {
    const model = getModelConfig(modelId);
    const totals = meterRef.current.add(usage, model);
    setUsageTotals(totals);
    const cost = meterRef.current.cost(model);
    setActualCost(cost);
    meterRef.current.enforce(model, limitUsd);
    return cost;
  }, []);

  const assertCanReserve = useCallback((estimate: RequestBudgetEstimate, modelId: string, limitUsd: number) =>
    meterRef.current.assertCanReserve(getModelConfig(modelId), estimate, limitUsd), []);

  const getUsageSnapshot = useCallback(() => meterRef.current.snapshot(), []);

  return {
    ...usageTotals,
    actualCost,
    resetUsage,
    restoreUsage,
    recordUsage,
    assertCanReserve,
    getUsageSnapshot,
  };
};
