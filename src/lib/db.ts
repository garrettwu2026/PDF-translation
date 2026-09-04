import type { NovelContinuityMemory } from './novel-continuity.ts';
import type { TranslationUsageSnapshot } from './translation-budget.ts';
import type { CostSample } from './cost-forecast.ts';

export interface HistoryRecord {
  sourceFingerprint?: string;
  resumeSettings?: string;
  customInstructions?: string;
  pendingRequests?: number;
  requestCharacters?: number;
  chapterContext?: {
    source: string[]; translated: string[]; startOffset: number;
    terms: number; characters: number; warnings: number; previousTranslation: string;
  };
  id: string;
  title: string;
  author: string;
  coverImage: string | null;
  extractedText: string;
  extractionComplete?: boolean;
  splitTranslation?: boolean;
  translatedText: string;
  currentChunk: number;
  totalChunks: number;
  status: 'translating' | 'completed' | 'error';
  timestamp: number;
  model: string;
  translationStyle?: string;
  glossaryText?: string;
  characterMap?: string;
  plotSummary?: string;
  documentType?: string;
  effectiveDocumentType?: string;
  chapterProofreading?: boolean;
  novelContinuity?: NovelContinuityMemory;
  usageSnapshot?: TranslationUsageSnapshot;
  budgetUsd?: number;
  costSamples?: CostSample[];
}

const DB_NAME = 'pdf-translator-db';
const STORE_NAME = 'history';
const DB_VERSION = 2;
const REQUEST_STORE = 'requests';
export const HISTORY_MAX_RECORDS = 25;
export const HISTORY_MAX_CHARACTERS = 12_000_000;
export const HISTORY_CHECKPOINT_INTERVAL = 3;
let databasePromise: Promise<IDBDatabase> | null = null;

export class HistoryStorageError extends Error {
  code: 'quota' | 'blocked' | 'unknown';

  constructor(code: HistoryStorageError['code'], message: string, cause?: unknown) {
    super(message, { cause });
    this.name = 'HistoryStorageError';
    this.code = code;
  }
}

export const shouldCheckpointTranslationProgress = (
  currentChunk: number,
  totalChunks: number,
  interval = HISTORY_CHECKPOINT_INTERVAL,
) => currentChunk === 1 || currentChunk >= totalChunks || currentChunk % Math.max(1, interval) === 0;

const normalizeStorageError = (error: unknown) => {
  if (error instanceof HistoryStorageError) return error;
  if (error instanceof DOMException && error.name === 'QuotaExceededError') {
    return new HistoryStorageError('quota', '瀏覽器儲存空間不足，請下載目前譯文並刪除不需要的歷史紀錄。', error);
  }
  return new HistoryStorageError('unknown', '無法儲存翻譯歷史紀錄。', error);
};

export const estimateHistoryRecordCharacters = (record: HistoryRecord) =>
  record.title.length
  + record.author.length
  + (record.coverImage?.length ?? 0)
  + record.extractedText.length
  + record.translatedText.length
  + (record.translationStyle?.length ?? 0)
  + (record.glossaryText?.length ?? 0)
  + (record.characterMap?.length ?? 0)
  + (record.plotSummary?.length ?? 0)
  + (record.novelContinuity ? JSON.stringify(record.novelContinuity).length : 0)
  + (record.usageSnapshot ? JSON.stringify(record.usageSnapshot).length : 0)
  + (record.costSamples ? JSON.stringify(record.costSamples).length : 0)
  + (record.chapterContext ? JSON.stringify(record.chapterContext).length : 0)
  + (record.customInstructions?.length ?? 0)
  + (record.requestCharacters ?? 0);

export const selectHistoryRecordsToKeep = (
  records: HistoryRecord[],
  maxRecords = HISTORY_MAX_RECORDS,
  maxCharacters = HISTORY_MAX_CHARACTERS,
) => {
  const sorted = [...records].sort((a, b) => b.timestamp - a.timestamp);
  const keep: HistoryRecord[] = [];
  let characters = 0;
  for (const record of sorted) {
    const recordCharacters = estimateHistoryRecordCharacters(record);
    const isNewest = keep.length === 0;
    if (!isNewest && record.status === 'completed'
      && (keep.length >= maxRecords || characters + recordCharacters > maxCharacters)) continue;
    keep.push(record);
    characters += recordCharacters;
  }
  return { keep, deleteIds: sorted.filter((record) => !keep.includes(record)).map((record) => record.id), characters };
};

