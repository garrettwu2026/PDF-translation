import { useCallback, useState } from 'react';
import { downloadBlob, downloadMarkdown, requestEpub } from '../lib/browser-exports';
import { reportError } from '../lib/diagnostics';

type Options = {
  activeTab: 'translate' | 'converter';
  file: File | null;
  customTitle: string;
  authorName: string;
  coverImage: string | null;
  translatedText: string;
  extractedText: string;
  isIframe: boolean;
  showToast: (message: string, type?: 'success' | 'error') => void;
};

export function useDocumentExports(options: Options) {
  const [isCopying, setIsCopying] = useState(false);
  const [isDownloadingEpub, setIsDownloadingEpub] = useState(false);
  const [isDownloadingPdf, setIsDownloadingPdf] = useState(false);

  const getBaseName = useCallback(() => options.customTitle.trim()
    || options.file?.name.replace(/\.(pdf|md)$/i, '')
    || 'document', [options.customTitle, options.file]);
  const getExportTitle = useCallback(() => options.activeTab === 'translate'
    ? `${getBaseName()}_翻譯`
    : getBaseName(), [getBaseName, options.activeTab]);

  const downloadPdf = useCallback(async () => {
    if (options.isIframe) {
      options.showToast('在內嵌模式下可能無法下載檔案，請在新分頁開啟以獲得完整功能。', 'error');
      return;
    }
    setIsDownloadingPdf(true);
    try {
      const text = options.activeTab === 'translate' ? options.translatedText : options.extractedText;
      if (!text) return;
      const { printMarkdown } = await import('../lib/markdown-print');
      printMarkdown(text, getExportTitle());
      options.showToast('請在列印對話框中選擇「另存為 PDF」');
    } catch (error) {
      reportError('pdf_export_failed');
      options.showToast(`生成 PDF 失敗: ${error instanceof Error ? error.message : String(error)}`, 'error');
    } finally {
      setIsDownloadingPdf(false);
    }
  }, [getExportTitle, options.isIframe, options.showToast, options.activeTab, options.translatedText, options.extractedText]);

  const downloadMarkdownFile = useCallback(() => {
    const text = options.activeTab === 'translate' ? options.translatedText : options.extractedText;
    if (!text) return;
    downloadMarkdown(text, `${getExportTitle()}.md`);
    options.showToast('已下載 Markdown 檔案');
  }, [getExportTitle, options.activeTab, options.extractedText, options.showToast, options.translatedText]);

  const copyText = useCallback(async () => {
    const text = options.activeTab === 'translate' ? options.translatedText : options.extractedText;
    if (!text) return;
    if (options.isIframe) {
      options.showToast('在內嵌模式下可能無法複製，請在新分頁開啟以獲得完整功能。', 'error');
      return;
    }
    setIsCopying(true);
    await new Promise((resolve) => setTimeout(resolve, 50));
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(text);
      } else {
        const textArea = document.createElement('textarea');
        textArea.value = text;
        textArea.style.position = 'fixed';
        textArea.style.left = '-999999px';
        document.body.appendChild(textArea);
        textArea.select();
        document.execCommand('copy');
        textArea.remove();
      }
      options.showToast('已複製全文到剪貼簿！');
    } catch {
      reportError('clipboard_copy_failed');
      options.showToast('複製失敗，請手動選取複製。', 'error');
    } finally {
      setIsCopying(false);
    }
  }, [options.activeTab, options.extractedText, options.isIframe, options.showToast, options.translatedText]);

  const downloadEpub = useCallback(async (textOverride?: string) => {
    if (options.isIframe) {
      options.showToast('在內嵌模式下可能無法下載檔案，請在新分頁開啟以獲得完整功能。', 'error');
      return;
    }
    const text = textOverride || (options.activeTab === 'translate' ? options.translatedText : options.extractedText);
    if (!text) return;
    setIsDownloadingEpub(true);
    await new Promise((resolve) => setTimeout(resolve, 50));
    try {
      const title = getExportTitle();
      const blob = await requestEpub({
        title,
        markdown: text,
        author: options.authorName || undefined,
        cover: options.coverImage || undefined,
      });
      downloadBlob(blob, `${title}.epub`);
      options.showToast('EPUB 下載成功！');
    } catch (error) {
      reportError('epub_download_failed');
      options.showToast(`產生 EPUB 失敗，請確定您的網路連線正常。(${error instanceof Error ? error.message : String(error)})`, 'error');
    } finally {
      setIsDownloadingEpub(false);
    }
  }, [getExportTitle, options.activeTab, options.authorName, options.coverImage, options.extractedText, options.isIframe, options.showToast, options.translatedText]);

  return { isCopying, isDownloadingEpub, isDownloadingPdf, copyText, downloadEpub, downloadMarkdownFile, downloadPdf };
}
