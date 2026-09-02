export type ProviderErrorCategory = 'auth' | 'rate_limit' | 'transient' | 'invalid_request' | 'unknown';

export type ClassifiedProviderError = {
  category: ProviderErrorCategory;
  status: number;
  retryAfterMs?: number;
  message: string;
};

export class ProviderRequestError extends Error {
  category: ProviderErrorCategory;
  status: number;
  retryAfterMs?: number;

  constructor(classified: ClassifiedProviderError, cause?: unknown) {
    super(classified.message, { cause });
    this.name = 'ProviderRequestError';
    this.category = classified.category;
    this.status = classified.status;
    this.retryAfterMs = classified.retryAfterMs;
  }
}

const getStatus = (error: unknown) => {
  if (!error || typeof error !== 'object') return 0;
  const value = 'status' in error ? Number(error.status) : 'statusCode' in error ? Number(error.statusCode) : 0;
  return Number.isFinite(value) ? value : 0;
};

const getHeader = (error: unknown, name: string) => {
  if (!error || typeof error !== 'object' || !('headers' in error) || !error.headers) return null;
  const headers = error.headers as Headers | Record<string, string>;
  if (typeof (headers as Headers).get === 'function') return (headers as Headers).get(name);
  const record = headers as Record<string, string>;
  return record[name] ?? record[name.toLowerCase()] ?? null;
};

const parseRetryAfter = (value: string | null) => {
  if (!value) return undefined;
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) return Math.min(seconds * 1000, 120_000);
  const timestamp = Date.parse(value);
  if (Number.isNaN(timestamp)) return undefined;
  return Math.min(Math.max(0, timestamp - Date.now()), 120_000);
};

const safeMessage = (error: unknown) => {
  const raw = error instanceof Error ? error.message : String(error);
  return raw.replace(/(?:sk-[A-Za-z0-9_-]{10,}|AIza[A-Za-z0-9_-]{10,})/g, '[API key hidden]').slice(0, 600);
};

export function classifyProviderError(error: unknown): ClassifiedProviderError {
  if (error instanceof ProviderRequestError) {
    return {
      category: error.category,
      status: error.status,
      retryAfterMs: error.retryAfterMs,
      message: error.message,
    };
  }
  const status = getStatus(error);
  const message = safeMessage(error);
  const signature = `${error instanceof Error ? error.name : ''} ${message}`.toLowerCase();
  const retryAfterMs = parseRetryAfter(getHeader(error, 'retry-after'));

  if (status === 429 || /rate.?limit|quota exceeded|resource exhausted/.test(signature)) {
    return { category: 'rate_limit', status, message, retryAfterMs };
  }
  if (status === 401 || status === 403 || /authentication|permission denied|invalid api key|api key.*invalid/.test(signature)) {
    return { category: 'auth', status, message };
  }
  if ([408, 409, 425, 500, 502, 503, 504].includes(status) || status >= 500
    || /connection|timeout|timed out|network|fetch failed|econnreset|socket hang up/.test(signature)) {
    return { category: 'transient', status, message, retryAfterMs };
  }
  if ([400, 404, 405, 413, 415, 422].includes(status)) {
    return { category: 'invalid_request', status, message };
  }
  return { category: 'unknown', status, message };
}

export const normalizeProviderError = (error: unknown) =>
  error instanceof ProviderRequestError ? error : new ProviderRequestError(classifyProviderError(error), error);

export const isRetryableProviderError = (error: ClassifiedProviderError) =>
  error.category === 'rate_limit' || error.category === 'transient';

export function formatProviderErrorForUser(error: ClassifiedProviderError) {
  if (error.category === 'auth') return `API 驗證失敗，請檢查 API Key 與模型權限。${error.message ? ` (${error.message})` : ''}`;
  if (error.category === 'rate_limit') return `API 用量或速率已達限制。${error.message ? ` (${error.message})` : ''}`;
  if (error.category === 'transient') return `API 或網路暫時無法使用。${error.message ? ` (${error.message})` : ''}`;
  if (error.category === 'invalid_request') return `API 不接受目前的請求設定。${error.message ? ` (${error.message})` : ''}`;
  return `API 請求失敗。${error.message ? ` (${error.message})` : ''}`;
}

export function getRetryDelayMs(error: ClassifiedProviderError, attempt: number) {
  if (error.retryAfterMs !== undefined) return error.retryAfterMs;
  const base = error.category === 'rate_limit' ? 5_000 : 1_000;
  return Math.min(30_000, base * 2 ** attempt) + Math.floor(Math.random() * 500);
}
