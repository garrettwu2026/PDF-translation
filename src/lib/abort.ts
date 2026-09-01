export const createAbortError = () => new DOMException('Operation aborted', 'AbortError');

export const throwIfAborted = (signal?: AbortSignal) => {
  if (signal?.aborted) throw signal.reason ?? createAbortError();
};

export const abortableDelay = (milliseconds: number, signal?: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    throwIfAborted(signal);
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, milliseconds);
    const onAbort = () => {
      clearTimeout(timer);
      reject(signal?.reason ?? createAbortError());
    };
    signal?.addEventListener('abort', onAbort, { once: true });
  });

export const isAbortError = (error: unknown) =>
  (error instanceof DOMException && error.name === 'AbortError')
  || (error instanceof Error && error.name === 'AbortError');
