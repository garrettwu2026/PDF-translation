import { abortableDelay, isAbortError, throwIfAborted } from './abort.ts';
import { TranslationBudgetExceededError } from './translation-budget.ts';
import { buildExtractionPrompt, extractionSystemInstruction } from './translation-prompts.ts';
import type { ContentResult, GenerateContentOptions, UsageMetadata } from './ai-providers.ts';

export type ExtractionWorker = Pick<Worker, 'addEventListener' | 'removeEventListener' | 'postMessage'>;
type Options = {
  worker: ExtractionWorker; fileBuffer: ArrayBuffer; requestId: string;
  model: string; retryLimit: number; signal: AbortSignal; isCancelled: () => boolean;
  generate: (options: GenerateContentOptions) => Promise<ContentResult>;
  onUsage: (usage: UsageMetadata) => void;
  onTotal: (total: number) => void;
  onProgress: (progress: { completed: number; total: number; markdown: string }) => void;
  onWarning: (code: string, metadata: Record<string, number>) => void;
};

/** Request-scoped PDF extraction. The caller owns document state and persistence.
 * Keep the existing batch classification, output ceiling, retry count and ACK order.
 */
export function extractTranslationPdf(options: Options): Promise<string> {
  const { worker, requestId, signal } = options;
  const results: string[] = [];
  let completed = 0;
  let total = 0;
  return new Promise((resolve, reject) => {
    let settled = false;
    const cancelWorker = () => worker.postMessage({ type: 'CANCEL_TASK', payload: { requestId } });
    const cleanup = () => {
      worker.removeEventListener('message', handleMessage);
      signal.removeEventListener('abort', onAbort);
    };
    const fail = (error: unknown) => {
      if (settled) return;
      settled = true;
      cleanup();
      try {
        cancelWorker();
      } catch {
        // A terminated worker must not prevent cleanup or hide the original error.
      }
      reject(error);
    };
    const onAbort = () => fail(signal.reason ?? new DOMException('Operation aborted', 'AbortError'));
    const handleMessage = async (event: MessageEvent) => {
      const { type, payload } = event.data;
      if (settled || payload?.requestId !== requestId) return;
      try {
        if (type === 'TOTAL_CHUNKS') {
          total = payload.totalChunks;
          results.length = total;
          options.onTotal(total);
        } else if (type === 'EXTRACTION_CHUNK') {
          const { index, base64, rawText } = payload as { index: number; base64?: string; rawText: string };
          if (options.isCancelled()) throw new Error('PDF 處理已取消');
          const hasRawText = rawText.replace(/\s+/g, '').length > 10;
          let success = false;
          let retries = 0;
          while (!success && retries < options.retryLimit) {
            try {
              throwIfAborted(signal);
              const response = await options.generate({
                model: options.model,
                systemInstruction: extractionSystemInstruction(hasRawText),
                promptText: buildExtractionPrompt(rawText, hasRawText),
                base64Pdf: hasRawText ? undefined : base64,
                temperature: 0.1, maxOutputTokens: 8_192, signal,
              });
              if (settled) return;
              if (options.isCancelled()) throw new Error('PDF 處理已取消');
              if (response.usageMetadata) options.onUsage(response.usageMetadata);
              results[index] = response.text || '';
              success = true;
            } catch (error) {
              if (error instanceof TranslationBudgetExceededError || isAbortError(error)) throw error;
              options.onWarning('pdf_extraction_chunk_failed', { chunk: index + 1, attempt: retries + 1 });
              retries++;
              if (retries >= options.retryLimit) throw error;
              await abortableDelay(1000 * retries, signal);
            }
          }
          completed++;
          options.onProgress({ completed, total, markdown: results.filter(r => r !== undefined).join('\n\n') });
          worker.postMessage({ type: 'EXTRACTION_CHUNK_ACK', payload: { requestId, index } });
          if (total > 0 && completed === total) {
            settled = true;
            cleanup();
            resolve(results.join('\n\n').trim());
          }
        } else if (type === 'ERROR') {
          fail(new Error(payload.message));
        } else if (type === 'TASK_CANCELLED') {
          fail(new Error('PDF 處理已取消'));
        }
      } catch (error) {
        fail(error);
      }
    };
    try {
      throwIfAborted(signal);
      signal.addEventListener('abort', onAbort, { once: true });
      worker.addEventListener('message', handleMessage);
      worker.postMessage({ type: 'GET_EXTRACTION_CHUNKS', payload: { requestId, fileBuffer: options.fileBuffer } }, [options.fileBuffer]);
    } catch (error) {
      fail(error);
    }
  });
}
