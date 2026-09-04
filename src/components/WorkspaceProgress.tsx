import { lazy, Suspense } from 'react';
import type { TranslationWorkspace } from '../hooks/useTranslationWorkspace';
import { documentProgress, recoveryAdvice, STAGE_LABELS } from '../lib/workspace-presentation';
const MarkdownPreview = lazy(() => import('./MarkdownPreview'));
export default function WorkspaceProgress({ w, onAction }: { w: TranslationWorkspace; onAction: (action: string) => void }) {
  const progress = documentProgress(w.completedCostChunks, w.totalChunks, w.translationStage);
  const advice = w.error ? recoveryAdvice(w.error) : null;
  const extracting = w.translationStage === 'extracting';
  return <section id="workspace-progress" tabIndex={-1} data-testid="translation-status" data-stage={w.translationStage} className="app-card action-card progress-card">
    <div className="section-heading"><span className="step-badge">3</span><div><h2>執行進度</h2><p>每個步驟都看得見</p></div><span className={`state-pill state-${w.translationStage}`}>{STAGE_LABELS[w.translationStage]}</span></div>
    <div className="progress-overview"><strong>{extracting ? '正在準備原文' : `整份翻譯 ${progress}%`}</strong><span>{extracting ? `已擷取 ${w.currentChunk}／${w.totalChunks || '—'} 頁` : `已完成 ${w.completedCostChunks}／${w.totalChunks || '—'} 段`}</span></div>
    <progress aria-label={extracting ? '原文擷取進度' : '整份翻譯進度'} value={extracting ? w.currentChunk : progress} max={extracting ? w.totalChunks || 1 : 100} />
    <div className="stage-track" aria-label="翻譯流程"><span className={extracting ? 'active' : ''}>擷取</span><span className={w.translationStage === 'analyzing' ? 'active' : ''}>分析</span><span className={['translating','correcting','repairing','semantic_review','chapter_review'].includes(w.translationStage) ? 'active' : ''}>翻譯與校稿</span><span className={['saving','completed'].includes(w.translationStage) ? 'active' : ''}>保存</span></div>
    <p className="current-operation" role="status">{w.statusMessage || (w.translationStage === 'completed' ? '已完成，可在結果區匯出文件。' : '確認設定後，使用下方按鈕開始。')}</p>
    {w.isTranslating && !extracting && w.currentChunk > 0 && <p className="muted">目前第 {w.currentChunk} 段 · {STAGE_LABELS[w.translationStage]}。複審與補修仍屬於同一段，不代表重新翻譯整份文件。</p>}
    {w.isTranslating && w.estimatedRemainingTime !== null && <p className="muted">預計剩餘約 {Math.ceil(w.estimatedRemainingTime / 60)} 分鐘；重試與校稿可能延長時間。</p>}
    <p className={`save-status ${w.saveStatus === 'error' ? 'warning-text' : ''}`} role="status">{w.saveStatus === 'error' ? '最新進度儲存失敗，請勿關閉此頁，先匯出可用內容。' : w.saveStatus === 'saving' ? '正在保存進度…' : w.lastSavedAt ? `最近保存：${new Date(w.lastSavedAt).toLocaleTimeString('zh-TW')} · 本機瀏覽器` : '尚無本次文件的保存紀錄'}</p>
    <p className="muted">關閉瀏覽器不會在背景繼續翻譯。請先停止，待保存完成後再離開。</p>
    {w.translationStyle && <details className="disclosure"><summary>查看偵測的翻譯風格</summary><Suspense fallback={<p>載入中…</p>}><MarkdownPreview>{w.translationStyle}</MarkdownPreview></Suspense></details>}
    {advice && <div className="recovery-card" role="alert"><h3>{advice.title}</h3><p>{advice.detail}</p>{advice.action !== 'none' && <button className="secondary-button" onClick={() => onAction(advice.action)}>{advice.label}</button>}<details><summary>查看詳細原因</summary><p className="error-detail">{w.error}</p></details></div>}
  </section>;
}
