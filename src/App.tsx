import { useEffect, useState } from 'react';
import { useTranslationWorkspace } from './hooks/useTranslationWorkspace';
import AppToast from './components/AppToast';
import ApiKeyModal from './components/ApiKeyModal';
import { DeleteHistoryDialog, HistoryModal } from './components/HistoryDialogs';
import InfoModal from './components/InfoModal';
import TranslationCostSummary from './components/TranslationCostSummary';
import WorkspaceHeader from './components/WorkspaceHeader';
import WorkspaceSettings from './components/WorkspaceSettings';
import WorkspaceProgress from './components/WorkspaceProgress';
import WorkspaceRunBar from './components/WorkspaceRunBar';
import DocumentResultPanel from './components/DocumentResultPanel';

export default function App() {
  const w = useTranslationWorkspace();
  const [mobileView, setMobileView] = useState('settings');
  const [focusMode, setFocusMode] = useState(false);
  const go = (action: string) => {
    if (action === 'keys') { w.setShowKeyModal(true); return; }
    setFocusMode(false);
    setMobileView(action === 'results' ? 'results' : action === 'progress' ? 'progress' : 'settings');
    requestAnimationFrame(() => {
      const target = action === 'budget' ? document.querySelector<HTMLElement>('[aria-label="翻譯費用上限"]') : document.getElementById(action === 'results' ? 'workspace-results' : action === 'progress' ? 'workspace-progress' : 'workspace-upload');
      target?.scrollIntoView({ block: 'center', behavior: 'auto' });
      target?.focus({ preventScroll: true });
    });
  };
  useEffect(() => {
    if (w.error && !w.showKeyModal) go('progress');
  }, [w.error, w.showKeyModal]);
  useEffect(() => {
    if (w.isTranslating) setMobileView('progress');
  }, [w.isTranslating]);
  return <div className={`app-shell min-h-screen ${focusMode ? 'focus-mode' : ''}`} data-mobile-view={mobileView}>
    <AppToast toast={w.toast} onClose={() => w.setToast(null)} />
    <WorkspaceHeader isIframe={w.isIframe} provider={w.selectedModelData.provider} hasGoogleKey={w.isManualKeyActive} hasOpenaiKey={w.isOpenaiKeyActive} onShowInfo={() => w.setShowInfoModal(true)} onShowKeys={() => w.setShowKeyModal(true)} onShowHistory={() => w.setShowHistory(true)} />
    <main className="app-main max-w-[1440px] mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="workspace-intro print:hidden"><div><p className="eyebrow">YOUR DOCUMENT, A NEW CHAPTER</p><h2>把每份文件，讀成你的語言。</h2><p className="muted">上傳、翻譯、安心閱讀。長篇文件也能一步步完成。</p></div><span className="intro-tag">文件翻譯工作台</span></div>
      <div className="workspace-navigation print:hidden">
        <div className="mode-switch inline-flex gap-1 p-1 rounded-xl">
          <button disabled={w.isTranslating || w.isExtracting} onClick={() => w.setActiveTab('translate')} data-testid="tab-translate" className={w.activeTab === 'translate' ? 'is-active' : ''}>PDF 翻譯</button>
          <button disabled={w.isTranslating || w.isExtracting} onClick={() => w.setActiveTab('converter')} data-testid="tab-converter" className={w.activeTab === 'converter' ? 'is-active' : ''}>文件轉換器</button>
        </div>
        <p className="muted desktop-hint">01 上傳文件　／　02 調整設定　／　03 開始翻譯</p>
      </div>
      <nav className="mobile-workspace-tabs print:hidden" aria-label="工作區切換">
        {([['settings', '設定'], ['progress', '進度'], ['results', '結果']] as const).map(([id, title]) => <button key={id} aria-pressed={mobileView === id} onClick={() => setMobileView(id)}>{title}{id === 'progress' && w.error ? ' · 待處理' : ''}</button>)}
      </nav>
      <div className="workspace-grid">
        <aside className="control-rail"><div className="settings-region"><WorkspaceSettings w={w} /></div>
          <div className="progress-region"><WorkspaceProgress w={w} onAction={go} />
            {w.activeTab === 'translate' && (w.file || w.extractedText) && <div className="app-card cost-card"><TranslationCostSummary resumeInsights={w.resumeInsights} isCalculating={w.isCalculating} documentTokens={w.tokenCount} forecast={w.costForecast} costBreakdown={w.costBreakdown} actualUsage={w.actualUsage} actualCost={w.actualCost} /></div>}
          </div>
        </aside>
        <DocumentResultPanel activeTab={w.activeTab} translatedText={w.translatedText} extractedText={w.extractedText} isTranslating={w.isTranslating} isExtracting={w.isExtracting} isCopying={w.isCopying} isDownloadingEpub={w.isDownloadingEpub} isDownloadingPdf={w.isDownloadingPdf} statusMessage={w.statusMessage} translationStage={w.translationStage} onCopy={w.handleCopyText} onDownloadEpub={() => w.downloadEpub()} onDownloadMarkdown={w.handleDownloadMarkdown} onDownloadPdf={w.downloadPdf} focusMode={focusMode} onFocusMode={setFocusMode} />
      </div>
    </main>
    <WorkspaceRunBar w={w} onBudget={() => go('budget')} onProgress={() => go('progress')} />
    {w.showHistory && <HistoryModal busy={w.isTranslating || w.isExtracting} onRefresh={w.loadHistory} records={w.history} currentFileId={w.currentFileId} onClose={() => w.setShowHistory(false)} onLoad={w.handleLoadHistory} onRequestDelete={w.handleDeleteHistory} />}
    {w.historyToDelete && <DeleteHistoryDialog onCancel={() => w.setHistoryToDelete(null)} onConfirm={w.confirmDeleteHistory} />}
    {w.showInfoModal && <InfoModal onClose={() => w.setShowInfoModal(false)} />}
    {w.showKeyModal && <ApiKeyModal googleKey={w.manualApiKey} openaiKey={w.manualOpenaiApiKey} rememberOnDevice={w.rememberApiKeys} setGoogleKey={w.setManualApiKey} setOpenaiKey={w.setManualOpenaiApiKey} setRememberOnDevice={w.setRememberApiKeys} onClose={() => w.setShowKeyModal(false)} onSave={w.handleSaveApiKeys} />}
  </div>;
}