export const initDB = (): Promise<IDBDatabase> => {
  if (databasePromise) return databasePromise;

  databasePromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => {
      databasePromise = null;
      reject(request.error);
    };
    request.onblocked = () => {
      databasePromise = null;
      reject(new HistoryStorageError('blocked', '另一個分頁正在使用翻譯歷史，請關閉其他分頁後重試。'));
    };
    request.onsuccess = () => {
      const database = request.result;
      database.onversionchange = () => {
        database.close();
        databasePromise = null;
      };
      resolve(database);
    };

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(REQUEST_STORE)) {
        db.createObjectStore(REQUEST_STORE, { keyPath: 'id' }).createIndex('documentId', 'documentId');
      }
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
    };
  });

  return databasePromise;
};

const waitForTransaction = (transaction: IDBTransaction): Promise<void> =>
  new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error ?? new Error('Database transaction aborted'));
  });

export const notifyDocumentChange = (documentId: string, pendingRequests?: number) => {
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('translation-document-change', {detail: {documentId, pendingRequests}}));
};

export async function getJournalSummary(id: string) {
  const db = await initDB();
  const tx = db.transaction(REQUEST_STORE);
  let available = 0, pending = 0;
  const cursor = tx.objectStore(REQUEST_STORE).index('documentId').openCursor(id);
  cursor.onsuccess = () => {
    const item = cursor.result;
    if (!item) return;
    const value = item.value as SavedRequest;
    if (value.response && ['complete','unknown'].includes(value.state)) available++;
    if (['pending','unknown'].includes(value.state)) pending++;
    item.continue();
  };
  await waitForTransaction(tx);
  return {available, pending};
}

/** A consistent document + journal snapshot. Caller holds the document lock. */
export async function readProject(id: string) {
  const db = await initDB();
  const tx = db.transaction([STORE_NAME, REQUEST_STORE]);
  const record = tx.objectStore(STORE_NAME).get(id);
  const requests = tx.objectStore(REQUEST_STORE).index('documentId').getAll(id);
  await waitForTransaction(tx);
  if (!record.result) throw new Error('找不到此專案。');
  return {record: record.result as HistoryRecord, requests: requests.result as SavedRequest[]};
}

/** Atomic add-only import. Never overwrite or automatically prune existing documents. */
export async function addProject(data: {record: HistoryRecord; requests: SavedRequest[]}) {
  try {
    const db = await initDB();
    const tx = db.transaction([STORE_NAME, REQUEST_STORE], 'readwrite');
    tx.objectStore(STORE_NAME).add(data.record);
    for (const request of data.requests) tx.objectStore(REQUEST_STORE).add(request);
    await waitForTransaction(tx);
    notifyDocumentChange(data.record.id);
  } catch (error) { throw normalizeStorageError(error); }
}

/** Explicitly clear response bodies only; keep usage and unresolved request evidence. Caller holds lock. */
export async function clearProjectResponses(id: string) {
  const db = await initDB();
  const tx = db.transaction([STORE_NAME, REQUEST_STORE], 'readwrite');
  const history = tx.objectStore(STORE_NAME);
  const record = history.get(id);
  record.onsuccess = () => { if (record.result) history.put({...record.result, requestCharacters: 0}); else tx.abort(); };
  const requests = tx.objectStore(REQUEST_STORE).index('documentId').openCursor(id);
  requests.onsuccess = () => {
    const cursor = requests.result;
    if (!cursor) return;
    const {response, ...entry} = cursor.value as SavedRequest;
    cursor.update({...entry, state: entry.state === 'complete' ? 'failed' : entry.state});
    cursor.continue();
  };
  await waitForTransaction(tx);
  notifyDocumentChange(id);
}

