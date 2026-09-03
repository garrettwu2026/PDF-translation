import { useCallback, useEffect, useRef, useState } from 'react';
import { estimateTextTokens } from '../lib/text';
import { estimatePdfSourceTokens } from '../lib/pdf-text-extraction';
import { isAbortError } from '../lib/abort';
import { reportWarning } from '../lib/diagnostics';

/** Cancellable, local-only upload estimate; later confirmed Markdown can replace it. */
export function useSourceTokenEstimate(file: File | null, base64Data: string | null, onPages: (total: number) => void) {
  const [tokenCount, setTokenCount] = useState<number | null>(null);
  const [isCalculating, setIsCalculating] = useState(false);
  const controllerRef = useRef<AbortController | null>(null);

  const cancelEstimate = useCallback(() => {
    controllerRef.current?.abort();
    controllerRef.current = null;
    setIsCalculating(false);
  }, []);

  useEffect(() => {
    if (!file || !base64Data) return;
    const controller = new AbortController();
    controllerRef.current?.abort();
    controllerRef.current = controller;
    const isCurrent = () => controllerRef.current === controller && !controller.signal.aborted;
    setIsCalculating(true);
    void (async () => {
      try {
        const estimate = file.name.toLowerCase().endsWith('.md')
          ? estimateTextTokens(await file.text())
          : await estimatePdfSourceTokens(file, total => {
            if (isCurrent()) onPages(total);
          }, controller.signal);
        if (isCurrent()) setTokenCount(estimate);
      } catch (error) {
        if (isCurrent() && !isAbortError(error)) {
          reportWarning('source_token_estimate_unavailable');
          setTokenCount(null);
        }
      } finally {
        if (isCurrent()) {
          controllerRef.current = null;
          setIsCalculating(false);
        }
      }
    })();
    return () => {
      controller.abort();
      if (controllerRef.current === controller) controllerRef.current = null;
    };
  }, [file, base64Data, onPages]);

  return { tokenCount, setTokenCount, isCalculating, cancelEstimate };
}
