import { useCallback, useRef } from 'react';
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
import { durableRequests } from '../lib/durable-requests';
import { getSavedRequest, saveRequest } from '../lib/db';

type Options = {
  googleApiKey?: string;
  openaiApiKey?: string;
  budgetUsd: number;
  getSignal: () => AbortSignal | undefined;
  getDocumentId: () => string | null;
};

export function useBudgetedAiProviders({
  googleApiKey,
  openaiApiKey,
  budgetUsd,
  getSignal,
  getDocumentId,
}: Options) {
  const usage = useTranslationUsage();
  const pending = useRef(new Set<Promise<unknown>>());
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

  const client = () => {
    const documentId = getDocumentId();
    if (!documentId) throw new Error('尚未建立安全的翻譯存檔，已停止 API 請求。');
    return durableRequests({
      documentId, get: getSavedRequest, save: saveRequest,
      charge: (result, options) => {
        usage.recordUsage(result.usageMetadata, options.model, 0, options.costStage ?? 'legacy');
        return usage.getUsageSnapshot();
      },
      enforce: options => { usage.enforceBudget(options.model, budgetUsd); },
      reserve: options => { prepare(options); },
      generate: options => requestContent(options, credentials),
      stream: options => requestContentStream(options, credentials),
    });
  };
  const completeOptions = <T extends GenerateContentOptions | GenerateStreamOptions>(options: T) => ({
    ...options, maxOutputTokens: options.maxOutputTokens ?? DEFAULT_REQUEST_MAX_OUTPUT_TOKENS,
    signal: options.signal ?? getSignal(),
  });
  const generateContent = (options: GenerateContentOptions) => {
    const request = client().generate(completeOptions(options));
    pending.current.add(request);
    void request.finally(() => pending.current.delete(request)).catch(() => {});
    return request;
  };
  const generateContentStream = async function* (options: GenerateStreamOptions) {
    let finish!: () => void;
    const request = new Promise<void>(resolve => { finish = resolve; });
    pending.current.add(request);
    try { yield* client().stream(completeOptions(options)); }
    finally { finish(); pending.current.delete(request); }
  };
  const flushRequests = async () => { await Promise.allSettled([...pending.current]); };

  return { ...usage, generateContent, generateContentStream, flushRequests };
}
