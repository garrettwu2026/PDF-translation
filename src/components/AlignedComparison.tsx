import { useMemo, useState } from 'react';
import type { TranslationAlignment } from '../lib/translation-alignment';
import { assessTranslationQuality } from '../lib/translation-quality';

export default function AlignedComparison({rows, source, translation}: {rows: TranslationAlignment[]; source: string; translation: string}) {
  const [page, setPage] = useState(0);
  const [selected, setSelected] = useState('');
  const [warningsOnly, setWarningsOnly] = useState(false);
  const inspect = (row: TranslationAlignment) => {
    const original = source.slice(row.sourceStart, row.sourceEnd);
    const translated = translation.slice(row.translatedStart, row.translatedEnd);
    const issues = row.stale ? [] : assessTranslationQuality(original, translated, {documentType: 'general'}).issues;
    return {...row, original, translated, issues};
  };
  // Normal reading inspects only the visible page, even for book-sized histories.
  const filtered = useMemo(() => warningsOnly ? rows.filter(row => row.stale || inspect(row).issues.length > 0) : rows, [warningsOnly, rows, source, translation]);
  const count = Math.max(1, Math.ceil(filtered.length / 20));
  const current = Math.min(page, count - 1);
  return <div className="comparison-view print:hidden">
    <p className="preview-notice">僅顯示已保存句子 ID 的對應。點選譯文可定位原文；提示供人工核對，不能保證語意完全正確。舊進度與程式碼等保護區塊請於全文檢視。</p>
    <label className="check-option"><input type="checkbox" checked={warningsOnly} onChange={e => {setWarningsOnly(e.target.checked); setPage(0);}} />只看待核對項目</label>
    <div className="compare-pagination"><span>{filtered.length} 組句子對應</span><div><button disabled={current === 0} onClick={() => setPage(current-1)}>上一頁</button><span>{current+1}／{count}</span><button disabled={current+1 >= count} onClick={() => setPage(current+1)}>下一頁</button></div></div>
    {filtered.slice(current*20, current*20+20).map(inspect).map(row => <div className={`comparison-row ${selected === row.id ? 'alignment-selected' : ''}`} key={row.id}>
      <section id={`source-${row.id}`} tabIndex={-1}><h3>原文 · {row.id}</h3><p>{row.original}</p></section>
      <section><h3>譯文 · {row.id}</h3>{row.stale ? <p className="preview-notice">此範圍已經章節校稿修改，精確對應需重新核對。請於全文檢視修訂後譯文。</p> : <button className="aligned-translation" aria-label={`定位原文 ${row.id}`} onClick={() => {
        setSelected(row.id); const target = document.getElementById(`source-${row.id}`); target?.scrollIntoView({block: 'center'}); target?.focus({preventScroll: true});
      }}>{row.translated}</button>}
      {row.issues.length > 0 && <p className="preview-notice">待核對：{row.issues.map(issue => issue.message).join('、')}</p>}</section>
    </div>)}
    {!filtered.length && <p className="muted">目前沒有待核對項目。</p>}
  </div>;
}
