import { abortableDelay, isAbortError, throwIfAborted } from './abort.ts';
import { TranslationBudgetExceededError } from './translation-budget.ts';
import { buildExtractionPrompt, extractionSystemInstruction } from './translation-prompts.ts';
import type { ContentResult, GenerateContentOptions, UsageMetadata } from './ai-providers.ts';
import { assertCompleteOutput, IncompleteOutputError } from './request-integrity.ts';
import { cleanPdfPages } from './pdf-layout.ts';
import { HistoryStorageError } from './db.ts';

export type ExtractionWorker = Pick<Worker, 'addEventListener' | 'removeEventListener' | 'postMessage'>;
type Options = {
  worker: ExtractionWorker; fileBuffer: ArrayBuffer; requestId: string;
  model: string; retryLimit: number; signal: AbortSignal; isCancelled: () => boolean;
  generate: (options: GenerateContentOptions) => Promise<ContentResult>;
  onUsage: (usage: UsageMetadata) => void;
  onTotal: (total: number) => void;
  onProgress: (progress: { completed: number; total: number; markdown: string }) => void | Promise<void>;
  onWarning: (code: string, metadata: Record<string, number>) => void;
};

/** Request-scoped, page-granular extraction. Native text is local; only sparse
 * pages use OCR. A page is acknowledged only after validated progress is durable.
 */
export function extractTranslationPdf(options: Options): Promise<string> {
  const { worker, requestId, signal } = options;
  const results: string[] = [];
  let completed = 0;
  let total = 0;
  return new Promise((resolve, reject) => {
    let settled = false;
    let processing = false;
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
          if (total || !Number.isInteger(payload.totalChunks) || payload.totalChunks < 1) {
            throw new Error('PDF 頁數資訊不正確。');
          }
          total = payload.totalChunks;
          results.length = total;
          options.onTotal(total);
        } else if (type === 'EXTRACTION_CHUNK') {
          const { index, base64, rawText } = payload as { index: number; base64?: string; rawText: string };
          if (processing || index !== completed || index >= total) throw new Error('PDF 頁面順序或覆蓋不完整。');
          processing = true;
          if (options.isCancelled()) throw new Error('PDF 處理已取消');
          const hasRawText = rawText.replace(/\s+/g, '').length > 10;
          let success = hasRawText;
          if (hasRawText) results[index] = rawText;
          if (!hasRawText && !base64) throw new Error('掃描頁缺少 OCR 資料。');
          let retries = 0;
          while (!success && retries < options.retryLimit) {
            try {
              throwIfAborted(signal);
              const response = await options.generate({
                model: options.model,
                costStage: 'extraction', cacheScope: 'page:' + index,
                systemInstruction: extractionSystemInstruction(hasRawText),
                promptText: buildExtractionPrompt(rawText, hasRawText) + '\n若此頁確實沒有任何可讀文字，僅輸出 <EMPTY_PAGE>；不可省略可見文字。',
                base64Pdf: hasRawText ? undefined : base64,
                temperature: 0.1, maxOutputTokens: 8_192, signal,
              });
              if (settled) return;
              if (options.isCancelled()) throw new Error('PDF 處理已取消');
              if (response.usageMetadata) options.onUsage(response.usageMetadata);
              assertCompleteOutput(response);
              results[index] = response.text.trim() === '<EMPTY_PAGE>' ? '' : response.text;
              success = true;
            } catch (error) {
              if (error instanceof TranslationBudgetExceededError || error instanceof HistoryStorageError || isAbortError(error)) throw error;
              options.onWarning('pdf_extraction_chunk_failed', { chunk: index + 1, attempt: retries + 1 });
              retries++;
              if (retries >= options.retryLimit) throw error;
              await abortableDelay(1000 * retries, signal);
            }
          }
          completed++;
          await options.onProgress({ completed, total, markdown: results.filter(r => r !== undefined).join('\n\n') });
          if (settled) return;
          processing = false;
          worker.postMessage({ type: 'EXTRACTION_CHUNK_ACK', payload: { requestId, index } });
          if (total > 0 && completed === total) {
            settled = true;
            cleanup();
            const markdown = cleanPdfPages(results).trim();
            if (!markdown) { reject(new IncompleteOutputError('文件沒有可翻譯文字；請確認掃描內容。')); return; }
            resolve(markdown);
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
