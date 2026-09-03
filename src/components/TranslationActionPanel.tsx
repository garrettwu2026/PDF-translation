import { lazy, Suspense } from 'react';
import { AlertCircle, Book, FileText, Loader2, Play, X } from 'lucide-react';
import type { TranslationStage } from '../lib/translation-state-machine';

const MarkdownPreview = lazy(() => import('./MarkdownPreview'));

type Props = {
  activeTab: 'translate' | 'converter';
  canTranslate: boolean;
  isCalculating: boolean;
  isTranslating: boolean;
  isExtracting: boolean;
  statusMessage: string;
  totalChunks: number;
  currentChunk: number;
  translationStage: TranslationStage;
  estimatedRemainingTime: number | null;
  translationStyle: string | null;
  error: string | null;
  onTranslate: () => void;
  onCancel: () => void;
  onConvert: () => void;
};

export default function TranslationActionPanel(props: Props) {
  const progress = props.totalChunks > 0
    ? Math.min(100, Math.round((props.currentChunk / props.totalChunks) * 100))
    : 0;
  return (
    <div className="app-card action-card bg-slate-900 p-6 rounded-2xl shadow-lg shadow-black/20 border border-slate-800">
      <div className="section-heading">
        <div className="step-badge">{props.activeTab === 'translate' ? '4' : '3'}</div>
        <div>
          <h2 className="text-lg font-semibold text-slate-200">{props.activeTab === 'translate' ? '準備開始' : '準備轉換'}</h2>
          <p className="text-xs text-slate-500 mt-0.5">確認設定後即可執行</p>
        </div>
      </div>

      {props.activeTab === 'translate' ? (
        <div className="space-y-2.5">
          <button onClick={props.onTranslate} disabled={!props.canTranslate || props.isCalculating || props.isTranslating || props.isExtracting} className="w-full py-3.5 px-4 bg-blue-600 hover:bg-blue-500 text-white rounded-xl font-medium flex items-center justify-center gap-2 transition-all shadow-[0_0_15px_rgba(37,99,235,0.3)] hover:shadow-[0_0_20px_rgba(37,99,235,0.5)] border border-blue-400/50 disabled:opacity-50 disabled:cursor-not-allowed disabled:shadow-none disabled:border-slate-700 disabled:bg-slate-800 disabled:text-slate-500">
            {props.isTranslating ? <><Loader2 className="w-5 h-5 animate-spin text-blue-400" /><span className="text-white">{props.statusMessage || (props.totalChunks > 0 ? `翻譯中 (第 ${props.currentChunk}/${props.totalChunks} 部分)...` : '準備中...')}</span></> : <><Play className="w-5 h-5" />確認翻譯</>}
          </button>
          {props.isTranslating && (
            <button type="button" onClick={props.onCancel} className="w-full py-2.5 px-4 border border-slate-700 bg-white text-slate-500 hover:text-red-500 hover:border-red-300 rounded-xl text-sm font-medium flex items-center justify-center gap-2 transition-colors">
              <X className="w-4 h-4" />停止並保留進度
            </button>
          )}
        </div>
      ) : (
        <button onClick={props.onConvert} disabled={!props.canTranslate || props.isExtracting || props.isTranslating} className="w-full py-3.5 px-4 bg-blue-600 hover:bg-blue-500 text-white rounded-xl font-medium flex items-center justify-center gap-2 transition-all shadow-[0_0_15px_rgba(37,99,235,0.3)] hover:shadow-[0_0_20px_rgba(37,99,235,0.5)] border border-blue-400/50 disabled:opacity-50 disabled:cursor-not-allowed disabled:shadow-none disabled:border-slate-700 disabled:bg-slate-800 disabled:text-slate-500">
          {props.isExtracting ? <><Loader2 className="w-5 h-5 animate-spin text-blue-400" /><span className="text-white">{props.statusMessage || '轉換中...'}</span></> : <><Book className="w-5 h-5" />轉換並下載 EPUB</>}
        </button>
      )}

      {props.activeTab === 'translate' && props.isTranslating && props.totalChunks > 0 && (
        <div className="mt-6 space-y-3">
          <div className="flex justify-between text-sm font-semibold text-slate-400">
            <span>{props.translationStage === 'extracting' ? `提取文字進度: ${progress}%` : props.translationStage === 'analyzing' ? '正在分析文本風格...' : `翻譯進度: ${progress}%`}</span>
            {props.estimatedRemainingTime !== null && props.translationStage === 'translating' && <span className="text-blue-400">預計剩餘: {Math.floor(props.estimatedRemainingTime / 60)} 分 {props.estimatedRemainingTime % 60} 秒</span>}
          </div>
          <div className="w-full bg-slate-950 rounded-full h-3 overflow-hidden shadow-inner border border-slate-800">
            <div className="bg-blue-500 h-full transition-all duration-500 ease-out relative shadow-[0_0_10px_rgba(59,130,246,0.8)]" style={{ width: `${progress}%` }}><div className="absolute inset-0 bg-white/20 animate-pulse" /></div>
          </div>
          {props.translationStyle && (
            <div className="mt-4 p-3 bg-indigo-950/30 border border-indigo-900/50 text-indigo-300 rounded-lg text-sm flex items-start gap-2">
              <FileText className="w-5 h-5 shrink-0 mt-0.5 text-indigo-400" />
              <div className="flex-1 overflow-hidden"><div className="font-semibold text-indigo-200 mb-1">AI 偵測翻譯風格：</div><div className="prose prose-sm prose-invert max-w-none"><Suspense fallback={<div className="text-sm text-slate-500">正在載入預覽...</div>}><MarkdownPreview>{props.translationStyle}</MarkdownPreview></Suspense></div></div>
            </div>
          )}
        </div>
      )}

      {props.error && <div className="mt-4 p-3 bg-red-950/30 border border-red-900/50 text-red-400 rounded-lg text-sm flex items-start gap-2"><AlertCircle className="w-5 h-5 shrink-0 mt-0.5" /><div className="flex-1 min-w-0"><p className="break-words whitespace-pre-wrap">{props.error}</p></div></div>}
    </div>
  );
}
