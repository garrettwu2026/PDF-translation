/** Web Locks are released by the browser when a tab crashes or closes. Fail closed
 * on unsupported browsers; a localStorage lease cannot safely replace an atomic lock. */
export async function acquireDocumentLock(fingerprint: string, locks = navigator.locks): Promise<() => Promise<void>> {
  if (!locks) throw new Error('此瀏覽器不支援安全的跨分頁翻譯鎖，請改用新版 Chrome、Edge 或 Firefox。');
  let release!: () => void;
  let grant!: (value: boolean) => void;
  const granted = new Promise<boolean>(resolve => { grant = resolve; });
  const held = new Promise<void>(resolve => { release = resolve; });
  const request = locks.request('pdf-translation:' + fingerprint, { ifAvailable: true }, async lock => {
    grant(Boolean(lock));
    if (lock) await held;
  });
  request.catch(() => grant(false));
  if (!await granted) {
    await request;
    throw new Error('另一個分頁正在翻譯這份文件，請先在該分頁停止，再從歷史紀錄重新載入。');
  }
  return async () => { release(); await request; };
}
