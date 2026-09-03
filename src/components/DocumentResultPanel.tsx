import { lazy, Suspense } from 'react';
import { Book, Copy, Download, FileText, Loader2 } from 'lucide-react';
import type { TranslationStage } from '../lib/translation-state-machine';

const MarkdownPreview = lazy(() => import('./MarkdownPreview'));

type Props = {
  activeTab: 'translate' | 'converter';
  translatedText: string;
  extractedText: string;
  isTranslating: boolean;
  isExtracting: boolean;
  isCopying: boolean;
  isDownloadingEpub: boolean;
  isDownloadingPdf: boolean;
  statusMessage: string;
  translationStage: TranslationStage;
  onCopy: () => void;
  onDownloadEpub: () => void;
  onDownloadMarkdown: () => void;
  onDownloadPdf: () => void;
};

export default function DocumentResultPanel(props: Props) {
  const content = props.activeTab === 'translate' ? props.translatedText : props.extractedText;
  const preview = props.activeTab === 'translate'
    && (props.translationStage === 'extracting' || props.translationStage === 'analyzing')
    ? props.extractedText
    : content;
  return (
    <div className="result-column lg:col-span-7 xl:col-span-8 print:block print:w-full">
      <div className="result-panel bg-slate-900 rounded-2xl shadow-lg shadow-black/20 border border-slate-800 h-full min-h-[680px] flex flex-col overflow-hidden print:border-none print:shadow-none print:h-auto print:min-h-0 print:rounded-none print:block">
        <div className="result-toolbar px-5 sm:px-6 py-4 border-b border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-900/50 print:hidden">
          <h2 className="text-lg font-medium flex items-center gap-2 text-slate-200"><span className="result-status-dot" />{props.activeTab === 'translate' ? '翻譯預覽' : '文字預覽'}</h2>
          <div className="result-actions flex items-center gap-2 overflow-x-auto max-w-full">
            <button onClick={props.onCopy} disabled={!content || props.isCopying} className="py-2 px-4 bg-slate-800 border border-slate-700 hover:bg-slate-700 hover:border-slate-600 text-slate-300 rounded-lg text-sm font-medium flex items-center gap-2 transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-sm">{props.isCopying ? <Loader2 className="w-4 h-4 animate-spin text-blue-400" /> : <Copy className="w-4 h-4" />}複製全文</button>
            <button onClick={props.onDownloadEpub} disabled={!content || props.isTranslating || props.isDownloadingEpub || props.isExtracting} className="py-2 px-4 bg-slate-800 border border-slate-700 hover:bg-slate-700 hover:border-slate-600 text-slate-300 rounded-lg text-sm font-medium flex items-center gap-2 transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-sm">{props.isDownloadingEpub ? <Loader2 className="w-4 h-4 animate-spin text-blue-400" /> : <Book className="w-4 h-4" />}下載 EPUB</button>
            <button onClick={props.onDownloadMarkdown} disabled={!content || props.isTranslating} className="py-2 px-4 bg-slate-800 border border-slate-700 hover:bg-slate-700 hover:border-slate-600 text-slate-300 rounded-lg text-sm font-medium flex items-center gap-2 transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"><FileText className="w-4 h-4" />下載 MD</button>
            <button onClick={props.onDownloadPdf} disabled={!content || props.isTranslating || props.isDownloadingPdf} className="py-2 px-4 bg-slate-800 border border-slate-700 hover:bg-slate-700 hover:border-slate-600 text-slate-300 rounded-lg text-sm font-medium flex items-center gap-2 transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-sm">{props.isDownloadingPdf ? <Loader2 className="w-4 h-4 animate-spin text-blue-400" /> : <Download className="w-4 h-4" />}下載 PDF</button>
          </div>
        </div>
        <div className="flex-1 p-6 overflow-auto bg-slate-900 print:overflow-visible print:p-0">
          {!content && !props.isTranslating && !props.isExtracting ? (
            <div className="h-full flex flex-col items-center justify-center text-slate-600 space-y-4">
              {props.activeTab === 'translate' ? <><FileText className="w-16 h-16 opacity-20" /><p>翻譯結果將顯示於此</p></> : <><Book className="w-16 h-16 opacity-20" /><p>上傳檔案並點擊「轉換並下載 EPUB」按鈕</p><p className="text-sm text-slate-500">轉換完成後將自動下載 EPUB 檔案，並在此預覽提取的文字</p></>}
            </div>
          ) : props.isExtracting && !props.extractedText ? (
            <div className="h-full flex flex-col items-center justify-center text-slate-600 space-y-4"><Loader2 className="w-16 h-16 animate-spin text-blue-500 opacity-80" /><p className="text-slate-400">{props.statusMessage || '正在處理您的文件...'}</p></div>
          ) : (
            <div id="translation-result-content" className="prose prose-invert max-w-none prose-headings:font-semibold prose-a:text-blue-400">
              <Suspense fallback={<div className="text-sm text-slate-500">正在載入預覽...</div>}><MarkdownPreview>{preview}</MarkdownPreview></Suspense>
              {(props.isTranslating || props.isExtracting) && <div className="mt-4 flex items-center text-slate-400 text-sm"><Loader2 className="w-4 h-4 animate-spin mr-2 text-blue-500" />{props.statusMessage || '處理中...'}</div>}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
