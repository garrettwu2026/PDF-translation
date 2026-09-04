import type { TranslationStage } from './translation-state-machine';
export const STAGE_LABELS: Record<TranslationStage, string> = {
  idle: '準備開始', extracting: '擷取原文', analyzing: '分析風格與用詞',
  translating: '產生初稿', correcting: '校正譯文', repairing: '補修漏譯',
  semantic_review: '語意複審', chapter_review: '章節一致性校稿', saving: '保存結果',
  paused: '已暫停', completed: '翻譯完成', failed: '需要處理',
};
export function documentProgress(completed: number, total: number, stage: TranslationStage) {
  if (stage === 'extracting' || stage === 'analyzing' || total <= 0) return 0;
  return Math.max(0, Math.min(stage === 'completed' ? 100 : 99, Math.floor(completed / total * 100)));
}
export function recoveryAdvice(error: string) {
  if (/儲存|storage|QuotaExceededError|IndexedDB/i.test(error)) return { title: '本機儲存需要處理', detail: '請先匯出可用譯文，再確認瀏覽器儲存空間。不要清除網站資料；最新進度可能尚未保存。', action: 'results', label: '查看可匯出結果' };
  if (/API 用量或速率|429|rate.?limit|quota exceeded|resource exhausted/i.test(error)) return { title: '供應商額度或速率受限', detail: '請稍後重試，或到供應商平台確認額度。提高這裡的文件預算不會解除供應商限制。', action: 'none', label: '' };
  if (/費用.*上限|USD.*上限|上限.*USD|預算|budget/i.test(error)) return { title: '文件預算不足', detail: '檢查已花費與剩餘預估，調整上限後再按確認翻譯。調整上限不會自動發送請求。', action: 'budget', label: '調整上限' };
  if (/API Key|金鑰|認證|401|authentication/i.test(error)) return { title: '請檢查 API 金鑰', detail: '確認已填入所選供應商的有效金鑰，再重新執行。', action: 'keys', label: '開啟金鑰設定' };
  if (/擷取尚未完成|原始 PDF|原文件/i.test(error)) return { title: '需要原始文件', detail: '請重新上傳相同 PDF，保留已完成的擷取與翻譯紀錄。', action: 'upload', label: '回到上傳區' };
  if (/執行鎖|其他分頁|另一個分頁/i.test(error)) return { title: '文件正在其他分頁使用', detail: '先在另一個分頁停止此文件的翻譯，再回來重試。', action: 'none', label: '' };
  return { title: '這次處理未完成', detail: '請查看下方原因與保存狀態。確認網路或設定後，可使用下方按鈕重試；不會自動重新開始。', action: 'none', label: '' };
}
/** Display-only paragraph ordering, never used for translation or omission checks. */
export function comparisonParagraphs(text: string) {
  return text.trim() ? text.trim().split(/\n\s*\n/).filter(Boolean) : [];
}
export function documentHeadings(text: string) {
  const lines = text.split('\n');
  const headings: { id: string; title: string; level: number }[] = [];
  let fence = '';
  lines.forEach((line, i) => {
    const marker = line.match(/^ {0,3}(`{3,}|~{3,})/);
    if (marker) {
      if (!fence) fence = marker[1];
      else if (marker[1][0] === fence[0] && marker[1].length >= fence.length && /^ {0,3}(`+|~+)\s*$/.test(line)) fence = '';
      return;
    }
    if (fence) return;
    const atx = line.match(/^ {0,3}(#{1,6})\s+(.+?)\s*#*\s*$/);
    if (atx) headings.push({ id: `reading-line-${i + 1}`, title: atx[2], level: atx[1].length });
    else if (i > 0 && /^ {0,3}(=+|-+)\s*$/.test(line) && lines[i - 1].trim() && !/^[#>|\s*-]/.test(lines[i - 1])) headings.push({ id: `reading-line-${i}`, title: lines[i - 1].trim(), level: line.trim()[0] === '=' ? 1 : 2 });
  });
  return headings;
}
