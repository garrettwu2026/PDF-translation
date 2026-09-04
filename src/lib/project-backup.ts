import type { HistoryRecord, SavedRequest } from './db.ts';
import { contentDigest, assertCompleteOutput } from './request-integrity.ts';

export const MAX_BACKUP_BYTES = 100 * 1024 * 1024;
type Shape = 'string' | 'number' | 'boolean' | { [key: string]: Shape } | [Shape];
const usage: Shape = {inputTokens: 'number', cachedInputTokens: 'number', cacheWriteInputTokens: 'number', outputTokens: 'number', reasoningTokens: 'number', inputUsd: 'number', outputUsd: 'number',
  breakdown: [{stage: 'string', model: 'string', inputTokens: 'number', outputTokens: 'number', reasoningTokens: 'number', inputUsd: 'number', outputUsd: 'number'}]};
const recordShape: Shape = {
  id: 'string', title: 'string', author: 'string', coverImage: 'string', extractedText: 'string', translatedText: 'string',
  currentChunk: 'number', totalChunks: 'number', status: 'string', timestamp: 'number', model: 'string',
  sourceFingerprint: 'string', resumeSettings: 'string', customInstructions: 'string', extractionComplete: 'boolean', splitTranslation: 'boolean',
  translationStyle: 'string', glossaryText: 'string', characterMap: 'string', plotSummary: 'string', documentType: 'string', effectiveDocumentType: 'string',
  chapterProofreading: 'boolean', budgetUsd: 'number', usageSnapshot: usage,
  chapterContext: {source: ['string'], translated: ['string'], startOffset: 'number', terms: 'number', characters: 'number', warnings: 'number', previousTranslation: 'string'},
  novelContinuity: {version: 'number', entities: [{sourceName: 'string', translatedName: 'string', aliases: ['string'], facts: ['string'], firstSeenChunk: 'number', lastSeenChunk: 'number'}], timeline: [{chunk: 'number', chapter: 'string', summary: 'string'}]},
  costSamples: [{profile: 'string', sourceTokens: 'number', costUsd: 'number'}],
};
const requestShape: Shape = {id: 'string', documentId: 'string', state: 'string', response: {text: 'string', finishReason: 'string'}};

function select(value: unknown, shape: Shape): any {
  if (value === undefined || value === null) return undefined;
  if (typeof shape === 'string') {
    if (typeof value !== shape || (shape === 'number' && (!Number.isFinite(value) || Number(value) < 0))) throw new Error('備份欄位型別或數值不正確。');
    return value;
  }
  if (Array.isArray(shape)) {
    if (!Array.isArray(value) || value.length > 10_000) throw new Error('備份陣列格式或大小不正確。');
    return value.map(item => { if (item == null) throw new Error('備份陣列含無效項目。'); return select(item, shape[0]); });
  }
  if (typeof value !== 'object' || Array.isArray(value)) throw new Error('備份物件格式不正確。');
  const result: Record<string, unknown> = {};
  for (const [key, rule] of Object.entries(shape)) {
    const selected = select((value as Record<string, unknown>)[key], rule);
    if (selected !== undefined) result[key] = selected;
  }
  return result;
}

export type ProjectData = {record: HistoryRecord; requests: SavedRequest[]};
export function sanitizeProject(value: unknown): ProjectData {
  if (!value || typeof value !== 'object') throw new Error('無效的專案備份。');
  const input = value as ProjectData;
  const record = select(input.record, recordShape) as HistoryRecord;
  if (!record || !record.id || !record.title || typeof record.author !== 'string' || typeof record.extractedText !== 'string'
    || typeof record.translatedText !== 'string' || !record.model || !Number.isFinite(record.timestamp)
    || !Number.isInteger(record.currentChunk) || !Number.isInteger(record.totalChunks) || record.currentChunk > record.totalChunks
    || !['translating', 'completed', 'error'].includes(record.status)) throw new Error('備份缺少必要文件或進度資訊。');
  record.coverImage ??= null;
  if (record.coverImage && !/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(record.coverImage)) throw new Error('備份封面格式不支援。');
  if (record.sourceFingerprint && !/^[a-f0-9]{64}$/.test(record.sourceFingerprint)) throw new Error('來源指紋格式錯誤。');
  if (record.resumeSettings && !/^[a-f0-9]{64}$/.test(record.resumeSettings)) throw new Error('設定指紋格式錯誤。');
  if (record.usageSnapshot) {
    for (const key of ['inputTokens','cachedInputTokens','cacheWriteInputTokens','outputTokens','reasoningTokens','inputUsd','outputUsd'] as const) {
      if (typeof record.usageSnapshot[key] !== 'number') throw new Error('費用帳本不完整，無法安全還原。');
    }
  }
  if (record.chapterContext && (!Array.isArray(record.chapterContext.source) || !Array.isArray(record.chapterContext.translated) || typeof record.chapterContext.previousTranslation !== 'string'
    || !['startOffset','terms','characters','warnings'].every(key => typeof (record.chapterContext as any)[key] === 'number'))) throw new Error('章節記憶不完整。');
  if (!Array.isArray(input.requests) || input.requests.length > 10_000) throw new Error('中間結果數量不正確。');
  const ids = new Set<string>();
  const requests = input.requests.map(value => {
    const request = select(value, requestShape) as SavedRequest;
    if (!request || request.documentId !== record.id || !request.id?.startsWith(record.id + ':')
      || !/^[a-f0-9]{64}(:unknown:[\w-]+)?$/.test(request.id.slice(record.id.length + 1))
      || ids.has(request.id) || !['pending','complete','unknown','failed'].includes(request.state)) throw new Error('中間結果識別資訊不正確。');
    ids.add(request.id);
    if (request.response) assertCompleteOutput(request.response);
    if (request.state === 'complete' && !request.response) throw new Error('已完成的中間結果缺少內容。');
    return request;
  });
  record.pendingRequests = requests.filter(r => r.state === 'pending' || r.state === 'unknown').length;
  record.requestCharacters = requests.reduce((sum, r) => sum + (r.response?.text.length ?? 0), 0);
  return {record, requests};
}

export async function encodeProject(data: ProjectData) {
  const payload = sanitizeProject(data);
  const json = JSON.stringify(payload);
  const result = JSON.stringify({format: 'pdf-translation-project', version: 1, checksum: await contentDigest(json), payload});
  if (new Blob([result]).size > MAX_BACKUP_BYTES) throw new Error('專案超過 100 MB 備份上限，請先整理中間結果。');
  return result;
}
export async function decodeProject(text: string): Promise<ProjectData> {
  if (new Blob([text]).size > MAX_BACKUP_BYTES) throw new Error('備份超過 100 MB 上限。');
  let parsed: any;
  try { parsed = JSON.parse(text); } catch { throw new Error('備份不是有效的 JSON。'); }
  if (parsed?.format !== 'pdf-translation-project' || parsed.version !== 1) throw new Error('備份版本或格式不支援。');
  if (parsed.checksum !== await contentDigest(JSON.stringify(parsed.payload))) throw new Error('備份完整性檢查失敗，檔案可能已損壞。');
  return sanitizeProject(parsed.payload);
}
export function rekeyProject(data: ProjectData, newId: string): ProjectData {
  const {record, requests} = sanitizeProject(data);
  return {record: {...record, id: newId}, requests: requests.map(request => ({...request, id: newId + request.id.slice(record.id.length), documentId: newId,
    state: request.state === 'pending' ? 'unknown' : request.state}))};
}
