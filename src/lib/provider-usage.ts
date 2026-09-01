export type UsageMetadata = {
  promptTokenCount?: number;
  cachedPromptTokenCount?: number;
  cacheWriteTokenCount?: number;
  candidatesTokenCount?: number;
  reasoningTokenCount?: number;
  billedOutputTokenCount?: number;
};

type GoogleUsageMetadata = {
  promptTokenCount?: number;
  cachedContentTokenCount?: number;
  candidatesTokenCount?: number;
  thoughtsTokenCount?: number;
  toolUsePromptTokenCount?: number;
};

type OpenAIUsageMetadata = {
  prompt_tokens?: number;
  completion_tokens?: number;
  prompt_tokens_details?: { cached_tokens?: number; cache_write_tokens?: number };
  completion_tokens_details?: { reasoning_tokens?: number };
};

export const normalizeGoogleUsage = (usage?: GoogleUsageMetadata): UsageMetadata | undefined => {
  if (!usage) return undefined;
  const promptTokenCount = (usage.promptTokenCount ?? 0) + (usage.toolUsePromptTokenCount ?? 0);
  const candidatesTokenCount = usage.candidatesTokenCount ?? 0;
  const reasoningTokenCount = usage.thoughtsTokenCount ?? 0;
  return {
    promptTokenCount,
    cachedPromptTokenCount: usage.cachedContentTokenCount ?? 0,
    candidatesTokenCount,
    reasoningTokenCount,
    billedOutputTokenCount: candidatesTokenCount + reasoningTokenCount,
  };
};

export const normalizeOpenAIUsage = (usage?: OpenAIUsageMetadata | null): UsageMetadata | undefined => {
  if (!usage) return undefined;
  return {
    promptTokenCount: usage.prompt_tokens ?? 0,
    cachedPromptTokenCount: usage.prompt_tokens_details?.cached_tokens ?? 0,
    cacheWriteTokenCount: usage.prompt_tokens_details?.cache_write_tokens ?? 0,
    candidatesTokenCount: usage.completion_tokens ?? 0,
    reasoningTokenCount: usage.completion_tokens_details?.reasoning_tokens ?? 0,
    // OpenAI completion_tokens already includes reasoning tokens.
    billedOutputTokenCount: usage.completion_tokens ?? 0,
  };
};

export const getUsageDelta = (current?: UsageMetadata, previous?: UsageMetadata): UsageMetadata | undefined => {
  if (!current) return undefined;
  const delta = (key: keyof UsageMetadata) => Math.max(0, (current[key] ?? 0) - (previous?.[key] ?? 0));
  return {
    promptTokenCount: delta('promptTokenCount'),
    cachedPromptTokenCount: delta('cachedPromptTokenCount'),
    cacheWriteTokenCount: delta('cacheWriteTokenCount'),
    candidatesTokenCount: delta('candidatesTokenCount'),
    reasoningTokenCount: delta('reasoningTokenCount'),
    billedOutputTokenCount: delta('billedOutputTokenCount'),
  };
};
