import type { TranslationWorkspace } from '../hooks/useTranslationWorkspace';
import DocumentUploadDropzone from './DocumentUploadDropzone';
import EpubMetadataSettings from './EpubMetadataSettings';
import ModelSelectionPanel from './ModelSelectionPanel';
import TranslationQualitySettings from './TranslationQualitySettings';

export default function WorkspaceSettings({ w }: { w: TranslationWorkspace }) {
  const busy = w.isTranslating || w.isExtracting;
  return <>
    <section id="workspace-upload" tabIndex={-1} className="app-card upload-card">
      <div className="section-heading"><span className="step-badge">1</span><div><h2>上傳文件</h2><p>PDF 或 Markdown，從這裡開始</p></div></div>
      <DocumentUploadDropzone file={w.file} totalPages={w.totalPages} onFile={w.handleFileUpload} disabled={busy} />
      {(w.file || w.extractedText) && <div className="document-facts">
        <span>{w.file ? w.file.name.split('.').pop()?.toUpperCase() : '本機歷史文件'}</span>
        <span>{w.isCalculating ? '分析文件中…' : w.tokenCount !== null ? `約 ${w.tokenCount.toLocaleString()} tokens` : '待擷取後確認長度'}</span>
        {w.extractedText && <span>已讀取 {w.extractedText.length.toLocaleString()} 字元</span>}
      </div>}
      {!w.file && w.customTitle && <p className="muted">{w.customTitle}</p>}
      <p className="muted mt-3">文件保存在此瀏覽器；AI 翻譯使用你提供的金鑰。</p>
    </section>
    {w.activeTab === 'translate' && <ModelSelectionPanel selectedModel={w.selectedModel} selectedModelData={w.selectedModelData} disabled={busy} budgetUsd={w.translationBudgetUsd} spentUsd={w.actualCost.totalUsd} retryLimit={w.translationRetryLimit} estimatedUsd={w.costForecast.remainingUsd} onModelChange={w.setSelectedModel} onBudgetChange={w.setTranslationBudgetUsd} onRetryLimitChange={w.setTranslationRetryLimit} />}
    <section className="app-card preferences-card">
      <div className="section-heading"><div><h2>{w.activeTab === 'translate' ? '翻譯偏好' : '設定 EPUB'}</h2><p>常用設定在前，細節按需展開</p></div></div>
      {w.activeTab === 'translate' ? <>
        <TranslationQualitySettings documentType={w.documentType} chapterProofreading={w.chapterProofreading} disabled={busy} onDocumentTypeChange={w.setDocumentType} onChapterProofreadingChange={w.setChapterProofreading} />
        <details className="disclosure"><summary>進階翻譯設定</summary><fieldset disabled={busy} className="settings-fields">
          <label className="check-option"><input type="checkbox" checked={w.splitTranslation} onChange={e => w.setSplitTranslation(e.target.checked)} />拆分長文件（建議）</label>
          <p className="muted">長文件分段可降低超出模型字數限制的風險；短文件可關閉。</p>
          <label>自訂翻譯指示（選填）<textarea value={w.customInstructions} onChange={e => w.setCustomInstructions(e.target.value)} placeholder="例如：主角譯為「約翰」，保持幽默語氣。" rows={4} /></label>
        </fieldset></details>
      </> : <label className="settings-fields">自訂書名（選填）<input value={w.customTitle} onChange={e => w.setCustomTitle(e.target.value)} placeholder={w.file?.name || '未命名文件'} /></label>}
      <details className="disclosure"><summary>下載與書籍資訊</summary>
        {w.activeTab === 'translate' && <label className="settings-fields">完成後自動下載<select value={w.autoDownload} onChange={e => w.setAutoDownload(e.target.value as 'none' | 'md' | 'epub' | 'pdf')}><option value="none">無</option><option value="md">Markdown</option><option value="epub">EPUB</option><option value="pdf">PDF</option></select></label>}
        <EpubMetadataSettings authorName={w.authorName} setAuthorName={w.setAuthorName} coverImage={w.coverImage} setCoverImage={w.setCoverImage} showToast={w.showToast} />
      </details>
    </section>
  </>;
}
