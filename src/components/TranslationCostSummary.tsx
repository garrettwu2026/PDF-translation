import { Clock, DollarSign, Loader2 } from 'lucide-react';
import type { TokenUsage } from '../lib/models';

type CostSummary = {
  inputUsd: number;
  outputUsd: number;
  totalUsd: number;
  totalTwd: number;
};

type Props = {
  isCalculating: boolean;
  documentTokens: number | null;
  estimatedUsage: TokenUsage;
  estimatedCost: CostSummary;
  actualUsage: {
    inputTokens: number;
    cachedInputTokens: number;
    cacheWriteInputTokens: number;
    outputTokens: number;
    reasoningTokens: number;
  };
  actualCost: CostSummary;
};

export default function TranslationCostSummary({
  isCalculating,
  documentTokens,
  estimatedUsage,
  estimatedCost,
  actualUsage,
  actualCost,
}: Props) {
  const hasActualUsage = actualUsage.inputTokens > 0 || actualUsage.outputTokens > 0;

  return (
    <div className="mt-6 bg-slate-950/50 rounded-xl p-4 border border-slate-800 shadow-inner">
      <h3 className="text-sm font-medium text-slate-300 mb-3 flex items-center gap-1.5">
        <DollarSign className="w-4 h-4 text-emerald-500" />
        預估資訊
      </h3>

      {isCalculating ? (
        <div className="flex items-center justify-center py-4 text-slate-500 text-sm gap-2">
          <Loader2 className="w-4 h-4 animate-spin text-blue-500" />
          計算 Token 中...
        </div>
      ) : documentTokens !== null ? (
        <div className="space-y-2 text-sm">
          <div className="flex justify-between"><span className="text-slate-500">文件 Token 數:</span><span className="font-medium text-slate-300">{documentTokens.toLocaleString()}</span></div>
          <div className="flex justify-between"><span className="text-slate-500">預估流程輸入 Token:</span><span className="font-medium text-slate-300">~{estimatedUsage.inputTokens.toLocaleString()}</span></div>
          <div className="flex justify-between"><span className="text-slate-500">預估輸出 Token 數:</span><span className="font-medium text-slate-300">~{estimatedUsage.outputTokens.toLocaleString()}</span></div>
          <div className="pt-2 mt-2 border-t border-slate-800 space-y-1">
            <div className="flex justify-between"><span className="text-slate-500">預估輸入成本:</span><span className="text-slate-300">${estimatedCost.inputUsd.toFixed(4)} USD</span></div>
            <div className="flex justify-between"><span className="text-slate-500">預估輸出成本:</span><span className="text-slate-300">~${estimatedCost.outputUsd.toFixed(4)} USD</span></div>
          </div>
          <p className="pt-1 text-[10px] text-slate-500 italic">* 預估採流程倍率；實際費用會依供應商回報的快取與推理 Token 校正。</p>
          <div className="pt-3 mt-3 border-t border-slate-800 flex flex-col gap-1">
            <div className="flex justify-between font-medium text-blue-400"><span>總預估成本 (USD):</span><span>~${estimatedCost.totalUsd.toFixed(4)}</span></div>
            <div className="flex justify-between font-bold text-emerald-400"><span>總預估成本 (TWD):</span><span>~NT$ {estimatedCost.totalTwd.toFixed(2)}</span></div>
          </div>

          {hasActualUsage && (
            <div className="pt-4 mt-4 border-t border-slate-700/50 space-y-2">
              <h4 className="text-sm font-semibold text-slate-300 flex items-center gap-1.5 mb-2"><Clock className="w-4 h-4 text-purple-400" />整份文件累積用量與成本</h4>
              <div className="flex justify-between"><span className="text-slate-500">實際輸入 Token:</span><span className="font-medium text-slate-300">{actualUsage.inputTokens.toLocaleString()}</span></div>
              {actualUsage.cachedInputTokens > 0 && <div className="flex justify-between"><span className="text-slate-500">其中快取命中:</span><span className="font-medium text-emerald-300">{actualUsage.cachedInputTokens.toLocaleString()}</span></div>}
              {actualUsage.cacheWriteInputTokens > 0 && <div className="flex justify-between"><span className="text-slate-500">其中快取寫入:</span><span className="font-medium text-slate-300">{actualUsage.cacheWriteInputTokens.toLocaleString()}</span></div>}
              <div className="flex justify-between"><span className="text-slate-500">計費輸出 Token:</span><span className="font-medium text-slate-300">{actualUsage.outputTokens.toLocaleString()}</span></div>
              {actualUsage.reasoningTokens > 0 && <div className="flex justify-between"><span className="text-slate-500">其中推理／思考:</span><span className="font-medium text-purple-300">{actualUsage.reasoningTokens.toLocaleString()}</span></div>}
              <div className="pt-2 mt-2 border-t border-slate-800/50 space-y-1">
                <div className="flex justify-between text-blue-400"><span>實際已產生成本 (USD):</span><span className="font-medium">${actualCost.totalUsd.toFixed(4)}</span></div>
                <div className="flex justify-between text-emerald-400"><span>實際已產生成本 (TWD):</span><span className="font-bold">NT$ {actualCost.totalTwd.toFixed(2)}</span></div>
              </div>
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}
