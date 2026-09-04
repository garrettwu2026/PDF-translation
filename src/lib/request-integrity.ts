import type { ContentResult } from './ai-providers.ts';

export class IncompleteOutputError extends Error {
  constructor(message = '模型輸出為空白或未完整結束，已保留進度，請重試受影響的部分。') {
    super(message);
    this.name = 'IncompleteOutputError';
  }
}

export function assertCompleteOutput(result: ContentResult) {
  if (!result.text.trim() || !['stop', 'STOP'].includes(result.finishReason ?? '')) {
    throw new IncompleteOutputError();
  }
}

export async function contentDigest(value: string | ArrayBuffer): Promise<string> {
  const bytes = typeof value === 'string' ? new TextEncoder().encode(value) : value;
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, '0')).join('');
}
