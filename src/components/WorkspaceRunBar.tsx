import type { TranslationWorkspace } from '../hooks/useTranslationWorkspace';
import { STAGE_LABELS } from '../lib/workspace-presentation';
export default function WorkspaceRunBar({ w, onBudget, onProgress }: { w: TranslationWorkspace; onBudget: () => void; onProgress: () => void }) {
  const busy = w.isTranslating || w.isExtracting;
  return <footer className="run-bar print:hidden" aria-label="費用與執行控制"><div className="run-bar-inner">
    {w.activeTab === 'translate' ? <div className="run-costs">
      <div><span>已花費 · USD</span><strong>${w.actualCost.totalUsd.toFixed(4)}</strong></div>
      <div><span>剩餘預估</span><strong>{w.costForecast.known ? `~$${w.costForecast.remainingUsd.toFixed(2)}` : '待確認'}</strong></div>
      <button className="budget-shortcut" onClick={onBudget}><span>預算上限 · 調整</span><strong>{w.translationBudgetUsd ? `$${w.translationBudgetUsd.toFixed(2)}` : '不限額'}</strong></button>
    </div> : <p>文件轉換 · EPUB</p>}
    <div className="run-buttons"><button className="quiet-button" onClick={onProgress}>{busy ? STAGE_LABELS[w.translationStage] : '查看進度'}</button>
      {w.isTranslating ? <button className="stop-button" onClick={w.handleCancelTranslation}>停止並保留進度</button> : <button className="primary-button" disabled={busy || w.isCalculating || !(w.file || (w.activeTab === 'translate' && w.extractedText))} onClick={w.activeTab === 'translate' ? w.handleTranslate : w.handlePdfToEpub}>{w.activeTab === 'translate' ? '確認翻譯' : busy ? '轉換中…' : '轉換並下載 EPUB'}</button>}
    </div>
  </div></footer>;
}
