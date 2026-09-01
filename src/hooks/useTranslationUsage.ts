import { useCallback, useRef, useState } from 'react';
import type { UsageMetadata } from '../lib/ai-providers';
import { getModelConfig } from '../lib/models';
import { TranslationUsageMeter } from '../lib/translation-budget';

export const useTranslationUsage = () => {
  const meterRef = useRef(new TranslationUsageMeter());
  const [actualInputTokens, setActualInputTokens] = useState(0);
  const [actualOutputTokens, setActualOutputTokens] = useState(0);

  const resetUsage = useCallback(() => {
    meterRef.current.reset();
    setActualInputTokens(0);
    setActualOutputTokens(0);
  }, []);

  const recordUsage = useCallback((usage: UsageMetadata | undefined, modelId: string, limitUsd: number) => {
    const totals = meterRef.current.add(usage);
    setActualInputTokens(totals.inputTokens);
    setActualOutputTokens(totals.outputTokens);
    return meterRef.current.enforce(getModelConfig(modelId), limitUsd);
  }, []);

  return { actualInputTokens, actualOutputTokens, resetUsage, recordUsage };
};
