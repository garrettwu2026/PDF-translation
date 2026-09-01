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

export const useTranslationUsage = () => {
  const meterRef = useRef(new TranslationUsageMeter());
  const [usageTotals, setUsageTotals] = useState(EMPTY_USAGE);

  const resetUsage = useCallback(() => {
    meterRef.current.reset();
    setUsageTotals(EMPTY_USAGE);
  }, []);

  const recordUsage = useCallback((usage: UsageMetadata | undefined, modelId: string, limitUsd: number) => {
    const totals = meterRef.current.add(usage);
    setUsageTotals(totals);
    return meterRef.current.enforce(getModelConfig(modelId), limitUsd);
  }, []);

  return { ...usageTotals, resetUsage, recordUsage };
};
