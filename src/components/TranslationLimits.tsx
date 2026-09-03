import { ShieldCheck } from 'lucide-react';
import {
  MAX_TRANSLATION_RETRY_LIMIT,
  MIN_TRANSLATION_RETRY_LIMIT,
  clampRetryLimit,
} from '../lib/translation-budget';

type Props = {
  budgetUsd: number;
  spentUsd: number;
  retryLimit: number;
  estimatedUsd: number;
  onBudgetChange: (value: number) => void;
  onRetryLimitChange: (value: number) => void;
};

export default function TranslationLimits({ budgetUsd, spentUsd, retryLimit, estimatedUsd, onBudgetChange, onRetryLimitChange }: Props) {
  const projectedDocumentCost = spentUsd + estimatedUsd;
  const exceedsEstimate = budgetUsd > 0 && projectedDocumentCost > budgetUsd;
  return (
    <div className="mt-4 rounded-xl border border-slate-800 bg-slate-950/50 p-4" data-testid="translation-limits">
      <div className="mb-3 flex items-center gap-2 text-sm font-medium text-slate-300"><ShieldCheck className="h-4 w-4 text-emerald-400" />費用與重試保護</div>
      <div className="grid grid-cols-2 gap-3">
        <label className="text-xs text-slate-500">整份文件上限（USD）
          <input aria-label="翻譯費用上限" type="number" min="0" max="100" step="0.5" value={budgetUsd} onChange={(event) => onBudgetChange(Math.max(0, Number(event.target.value) || 0))} className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200" />
        </label>
        <label className="text-xs text-slate-500">每段最多重試
          <input aria-label="每段重試上限" type="number" min={MIN_TRANSLATION_RETRY_LIMIT} max={MAX_TRANSLATION_RETRY_LIMIT} value={retryLimit} onChange={(event) => onRetryLimitChange(clampRetryLimit(Number(event.target.value)))} className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200" />
        </label>
      </div>
      <p className={`mt-2 text-[11px] ${exceedsEstimate ? 'text-amber-400' : 'text-slate-500'}`}>
        {exceedsEstimate
          ? `已花費 $${spentUsd.toFixed(2)}，加上剩餘預估約 $${projectedDocumentCost.toFixed(2)}，高於目前上限。`
          : `已花費 $${spentUsd.toFixed(2)}；上限會跨續傳累積，設為 0 表示不限額。`}
      </p>
    </div>
  );
}
