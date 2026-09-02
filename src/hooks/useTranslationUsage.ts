import { useCallback, useRef, useState } from 'react';
import type { UsageMetadata } from '../lib/ai-providers';
import { getModelConfig } from '../lib/models';
import { TranslationUsageMeter } from '../lib/translation-budget';

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

  const recordUsage = useCallback((usage: UsageMetadata | undefined, modelId: string, limitUsd: number) => {
    const model = getModelConfig(modelId);
    const totals = meterRef.current.add(usage, model);
    setUsageTotals(totals);
    const cost = meterRef.current.enforce(model, limitUsd);
    setActualCost(cost);
    return cost;
  }, []);

  return { ...usageTotals, actualCost, resetUsage, recordUsage };
};
