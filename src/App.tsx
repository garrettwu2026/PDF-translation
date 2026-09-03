import EpubMetadataSettings from './components/EpubMetadataSettings';
import { useTranslationWorkspace } from './hooks/useTranslationWorkspace';
import AppToast from './components/AppToast';
import ApiKeyModal from './components/ApiKeyModal';
import { DeleteHistoryDialog, HistoryModal } from './components/HistoryDialogs';
import InfoModal from './components/InfoModal';
import ModelSelectionPanel from './components/ModelSelectionPanel';
import TranslationCostSummary from './components/TranslationCostSummary';
import TranslationQualitySettings from './components/TranslationQualitySettings';
import DocumentUploadDropzone from './components/DocumentUploadDropzone';
import WorkspaceHeader from './components/WorkspaceHeader';
import TranslationActionPanel from './components/TranslationActionPanel';
import DocumentResultPanel from './components/DocumentResultPanel';

export default function App() {
  const {
    activeTab, setActiveTab, customTitle, setCustomTitle,
    customInstructions, setCustomInstructions, isExtracting, extractedText,
    selectedModel, setSelectedModel, splitTranslation, setSplitTranslation,
    file, tokenCount, translationBudgetUsd, setTranslationBudgetUsd,
    translationRetryLimit, setTranslationRetryLimit, isCalculating, isTranslating,
    translationStage, currentChunk, totalChunks, totalPages,
    translatedText, translationStyle, statusMessage, documentType,
    setDocumentType, chapterProofreading, setChapterProofreading, toast,
    setToast, autoDownload, setAutoDownload, isIframe,
    history, showHistory, setShowHistory, historyToDelete,
    setHistoryToDelete, coverImage, setCoverImage, authorName,
    setAuthorName, currentFileId, handleLoadHistory, handleDeleteHistory,
    confirmDeleteHistory, showToast, isCopying, isDownloadingEpub,
    isDownloadingPdf, handleCopyText, downloadEpub, handleDownloadMarkdown,
    downloadPdf, error, manualApiKey, setManualApiKey,
    isManualKeyActive, manualOpenaiApiKey, setManualOpenaiApiKey, isOpenaiKeyActive,
    rememberApiKeys, setRememberApiKeys, showKeyModal, setShowKeyModal,
    showInfoModal, setShowInfoModal, estimatedRemainingTime, actualCost,
    costBreakdown, handleSaveApiKeys, handleFileUpload, handleTranslate,
    handleCancelTranslation, handlePdfToEpub, selectedModelData, costForecast,
    actualUsage,
  } = useTranslationWorkspace();
  return (
    <div className="app-shell min-h-screen bg-slate-950 text-slate-100 font-sans">
      <AppToast toast={toast} onClose={() => setToast(null)} />

      <WorkspaceHeader
        isIframe={isIframe}
        provider={selectedModelData.provider}
        hasGoogleKey={isManualKeyActive}
        hasOpenaiKey={isOpenaiKeyActive}
        onShowInfo={() => setShowInfoModal(true)}
        onShowKeys={() => setShowKeyModal(true)}
        onShowHistory={() => setShowHistory(true)}
      />

      <main className="app-main max-w-[1440px] mx-auto px-4 sm:px-6 lg:px-8 py-8 print:p-0 print:m-0 print:max-w-none">
        <div className="workspace-intro mb-7 print:hidden">
          <div>
            <p className="eyebrow">AI DOCUMENT WORKSPACE</p>
            <h2 className="text-2xl sm:text-3xl font-semibold tracking-tight text-slate-100 mt-1">把文件變成好讀的繁體中文</h2>
            <p className="text-sm text-slate-500 mt-2">上傳檔案、選擇模型，剩下的交給我們。</p>
          </div>
        </div>
        <div className="mode-switch inline-flex gap-1 mb-8 p-1 rounded-xl print:hidden">
          <button
            onClick={() => setActiveTab('translate')}
            data-testid="tab-translate"
            className={`px-4 py-2.5 rounded-lg text-sm font-medium transition-all ${activeTab === 'translate' ? 'is-active text-blue-400' : 'text-slate-400 hover:text-slate-300'}`}
          >
            PDF 翻譯
          </button>
          <button
            onClick={() => setActiveTab('converter')}
            data-testid="tab-converter"
            className={`px-4 py-2.5 rounded-lg text-sm font-medium transition-all ${activeTab === 'converter' ? 'is-active text-blue-400' : 'text-slate-400 hover:text-slate-300'}`}
          >
            文件轉換器
          </button>
        </div>

        <div className="workspace-grid grid grid-cols-1 lg:grid-cols-12 gap-6 print:block print:gap-0">

          <div className="control-rail lg:col-span-5 xl:col-span-4 space-y-5 print:hidden">

            {activeTab === 'translate' && (
              <ModelSelectionPanel
                selectedModel={selectedModel}
                selectedModelData={selectedModelData}
                disabled={isTranslating}
                budgetUsd={translationBudgetUsd}
                spentUsd={actualCost.totalUsd}
                retryLimit={translationRetryLimit}
                estimatedUsd={costForecast.remainingUsd}
                onModelChange={setSelectedModel}
                onBudgetChange={setTranslationBudgetUsd}
                onRetryLimitChange={setTranslationRetryLimit}
              />
            )}

            <div className="app-card upload-card bg-slate-900 p-6 rounded-2xl shadow-lg shadow-black/20 border border-slate-800">
              <div className="section-heading">
                <div className="step-badge">
                  {activeTab === 'translate' ? '2' : '1'}
                </div>
                <div>
                  <h2 className="text-lg font-semibold text-slate-200">上傳文件</h2>
                  <p className="text-xs text-slate-500 mt-0.5">支援 PDF 與 Markdown</p>
                </div>
              </div>

              <DocumentUploadDropzone file={file} totalPages={totalPages} onFile={handleFileUpload} />

              {activeTab === 'translate' && (
                <div className="mt-4 space-y-4">
                  <div className="friendly-option flex items-start gap-3 p-3 bg-slate-950/50 border border-slate-800 rounded-xl">
                    <div className="flex items-center h-5 mt-0.5">
                      <input
                        id="split-translation"
                        type="checkbox"
                        checked={splitTranslation}
                        onChange={(e) => setSplitTranslation(e.target.checked)}
                        className="w-4 h-4 text-blue-600 bg-slate-900 border-slate-700 rounded focus:ring-blue-500 focus:ring-2"
                      />
                    </div>
                    <div className="flex-1 text-sm">
                      <label htmlFor="split-translation" className="font-medium text-slate-300 cursor-pointer block mb-1">
                        拆分長文件 (建議)
                      </label>
                      <div className="text-slate-500 space-y-1 text-xs">
                        <p><span className="text-emerald-400/80 font-medium">勾選 (拆分)：</span>適合長文件，可避免翻譯因字數過多而中斷，但段落交界處可能不夠通順。</p>
                        <p><span className="text-amber-400/80 font-medium">不勾選 (不拆分)：</span>適合短文件，上下文連貫性最佳，但過長的文件可能因字數限制而中斷或失敗。</p>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center justify-between text-sm">
                    <span className="text-slate-400 font-medium">翻譯完成後自動下載：</span>
                    <select
                      value={autoDownload}
                      onChange={(e) => setAutoDownload(e.target.value as any)}
                      className="bg-slate-950 border border-slate-700 text-slate-300 rounded-lg px-3 py-1.5 focus:ring-2 focus:ring-blue-500 outline-none"
                    >
                      <option value="none">無</option>
                      <option value="md">Markdown</option>
                      <option value="epub">EPUB</option>
                      <option value="pdf">PDF</option>
                    </select>
                  </div>
                </div>
              )}

              <EpubMetadataSettings
                authorName={authorName} setAuthorName={setAuthorName}
                coverImage={coverImage} setCoverImage={setCoverImage} showToast={showToast}
              />

              {activeTab === 'translate' && (file || extractedText) && (
                <TranslationCostSummary
                  isCalculating={isCalculating}
                  documentTokens={tokenCount}
                  forecast={costForecast}
                  costBreakdown={costBreakdown}
                  actualUsage={actualUsage}
                  actualCost={actualCost}
                />
              )}
            </div>

            {activeTab === 'converter' && (
              <div className="app-card converter-card bg-slate-900 p-6 rounded-2xl shadow-lg shadow-black/20 border border-slate-800">
                <div className="section-heading">
                  <div className="step-badge">2</div>
                  <div><h2 className="text-lg font-semibold text-slate-200">設定 EPUB</h2><p className="text-xs text-slate-500 mt-0.5">補上書名與資訊</p></div>
                </div>
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-400 mb-1">自訂書名 (選填)</label>
                    <input
                      type="text"
                      value={customTitle}
                      onChange={(e) => setCustomTitle(e.target.value)}
                      placeholder={file ? file.name.replace('.pdf', '') : '未命名文件'}
                      className="w-full px-4 py-2 bg-slate-950 border border-slate-700 rounded-lg text-sm text-slate-200 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                    />
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'translate' && (
              <div className="app-card preferences-card bg-slate-900 p-6 rounded-2xl shadow-lg shadow-black/20 border border-slate-800">
                <div className="section-heading">
                  <div className="step-badge">3</div>
                  <div><h2 className="text-lg font-semibold text-slate-200">翻譯偏好</h2><p className="text-xs text-slate-500 mt-0.5">有特別需求再填寫即可</p></div>
                </div>
                <div className="space-y-4">
                  <TranslationQualitySettings
                    documentType={documentType}
                    chapterProofreading={chapterProofreading}
                    disabled={isTranslating}
                    onDocumentTypeChange={setDocumentType}
                    onChapterProofreadingChange={setChapterProofreading}
                  />
                  <div>
                    <label className="block text-sm font-medium text-slate-400 mb-1">自訂翻譯指示 (選填)</label>
                    <textarea
                      value={customInstructions}
                      onChange={(e) => setCustomInstructions(e.target.value)}
                      placeholder="例如：請將主角的名字翻譯為「約翰」，並保持幽默的語氣..."
                      className="w-full px-4 py-3 bg-slate-950 border border-slate-700 rounded-lg text-sm text-slate-200 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none resize-none h-24 custom-scrollbar"
                    />
                  </div>
                </div>
              </div>
            )}

            <TranslationActionPanel
              activeTab={activeTab}
              canTranslate={activeTab === 'translate' ? Boolean(file || extractedText) : Boolean(file)}
              isCalculating={isCalculating}
              isTranslating={isTranslating}
              isExtracting={isExtracting}
              statusMessage={statusMessage}
              totalChunks={totalChunks}
              currentChunk={currentChunk}
              translationStage={translationStage}
              estimatedRemainingTime={estimatedRemainingTime}
              translationStyle={translationStyle}
              error={error}
              onTranslate={handleTranslate}
              onCancel={handleCancelTranslation}
              onConvert={handlePdfToEpub}
            />

          </div>

          <DocumentResultPanel
            activeTab={activeTab}
            translatedText={translatedText}
            extractedText={extractedText}
            isTranslating={isTranslating}
            isExtracting={isExtracting}
            isCopying={isCopying}
            isDownloadingEpub={isDownloadingEpub}
            isDownloadingPdf={isDownloadingPdf}
            statusMessage={statusMessage}
            translationStage={translationStage}
            onCopy={handleCopyText}
            onDownloadEpub={() => downloadEpub()}
            onDownloadMarkdown={handleDownloadMarkdown}
            onDownloadPdf={downloadPdf}
          />

        </div>
      </main>

      {showHistory && (
        <HistoryModal
          records={history}
          currentFileId={currentFileId}
          onClose={() => setShowHistory(false)}
          onLoad={handleLoadHistory}
          onRequestDelete={handleDeleteHistory}
        />
      )}

      {historyToDelete && (
        <DeleteHistoryDialog onCancel={() => setHistoryToDelete(null)} onConfirm={confirmDeleteHistory} />
      )}

      {showInfoModal && <InfoModal onClose={() => setShowInfoModal(false)} />}

      {showKeyModal && (
        <ApiKeyModal
          googleKey={manualApiKey}
          openaiKey={manualOpenaiApiKey}
          rememberOnDevice={rememberApiKeys}
          setGoogleKey={setManualApiKey}
          setOpenaiKey={setManualOpenaiApiKey}
          setRememberOnDevice={setRememberApiKeys}
          onClose={() => setShowKeyModal(false)}
          onSave={handleSaveApiKeys}
        />
      )}

    </div>
  );
}
