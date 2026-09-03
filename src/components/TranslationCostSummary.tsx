import { DollarSign, Loader2 } from 'lucide-react';
import { getModelConfig, USD_TO_TWD } from '../lib/models';
import { COST_STAGE_LABELS, type CostBreakdown, type forecastDocumentCost } from '../lib/cost-forecast';

type Props = {
  isCalculating: boolean;
  documentTokens: number | null;
  forecast: ReturnType<typeof forecastDocumentCost>;
  costBreakdown: CostBreakdown[];
  actualUsage: {
    inputTokens: number; cachedInputTokens: number; cacheWriteInputTokens: number;
    outputTokens: number; reasoningTokens: number;
  };
  actualCost: { inputUsd: number; outputUsd: number; totalUsd: number; totalTwd: number };
};
const usd = (value: number) => '$' + value.toFixed(4);

export default function TranslationCostSummary({
  isCalculating, documentTokens, forecast, costBreakdown, actualUsage, actualCost,
}: Props) {
  const rows = [...costBreakdown];
  for (const planned of forecast.rows) {
    if (!rows.some(row => row.stage === planned.stage && row.model === planned.model)) {
      rows.push({ ...planned, inputUsd: 0, outputUsd: 0 });
    }
  }
  const hasUsage = actualUsage.inputTokens > 0 || actualUsage.outputTokens > 0;
  return (
    <section className="mt-6 bg-slate-950/50 rounded-xl p-4 border border-slate-800 shadow-inner" aria-label="文件成本預測">
      <h3 className="text-sm font-medium text-slate-300 mb-3 flex items-center gap-1.5">
        <DollarSign className="w-4 h-4 text-emerald-500" />文件成本
      </h3>
      {isCalculating ? (
        <p className="flex items-center gap-2 text-xs text-slate-500 mb-3"><Loader2 className="w-4 h-4 animate-spin" />正在讀取原文估算...</p>
      ) : (
        <p className="text-xs text-slate-500 mb-3">{documentTokens === null
          ? '原文長度尚未確認；掃描或無法讀取的 PDF 將於擷取完成後估算，不以檔案大小推算。'
          : '原文約 ' + documentTokens.toLocaleString() + ' tokens（文字估算，非供應商精確計數）'}</p>
      )}
      <div className="space-y-2 text-sm">
        <div className="flex justify-between gap-2"><span className="text-slate-500">已花費（累積）</span><span className="font-medium text-blue-400">{usd(actualCost.totalUsd)} USD</span></div>
        <div className="flex justify-between gap-2"><span className="text-slate-500">剩餘預估</span><span className="text-slate-300">{forecast.known ? '~' + usd(forecast.remainingUsd) + ' USD' : '待擷取後估算'}</span></div>
        <div className="flex justify-between gap-2 pt-2 border-t border-slate-800 font-semibold text-emerald-400"><span>預計完成總額</span><span>{forecast.known ? '~' + usd(forecast.totalUsd) + ' USD' : '尚無可靠估算'}</span></div>
        {forecast.known && <>
          <p className="text-xs text-slate-500 text-right">約 NT$ {(forecast.totalUsd * USD_TO_TWD).toFixed(2)}（換算參考）</p>
          <p className="text-xs text-slate-500">規劃範圍：{usd(forecast.lowUsd)}–{usd(forecast.highUsd)} USD</p>
        </>}
        <p className="text-xs text-slate-500">{forecast.calibrated
          ? '已依最近 ' + forecast.sampleCount + ' 個同設定完成段落的實際成本校正。'
          : '先依各階段、模型與上下文估算；完成至少 3 段後，逐步加入實測校正。'}</p>
        <p className="text-[11px] text-slate-500">範圍為規劃參考，非統計信賴區間或最高費用保證。推理、補修與重試可能超出預期；已花費依 API 回報用量及內建價格計算，最終以供應商帳單為準。</p>
      </div>
      {(rows.length > 0 || hasUsage) && (
        <details className="mt-4 border-t border-slate-800 pt-3">
          <summary className="cursor-pointer text-xs font-medium text-slate-400">查看階段／模型與用量明細</summary>
          <table className="w-full mt-3 text-[11px] text-slate-400">
            <caption className="text-left mb-2">右欄是剩餘階段的基礎估算；實測校正在表格下方另列。</caption>
            <thead><tr><th className="text-left font-medium">階段／模型</th><th className="text-right font-medium">已花費</th><th className="text-right font-medium">基礎估算</th></tr></thead>
            <tbody>{rows.map(row => {
              const planned = forecast.rows.find(p => p.stage === row.stage && p.model === row.model);
              return <tr key={row.stage + ':' + row.model} className="border-t border-slate-800">
                <td className="py-2 pr-1">{COST_STAGE_LABELS[row.stage]}<span className="block text-[10px] text-slate-500">{row.model === 'unknown' ? '舊紀錄模型未分類' : getModelConfig(row.model).name}</span></td>
                <td className="text-right align-top py-2 whitespace-nowrap">{usd(row.inputUsd + row.outputUsd)}</td>
                <td className="text-right align-top py-2 whitespace-nowrap">{forecast.known ? usd(planned ? planned.inputUsd + planned.outputUsd : 0) : '—'}</td>
              </tr>;
            })}</tbody>
          </table>
          {forecast.calibrated && <p className="text-xs text-slate-500 mt-2">實測校正：{forecast.calibrationUsd >= 0 ? '+' : '−'}{usd(Math.abs(forecast.calibrationUsd))}</p>}
          {forecast.inFlightCreditUsd > 0 && <p className="text-xs text-slate-500 mt-2">扣除進行中段落已計費部分：−{usd(forecast.inFlightCreditUsd)}</p>}
          {hasUsage && <div className="text-xs text-slate-500 space-y-1 mt-3 pt-3 border-t border-slate-800">
            <p>累積輸入：{actualUsage.inputTokens.toLocaleString()} tokens</p>
            <p>快取命中／寫入：{actualUsage.cachedInputTokens.toLocaleString()}／{actualUsage.cacheWriteInputTokens.toLocaleString()}</p>
            <p>計費輸出：{actualUsage.outputTokens.toLocaleString()} tokens</p>
            <p>其中推理／思考：{actualUsage.reasoningTokens.toLocaleString()} tokens（已含於輸出）</p>
          </div>}
        </details>
      )}
    </section>
  );
}
