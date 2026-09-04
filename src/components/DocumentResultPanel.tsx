import { lazy, Suspense, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { BookOpen, ChevronDown, Copy, Download, Loader2, Maximize2, Minimize2 } from 'lucide-react';
import type { TranslationStage } from '../lib/translation-state-machine';
import { comparisonParagraphs, documentHeadings } from '../lib/workspace-presentation';
const MarkdownPreview = lazy(() => import('./MarkdownPreview'));

type Props = {
  activeTab: 'translate' | 'converter'; translatedText: string; extractedText: string;
  isTranslating: boolean; isExtracting: boolean; isCopying: boolean; isDownloadingEpub: boolean; isDownloadingPdf: boolean;
  statusMessage: string; translationStage: TranslationStage;
  onCopy: () => void; onDownloadEpub: () => void; onDownloadMarkdown: () => void; onDownloadPdf: () => void;
  focusMode: boolean; onFocusMode: (value: boolean) => void;
};

export default function DocumentResultPanel(p: Props) {
  const [view, setView] = useState<'translation' | 'source' | 'compare'>('translation');
  const [fontSize, setFontSize] = useState(17);
  const [lineHeight, setLineHeight] = useState(1.9);
  const [paper, setPaper] = useState('warm');
  const [comparePage, setComparePage] = useState(0);
  const exportMenu = useRef<HTMLDetailsElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const content = p.activeTab === 'translate' ? p.translatedText : p.extractedText;
  const sourcePreview = p.activeTab === 'translate' && (view === 'source' || (!content && (p.isTranslating || p.isExtracting)));
  const preview = sourcePreview ? p.extractedText : content;
  const comparing = p.activeTab === 'translate' && view === 'compare';
  const sourceRows = useMemo(() => comparing ? comparisonParagraphs(p.extractedText) : [], [comparing, p.extractedText]);
  const translatedRows = useMemo(() => comparing ? comparisonParagraphs(p.translatedText) : [], [comparing, p.translatedText]);
  const pageCount = Math.max(1, Math.ceil(Math.max(sourceRows.length, translatedRows.length) / 20));
  const currentPage = Math.min(comparePage, pageCount - 1);
  const headings = useMemo(() => documentHeadings(preview), [preview]);
  useEffect(() => { setComparePage(0); }, [p.activeTab, view]);
  useEffect(() => {
    const handle = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (exportMenu.current?.open) { exportMenu.current.open = false; exportMenu.current.querySelector('summary')?.focus(); }
        else if (p.focusMode) p.onFocusMode(false);
      }
    };
    document.addEventListener('keydown', handle);
    return () => document.removeEventListener('keydown', handle);
  }, [p.focusMode, p.onFocusMode]);
  const download = (action: () => void) => { action(); if (exportMenu.current) exportMenu.current.open = false; };
  const navigate = (id: string) => {
    const heading = panelRef.current?.querySelector<HTMLElement>(`#${id}`);
    heading?.scrollIntoView({ block: 'start', behavior: 'auto' });
    heading?.focus({ preventScroll: true });
  };
  return <div id="workspace-results" tabIndex={-1} ref={panelRef} className="result-column">
    <section className="result-panel">
      <header className="result-toolbar print:hidden">
        <div><p className="eyebrow">READING ROOM</p><h2><BookOpen size={19} />{p.activeTab === 'translate' ? '翻譯預覽' : '文字預覽'}</h2></div>
        <div className="reader-actions">
          <button className="icon-button" aria-label="複製全文" title="複製全文" onClick={p.onCopy} disabled={!content || p.isCopying}><Copy size={17} /></button>
          <details className="export-menu" ref={exportMenu}><summary><Download size={16} />匯出<ChevronDown size={14} /></summary><div className="export-options">
            <p>匯出完整{p.activeTab === 'translate' ? '譯文' : '原文'}，不含對照與閱讀設定</p>
            <button onClick={() => download(p.onDownloadEpub)} disabled={!content || p.isTranslating || p.isExtracting || p.isDownloadingEpub}>下載 EPUB</button>
            <button onClick={() => download(p.onDownloadMarkdown)} disabled={!content || p.isTranslating}>下載 MD</button>
            <button onClick={() => download(p.onDownloadPdf)} disabled={!content || p.isTranslating || p.isDownloadingPdf}>下載 PDF</button>
          </div></details>
          <button className="icon-button" aria-label={p.focusMode ? '退出專注閱讀' : '專注閱讀'} title={p.focusMode ? '退出專注閱讀' : '專注閱讀'} onClick={() => p.onFocusMode(!p.focusMode)}>{p.focusMode ? <Minimize2 size={17} /> : <Maximize2 size={17} />}</button>
        </div>
      </header>
      <div className="reader-controls print:hidden">
        {p.activeTab === 'translate' && <div className="reader-views" aria-label="預覽內容">{([['translation','譯文'],['source','原文'],['compare','段落對照']] as const).map(([id,label]) => <button key={id} aria-pressed={view === id} onClick={() => setView(id)}>{label}</button>)}</div>}
        <details className="reading-settings"><summary>閱讀設定</summary><div className="reading-settings-fields">
          <label>字級<select aria-label="閱讀字級" value={fontSize} onChange={e => setFontSize(Number(e.target.value))}><option value={15}>小 · 15</option><option value={17}>標準 · 17</option><option value={20}>大 · 20</option><option value={24}>特大 · 24</option></select></label>
          <label>行距<select aria-label="閱讀行距" value={lineHeight} onChange={e => setLineHeight(Number(e.target.value))}><option value={1.6}>緊湊</option><option value={1.9}>舒適</option><option value={2.2}>寬鬆</option></select></label>
          <label>紙張<select aria-label="閱讀紙張" value={paper} onChange={e => setPaper(e.target.value)}><option value="warm">暖色紙張</option><option value="white">清晰白</option><option value="mint">柔和薄荷</option></select></label>
        </div></details>
      </div>
      {!comparing && headings.length > 0 && <label className="chapter-navigation print:hidden">章節導覽<select aria-label="章節導覽" value="" onChange={e => navigate(e.target.value)}><option value="">跳至章節（{headings.length}）</option>{headings.map(h => <option key={h.id} value={h.id}>{'　'.repeat(Math.min(h.level - 1, 2))}{h.title}</option>)}</select></label>}
      <div className={`reader-scroll paper-${paper}`} style={{ '--reader-font': `${fontSize}px`, '--reader-leading': lineHeight } as CSSProperties}>
        {sourcePreview && !comparing && <p className="preview-notice print:hidden">原文預覽 · 匯出仍使用已完成的譯文</p>}
        {comparing && <div className="comparison-view print:hidden">
          <p className="preview-notice">按空白行分段、依順序並列，非精確逐句對齊。譯文可能合併或拆段；空欄不代表漏譯。</p>
          <div className="compare-pagination"><span>原文 {sourceRows.length} 段 · 譯文 {translatedRows.length} 段</span><div><button disabled={currentPage === 0} onClick={() => setComparePage(currentPage - 1)}>上一頁</button><span>{currentPage + 1}／{pageCount}</span><button disabled={currentPage + 1 >= pageCount} onClick={() => setComparePage(currentPage + 1)}>下一頁</button></div></div>
          {Array.from({ length: Math.min(20, Math.max(sourceRows.length, translatedRows.length) - currentPage * 20) }, (_, offset) => {
            const i = currentPage * 20 + offset;
            return <div className="comparison-row" key={i}><section><h3>原文 · {i + 1}</h3><p>{sourceRows[i] || '此位置無原文段落'}</p></section><section><h3>譯文 · {i + 1}</h3><p>{translatedRows[i] || '此位置尚無譯文段落'}</p></section></div>;
          })}
          {!sourceRows.length && !translatedRows.length && <p className="muted">上傳文件後即可查看對照。</p>}
        </div>}
        {/* Keep a complete canonical export DOM, independent of source/compare view and reader preferences. */}
        <div className="canonical-document" hidden={comparing || sourcePreview}>
          <article id="translation-result-content" className="prose max-w-none"><Suspense fallback={<p>正在載入預覽…</p>}><MarkdownPreview headingPrefix={!comparing && !sourcePreview ? 'reading-line-' : undefined}>{content}</MarkdownPreview></Suspense></article>
        </div>
        {sourcePreview && !comparing && <article className="prose max-w-none"><Suspense fallback={<p>正在載入原文…</p>}><MarkdownPreview headingPrefix="reading-line-">{p.extractedText}</MarkdownPreview></Suspense></article>}
        {!preview && !comparing && <div className="reader-empty"><BookOpen size={48} /><h3>{p.isTranslating || p.isExtracting ? '正在準備你的文件' : '下一段旅程，從一份文件開始'}</h3><p>{p.activeTab === 'translate' ? '上傳文件並確認翻譯，結果會逐段出現在這裡。' : '上傳文件即可預覽文字，再轉換為 EPUB。'}</p><span>PDF · Markdown · EPUB 匯出</span></div>}
        {(p.isTranslating || p.isExtracting) && <p className="reader-live print:hidden"><Loader2 size={16} className="animate-spin" />{p.statusMessage || '處理中…'}</p>}
      </div>
    </section>
  </div>;
}
