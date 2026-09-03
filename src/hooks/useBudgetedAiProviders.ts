import { useCallback } from 'react';
import {
  generateContent as requestContent,
  generateContentStream as requestContentStream,
  type GenerateContentOptions,
  type GenerateStreamOptions,
} from '../lib/ai-providers';
import {
  DEFAULT_REQUEST_MAX_OUTPUT_TOKENS,
  estimateRequestBudget,
} from '../lib/translation-budget';
import { useTranslationUsage } from './useTranslationUsage';

type Options = {
  googleApiKey?: string;
  openaiApiKey?: string;
  budgetUsd: number;
  getSignal: () => AbortSignal | undefined;
};

export function useBudgetedAiProviders({
  googleApiKey,
  openaiApiKey,
  budgetUsd,
  getSignal,
}: Options) {
  const usage = useTranslationUsage();
  const credentials = { googleApiKey, openaiApiKey };

  const prepare = useCallback(<T extends GenerateContentOptions | GenerateStreamOptions>(options: T): T => {
    const prepared = {
      ...options,
      maxOutputTokens: options.maxOutputTokens ?? DEFAULT_REQUEST_MAX_OUTPUT_TOKENS,
      signal: options.signal ?? getSignal(),
    };
    usage.assertCanReserve(estimateRequestBudget(prepared), prepared.model, budgetUsd);
    return prepared;
  }, [budgetUsd, getSignal, usage.assertCanReserve]);

  const generateContent = useCallback((options: GenerateContentOptions) =>
    requestContent(prepare(options), credentials), [credentials.googleApiKey, credentials.openaiApiKey, prepare]);

  const generateContentStream = useCallback((options: GenerateStreamOptions) => {
    const prepared = prepare(options);
    return requestContentStream(prepared, credentials);
  }, [credentials.googleApiKey, credentials.openaiApiKey, prepare]);

  return { ...usage, generateContent, generateContentStream };
}
