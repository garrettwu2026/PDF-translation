import { AlertTriangle, CheckCircle2, ExternalLink } from 'lucide-react';
import { getModelCatalogStatus, MODEL_PRICING_SOURCES } from '../lib/models';

const formatDate = (date: string) => date.replaceAll('-', '/');

export default function ModelCatalogNotice() {
  const status = getModelCatalogStatus();
  const Icon = status.needsReview ? AlertTriangle : CheckCircle2;

  return (
    <div className={`mt-4 rounded-xl border p-3 text-xs ${status.needsReview ? 'border-amber-500/30 bg-amber-500/5' : 'border-slate-800 bg-slate-950/40'}`}>
      <div className="flex gap-2">
        <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${status.needsReview ? 'text-amber-400' : 'text-emerald-400'}`} />
        <div className="min-w-0">
          <p className={status.needsReview ? 'font-medium text-amber-300' : 'font-medium text-slate-300'}>
            {status.upcomingPricingReview
              ? `${status.upcomingPricingReview.modelName} 即將需要重新核價`
              : status.daysUntilReview <= 0
                ? '模型與價格資料已到複查日期'
                : `價格已核對，下次複查 ${formatDate(status.nextReview)}`}
          </p>
          <p className="mt-1 leading-relaxed text-slate-500">
            最後核對 {formatDate(status.lastVerified)}；實際帳單仍以供應商為準。
          </p>
          <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1">
            <a className="inline-flex items-center gap-1 text-blue-400 hover:text-blue-300" href={MODEL_PRICING_SOURCES.google} target="_blank" rel="noreferrer">
              Gemini 官方價格 <ExternalLink className="h-3 w-3" />
            </a>
            <a className="inline-flex items-center gap-1 text-blue-400 hover:text-blue-300" href={MODEL_PRICING_SOURCES.openai} target="_blank" rel="noreferrer">
              OpenAI 官方價格 <ExternalLink className="h-3 w-3" />
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
