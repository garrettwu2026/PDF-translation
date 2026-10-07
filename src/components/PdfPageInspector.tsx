import { useEffect, useState } from 'react';
import { orderPdfPageText, type PdfTextItemLike } from '../lib/pdf-layout';
import { inspectPdfPage, type PdfPageQuality } from '../lib/pdf-page-quality';
import { assertPdfPageLimit } from '../lib/file-limits';

const labels = {native: '使用原生文字', sparse: '文字不足，將使用 OCR', garbled: '疑似亂碼，將使用 OCR', mixed: '可能含圖片正文，將使用 OCR'};
export default function PdfPageInspector({file, disabled, selected, onChange}: {file: File; disabled: boolean; selected: number[]; onChange: (pages: number[]) => void}) {
  const [open, setOpen] = useState(false);
  const [number, setNumber] = useState(1);
  const [total, setTotal] = useState(1);
  const [result, setResult] = useState<{text: string; quality: PdfPageQuality} | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {setNumber(1); setOpen(false); setResult(null);}, [file]);
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    let task: {destroy: () => Promise<void>} | undefined;
    setResult(null); setError('');
    void (async () => {
      try {
        const pdfjs = await import('pdfjs-dist');
        const worker = await import('pdfjs-dist/build/pdf.worker.mjs?url');
        pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
        if (cancelled) return;
        const buffer = await file.arrayBuffer();
        if (cancelled) return;
        const loading = pdfjs.getDocument({data: buffer}); task = loading;
        const doc = await loading.promise;
        assertPdfPageLimit(doc.numPages);
        const page = await doc.getPage(Math.min(number, doc.numPages));
        const content = await page.getTextContent();
        const text = orderPdfPageText(content.items as PdfTextItemLike[]);
        const quality = await inspectPdfPage(page, [pdfjs.OPS.paintImageXObject, pdfjs.OPS.paintInlineImageXObject, pdfjs.OPS.paintImageMaskXObject], text);
        page.cleanup();
        if (!cancelled) {setTotal(doc.numPages); setResult({text, quality});}
      } catch {if (!cancelled) setError('無法檢查此頁，請確認 PDF 可正常開啟。');}
      finally {await task?.destroy().catch(() => {});}
    })();
    return () => {cancelled = true; void task?.destroy().catch(() => {});};
  }, [file, open, number]);
  return <details className="disclosure" open={open} onToggle={e => setOpen(e.currentTarget.open)}>
    <summary>PDF 逐頁文字檢查</summary>
    <p className="muted">檢查在本機完成。若正文遺漏或亂碼，可在翻譯前指定該頁 OCR；OCR 會使用 Gemini 並計入文件預算。</p>
    <label>檢查頁碼 <input aria-label="檢查 PDF 頁碼" type="number" min={1} max={total} value={number} onChange={e => setNumber(Math.max(1, Math.min(total, Number(e.target.value) || 1)))} /></label>
    <p aria-live="polite">{error || (result ? `第 ${number}／${total} 頁 · ${labels[result.quality.reason]}` : '正在讀取頁面…')}</p>
    {result && <pre className="pdf-page-text">{result.text || '此頁沒有原生文字。'}</pre>}
    <label className="check-option"><input type="checkbox" disabled={disabled || !result} checked={selected.includes(number)} onChange={e => onChange(e.target.checked ? [...selected, number].sort((a,b) => a-b) : selected.filter(n => n !== number))} />指定此頁使用 OCR</label>
    {selected.length > 0 && <p>指定 OCR：第 {selected.join('、')} 頁</p>}
    {disabled && <p className="muted">擷取開始後設定已鎖定；要重新擷取，請重新上傳文件建立新專案。</p>}
  </details>;
}
