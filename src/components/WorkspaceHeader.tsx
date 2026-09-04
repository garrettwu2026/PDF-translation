import { CheckCircle2, ExternalLink, FileText, History, Info, Key, AlertCircle } from 'lucide-react';

type Props = {
  isIframe: boolean;
  provider: 'google' | 'openai';
  hasGoogleKey: boolean;
  hasOpenaiKey: boolean;
  onShowInfo: () => void;
  onShowKeys: () => void;
  onShowHistory: () => void;
};

export default function WorkspaceHeader({
  isIframe,
  provider,
  hasGoogleKey,
  hasOpenaiKey,
  onShowInfo,
  onShowKeys,
  onShowHistory,
}: Props) {
  const hasActiveKey = provider === 'google' ? hasGoogleKey : hasOpenaiKey;
  return (
    <header className="app-header bg-slate-900/80 backdrop-blur-md border-b border-slate-800 sticky top-0 z-10 print:hidden">
      {isIframe && (
        <div className="bg-amber-950/30 border-b border-amber-900/50 px-4 py-2.5 sm:px-6 lg:px-8 flex items-start sm:items-center justify-between gap-4">
          <div className="flex items-start sm:items-center gap-2 text-amber-500 text-sm">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 sm:mt-0" />
            <p>
              <strong>內嵌模式限制：</strong> 受限於瀏覽器的安全機制，<strong className="font-semibold">複製與下載功能可能會失效</strong>。請在新分頁開啟以獲得完整功能。
            </p>
          </div>
          <a
            href={window.location.href}
            target="_blank"
            rel="noopener noreferrer"
            className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 bg-amber-900/50 hover:bg-amber-800/50 text-amber-400 rounded-lg text-xs font-medium transition-colors border border-amber-700/30"
          >
            <ExternalLink className="w-3.5 h-3.5" />
            在新分頁開啟
          </a>
        </div>
      )}
      <div className="max-w-[1440px] mx-auto px-4 sm:px-6 lg:px-8 h-18 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="brand-mark bg-blue-600/20 border border-blue-500/30 p-2.5 rounded-xl">
            <FileText className="w-5 h-5 text-blue-400" />
          </div>
          <div>
            <h1 className="text-lg font-semibold tracking-tight text-slate-100">PDF 翻譯工作台</h1>
            <p className="text-[11px] text-slate-500 mt-0.5">清楚、安心地完成每一份翻譯</p>
          </div>
        </div>
        <div className="header-actions flex items-center gap-2">
          <button aria-label="使用說明" onClick={onShowInfo} className="flex items-center gap-2 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-full text-sm font-medium transition-colors border border-slate-700 shadow-inner">
            <Info className="w-4 h-4" /><span className="hidden sm:inline">使用說明</span>
          </button>
          <button aria-label="API Key 設定" onClick={onShowKeys} data-testid="api-key-button" className="flex items-center gap-2 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-full text-sm font-medium transition-colors border border-slate-700 shadow-inner">
            <Key className="w-4 h-4" /><span className="hidden sm:inline">API Key</span>
          </button>
          <button aria-label="歷史紀錄" onClick={onShowHistory} data-testid="history-button" className="flex items-center gap-2 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-full text-sm font-medium transition-colors border border-slate-700 shadow-inner">
            <History className="w-4 h-4" /><span className="hidden sm:inline">歷史紀錄</span>
          </button>
          {hasActiveKey && (
            <div className="text-sm text-slate-400 flex items-center gap-1.5 bg-slate-800/50 border border-slate-700/50 px-3 py-1.5 rounded-full shadow-inner hidden sm:flex">
              <CheckCircle2 className="w-4 h-4 text-emerald-500" />已綁定 API Key
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
