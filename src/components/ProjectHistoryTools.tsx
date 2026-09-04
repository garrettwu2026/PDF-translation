import { useEffect, useRef, useState } from 'react';
import { acquireDocumentLock } from '../lib/document-lock';
import { contentDigest } from '../lib/request-integrity';
import { addProject, clearProjectResponses, readProject, type HistoryRecord } from '../lib/db';
import { decodeProject, encodeProject, MAX_BACKUP_BYTES, rekeyProject } from '../lib/project-backup';
import { downloadBlob } from '../lib/browser-exports';
import AccessibleDialog from './AccessibleDialog';

export function useHistoryActivity(records: HistoryRecord[]) {
  const [active, setActive] = useState<string[]>([]);
  useEffect(() => {
    let cancelled = false;
    const update = async () => {
      try {
        const state = await navigator.locks?.query();
        if (!cancelled) setActive((state?.held ?? []).map(lock => lock.name ?? ''));
      } catch { /* Unsupported inspection does not imply that an old run is active. */ }
    };
    void update();
    const timer = setInterval(update, 2000);
    return () => { cancelled = true; clearInterval(timer); };
  }, [records]);
  return (record: HistoryRecord) => !!record.sourceFingerprint && active.includes('pdf-translation:' + record.sourceFingerprint);
}

export default function ProjectHistoryTools({ records, busy, refresh, children }: {
  records: HistoryRecord[]; busy: boolean; refresh: () => void;
  children: (tools: {exportProject: (id: string) => void; clearProject: (id: string) => void; operating: boolean}) => React.ReactNode;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [message, setMessage] = useState('');
  const [operating, setOperating] = useState(false);
  const [clearId, setClearId] = useState<string | null>(null);
  const [incoming, setIncoming] = useState<Awaited<ReturnType<typeof decodeProject>> | null>(null);
  const [storage, setStorage] = useState<StorageEstimate | null>(null);
  useEffect(() => { void navigator.storage?.estimate().then(setStorage).catch(() => {}); }, [records]);
  const run = async (action: () => Promise<void>) => {
    if (busy || operating) return;
    setOperating(true); setMessage('');
    try { await action(); refresh(); } catch (error) { setMessage(error instanceof Error ? error.message : '專案操作失敗，既有資料未被覆寫。'); }
    finally { setOperating(false); }
  };
  const withLock = async (id: string, action: () => Promise<void>) => {
    const record = records.find(record => record.id === id);
    if (!record) throw new Error('找不到專案。');
    const release = await acquireDocumentLock(record.sourceFingerprint ?? await contentDigest(record.extractedText));
    try { await action(); } finally { await release(); }
  };
  const exportProject = (id: string) => void run(() => withLock(id, async () => {
    const data = await readProject(id);
    const text = await encodeProject(data);
    downloadBlob(new Blob([text], {type: 'application/json'}), 'translation-project-' + new Date().toISOString().slice(0, 10) + '.json');
    setMessage('備份已下載，包含原文、譯文與中間結果。未包含金鑰設定；請妥善保管此未加密檔案。');
  }));
  const requestImport = async (file?: File) => {
    if (!file) return;
    await run(async () => {
      if (file.size > MAX_BACKUP_BYTES) throw new Error('備份超過 100 MB 上限。');
      setIncoming(await decodeProject(await file.text()));
    });
  };
  return <>
    <div className="history-storage">
      <p>{records.length} 份專案 · {storage?.usage !== undefined ? `此網站使用約 ${(storage.usage / 1048576).toFixed(1)} MB` : '瀏覽器未提供容量資訊'}{storage?.quota ? `／可用配額約 ${(storage.quota / 1048576).toFixed(0)} MB` : ''}</p>
      <p>瀏覽器可能回收資料；重要專案請下載備份。備份不含原始 PDF，未完成擷取時仍需原檔。</p>
      <input ref={input} aria-label="匯入專案備份檔案" type="file" accept=".json,application/json" hidden disabled={busy || operating} onChange={e => { void requestImport(e.target.files?.[0]); e.target.value = ''; }} />
      <button className="secondary-button" disabled={busy || operating} onClick={() => input.current?.click()}>匯入專案備份</button>
      {message && <p role="status">{message}</p>}
    </div>
    {children({exportProject, clearProject: setClearId, operating: busy || operating})}
    {clearId && <AccessibleDialog labelledBy="clear-cache-title" onClose={() => { if (!operating) setClearId(null); }} overlayClassName="z-[80]" className="app-card max-w-md">
      <h2 id="clear-cache-title">清理中間結果？</h2><p>保留原文、已提交譯文、文件記憶與費用帳本；移除已付費階段的可重用內容。續傳可能重新呼叫模型並產生費用，無法復原，建議先下載備份。</p>
      {message && <p role="alert">{message}</p>}<div className="run-buttons mt-4"><button disabled={operating} className="secondary-button" onClick={() => setClearId(null)}>取消</button><button disabled={busy || operating} className="stop-button" onClick={() => void run(() => withLock(clearId, async () => { await clearProjectResponses(clearId); setClearId(null); setMessage('中間結果已清理；原文、譯文與費用帳本仍保留。'); }))}>確認清理中間結果</button></div>
    </AccessibleDialog>}
    {incoming && <AccessibleDialog labelledBy="import-project-title" onClose={() => { if (!operating) setIncoming(null); }} overlayClassName="z-[80]" className="app-card max-w-md">
      <h2 id="import-project-title">匯入專案備份</h2><p>{incoming.record.title} · 已完成 {incoming.record.currentChunk}／{incoming.record.totalChunks} 段</p>
      <p>只匯入你信任的備份。完整性碼只能偵測損壞，不能證明來源。將建立獨立副本，不覆寫既有紀錄，也不會開始翻譯；費用為備份中的已知用量，未經供應商核對。</p>
      {message && <p role="alert">{message}</p>}<div className="run-buttons mt-4"><button disabled={operating} className="secondary-button" onClick={() => setIncoming(null)}>取消</button><button disabled={busy || operating} className="primary-button" onClick={() => void run(async () => {
        const release = await acquireDocumentLock(incoming.record.sourceFingerprint ?? await contentDigest(incoming.record.extractedText));
        try { await addProject(rekeyProject(incoming, crypto.randomUUID())); setIncoming(null); setMessage('已匯入獨立副本。請從歷史紀錄載入，再設定此裝置的 API Key。'); } finally { await release(); }
      })}>確認匯入副本</button></div>
    </AccessibleDialog>}
  </>;
}