export const saveHistory = async (record: HistoryRecord, options: { prune?: boolean } = {}): Promise<void> => {
  try {
    const db = await initDB();
    const transaction = db.transaction([STORE_NAME, REQUEST_STORE], 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    if (options.prune === false) {
      const existing = store.get(record.id);
      existing.onsuccess = () => store.put({ ...record, pendingRequests: existing.result?.pendingRequests ?? 0,
        requestCharacters: existing.result?.requestCharacters ?? 0 });
      await waitForTransaction(transaction);
      return;
    }
    const request = store.getAll();
    request.onsuccess = () => {
      const existing = (request.result as HistoryRecord[]).filter((item) => item.id !== record.id);
      const previous = (request.result as HistoryRecord[]).find(item => item.id === record.id);
      const updated = { ...record, pendingRequests: previous?.pendingRequests ?? 0,
        requestCharacters: previous?.requestCharacters ?? 0 };
      const { deleteIds } = selectHistoryRecordsToKeep([...existing, updated]);
      for (const id of deleteIds) {
        store.delete(id);
        deleteDocumentRequests(transaction, id);
      }
      store.put(updated);
    };
    request.onerror = () => transaction.abort();
    await waitForTransaction(transaction);
  } catch (error) {
    throw normalizeStorageError(error);
  }
};

export const getHistory = async (id: string): Promise<HistoryRecord | undefined> => {
  const db = await initDB();
  return new Promise<HistoryRecord | undefined>((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readonly');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.get(id);

    request.onsuccess = () => resolve(request.result as HistoryRecord | undefined);
    request.onerror = () => reject(request.error);
  });
};

export const getAllHistory = async (): Promise<HistoryRecord[]> => {
  const db = await initDB();
  return new Promise<HistoryRecord[]>((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readonly');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.getAll();

    request.onsuccess = () => {
      const results = request.result as HistoryRecord[];
      resolve(results.sort((a, b) => b.timestamp - a.timestamp));
    };
    request.onerror = () => reject(request.error);
  });
};

export const deleteHistory = async (id: string): Promise<void> => {
  const db = await initDB();
  const transaction = db.transaction([STORE_NAME, REQUEST_STORE], 'readwrite');
  transaction.objectStore(STORE_NAME).delete(id);
  deleteDocumentRequests(transaction, id);
  await waitForTransaction(transaction);
};

function deleteDocumentRequests(transaction: IDBTransaction, id: string) {
  const request = transaction.objectStore(REQUEST_STORE).index('documentId').openKeyCursor(IDBKeyRange.only(id));
  request.onsuccess = () => {
    const cursor = request.result;
    if (cursor) { transaction.objectStore(REQUEST_STORE).delete(cursor.primaryKey); cursor.continue(); }
  };
}

export type SavedRequest = {
  id: string; documentId: string; state: 'pending' | 'complete' | 'unknown' | 'failed';
  response?: import('./ai-providers').ContentResult;
};

export async function getSavedRequest(id: string): Promise<SavedRequest | undefined> {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const request = db.transaction(REQUEST_STORE).objectStore(REQUEST_STORE).get(id);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/** Result and cumulative known usage commit atomically, before another paid stage starts. */
export async function saveRequest(entry: SavedRequest, usage?: TranslationUsageSnapshot) {
  let unresolvedCount = 0;
  try {
    const db = await initDB();
    const tx = db.transaction([STORE_NAME, REQUEST_STORE], 'readwrite');
    const requests = tx.objectStore(REQUEST_STORE);
    const previous = requests.get(entry.id);
    previous.onsuccess = () => {
      const history = tx.objectStore(STORE_NAME);
      const record = history.get(entry.documentId);
      record.onsuccess = () => {
        if (!record.result) { tx.abort(); return; }
        const unresolved = (state?: string) => state === 'pending' || state === 'unknown' ? 1 : 0;
        const pendingRequests = Math.max(0, (record.result.pendingRequests ?? 0)
          + unresolved(entry.state) - unresolved(previous.result?.state));
        unresolvedCount = pendingRequests;
        history.put({ ...record.result, pendingRequests, timestamp: Date.now(),
          requestCharacters: Math.max(0, (record.result.requestCharacters ?? 0)
            + (entry.response?.text.length ?? 0) - (previous.result?.response?.text.length ?? 0)),
          ...(usage ? { usageSnapshot: usage } : {}) });
        requests.put(entry);
      };
    };
    await waitForTransaction(tx);
    notifyDocumentChange(entry.documentId, unresolvedCount);
  } catch (error) { throw normalizeStorageError(error); }
}
