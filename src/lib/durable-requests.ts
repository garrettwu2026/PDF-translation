import type { ContentResult, GenerateContentOptions, GenerateStreamOptions } from './ai-providers.ts';
import type { SavedRequest } from './db.ts';
import type { TranslationUsageSnapshot } from './translation-budget.ts';
import { assertCompleteOutput, contentDigest } from './request-integrity.ts';
import { DEFAULT_REQUEST_MAX_OUTPUT_TOKENS } from './translation-budget.ts';
import { throwIfAborted } from './abort.ts';

type Dependencies = {
  documentId: string;
  get: (id: string) => Promise<SavedRequest | undefined>;
  save: (entry: SavedRequest, usage?: TranslationUsageSnapshot) => Promise<void>;
  charge: (result: ContentResult, options: GenerateContentOptions) => TranslationUsageSnapshot;
  enforce: (options: GenerateContentOptions) => void;
  reserve: (options: GenerateContentOptions) => void;
  generate: (options: GenerateContentOptions) => Promise<ContentResult>;
  stream: (options: GenerateStreamOptions) => AsyncGenerator<ContentResult>;
};

/** No keys or prompts are persisted. The exact request + workflow version is hashed.
 * Completed stage responses are local document data, not a provider prompt cache. */
export async function savedRequestKey(documentId: string, options: GenerateContentOptions, stream: boolean) {
  const { signal, costStage, ...request } = {...options, maxOutputTokens: options.maxOutputTokens ?? DEFAULT_REQUEST_MAX_OUTPUT_TOKENS};
  return documentId + ':' + await contentDigest(JSON.stringify({version: 1, stream, request}));
}
export function durableRequests(deps: Dependencies) {
  const begin = async (options: GenerateContentOptions, stream: boolean) => {
    if (options.signal) throwIfAborted(options.signal);
    const id = await savedRequestKey(deps.documentId, options, stream);
    const previous = await deps.get(id);
    if (previous?.response && (previous.state === 'complete' || previous.state === 'unknown')) {
      assertCompleteOutput(previous.response);
      return { id, cached: previous.response };
    }
    deps.reserve(options);
    // Preserve an unresolved attempt as a separate ledger entry when retrying.
    if (previous?.state === 'pending' || previous?.state === 'unknown') {
      await deps.save({ ...previous, id: id + ':unknown:' + crypto.randomUUID(), state: 'unknown' });
    }
    await deps.save({ id, documentId: deps.documentId, state: 'pending' });
    return { id, cached: undefined };
  };
  const finish = async (id: string, options: GenerateContentOptions, result: ContentResult) => {
    const snapshot = deps.charge(result, options);
    const response = { text: result.text, finishReason: result.finishReason };
    let complete = true;
    try { assertCompleteOutput(response); } catch { complete = false; }
    await deps.save({ id, documentId: deps.documentId,
      state: result.usageMetadata ? (complete ? 'complete' : 'failed') : 'unknown',
      ...(complete ? { response } : {}) }, snapshot);
    deps.enforce(options);
    assertCompleteOutput(response);
    return response; // Usage was already recorded; cached replay must never charge again.
  };
  return {
    async generate(options: GenerateContentOptions): Promise<ContentResult> {
      const { id, cached } = await begin(options, false);
      if (cached) return cached;
      const result = await deps.generate(options); // On failure, pending deliberately remains uncertain.
      return finish(id, options, result);
    },
    async *stream(options: GenerateStreamOptions): AsyncGenerator<ContentResult> {
      const { id, cached } = await begin(options, true);
      if (cached) { yield cached; return; }
      let text = '', finishReason: string | undefined, hasUsage = false;
      for await (const part of deps.stream(options)) {
        text += part.text;
        finishReason = part.finishReason ?? finishReason;
        if (part.usageMetadata) {
          hasUsage = true;
          const snapshot = deps.charge(part, options);
          await deps.save({ id, documentId: deps.documentId, state: 'pending' }, snapshot);
          if (!finishReason) deps.enforce(options);
          // Enforce after the final result is saved when usage arrives at stream end.
        }
        yield { text: part.text, finishReason: part.finishReason };
      }
      const response = { text, finishReason };
      let complete = true;
      try { assertCompleteOutput(response); } catch { complete = false; }
      await deps.save({ id, documentId: deps.documentId,
        state: hasUsage ? (complete ? 'complete' : 'failed') : 'unknown',
        ...(complete ? { response } : {}) });
      deps.enforce(options);
      assertCompleteOutput(response);
    },
  };
}
