export interface HistoryRecord {
  id: string;
  title: string;
  author: string;
  coverImage: string | null;
  extractedText: string;
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
}

const DB_NAME = 'pdf-translator-db';
const STORE_NAME = 'history';
const DB_VERSION = 1;
let databasePromise: Promise<IDBDatabase> | null = null;

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
      reject(new Error('Translation history database is blocked by another tab'));
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

export const saveHistory = async (record: HistoryRecord): Promise<void> => {
  const db = await initDB();
  const transaction = db.transaction(STORE_NAME, 'readwrite');
  transaction.objectStore(STORE_NAME).put(record);
  await waitForTransaction(transaction);
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
  const transaction = db.transaction(STORE_NAME, 'readwrite');
  transaction.objectStore(STORE_NAME).delete(id);
  await waitForTransaction(transaction);
};
