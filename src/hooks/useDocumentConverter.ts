import { useState } from 'react';
import { extractPdfText } from '../lib/pdf-text-extraction';
import { downloadBlob, requestEpub } from '../lib/browser-exports';
import { reportError } from '../lib/diagnostics';

type Options = {
  file: File | null; customTitle: string; authorName: string; coverImage: string | null; isIframe: boolean;
  setStatusMessage: (message: string) => void; setError: (message: string | null) => void;
  setExtractedText: (text: string) => void; showToast: (message: string, type?: 'success' | 'error') => void;
};

/** Local text extraction followed by the existing EPUB export endpoint. */
export function useDocumentConverter({
  file, customTitle, authorName, coverImage, isIframe, setStatusMessage, setError, setExtractedText, showToast,
}: Options) {
  const [isExtracting, setIsExtracting] = useState(false);
  const handlePdfToEpub = async () => {
    if (!file) return;
    if (isIframe) {
      showToast("在內嵌模式下可能無法下載檔案，請在新分頁開啟以獲得完整功能。", 'error');
      return;
    }

    setIsExtracting(true);
    setStatusMessage('正在從 PDF 提取文字...');
    setError(null);

    try {
      let fullText = '';
      const isMd = file.name.toLowerCase().endsWith('.md');

      if (isMd) {
        setStatusMessage('正在讀取 Markdown 檔案...');
        fullText = await file.text();
      } else {
        fullText = await extractPdfText(file, (page, total, text) => {
          setStatusMessage(`提取文字中 (第 ${page}/${total} 頁)...`);
          setExtractedText(text);
        });
      }

      setStatusMessage('正在產生 EPUB...');
      const baseName = customTitle.trim() || file?.name.replace(/\.(pdf|md)$/i, '') || 'document';
      const titleToUse = baseName;

      const blob = await requestEpub({
        title: titleToUse,
        markdown: fullText,
        author: authorName || undefined,
        cover: coverImage || undefined,
      });
      downloadBlob(blob, `${titleToUse}.epub`);

      showToast('EPUB 轉換並下載成功！', 'success');
      setExtractedText(fullText);

    } catch (err: any) {
      reportError('pdf_to_epub_failed');
      setError(`轉換失敗: ${err.message}`);
      showToast(`轉換失敗: ${err.message}`, 'error');
    } finally {
      setIsExtracting(false);
      setStatusMessage('');
    }
  };


  return { isExtracting, handlePdfToEpub };
}
