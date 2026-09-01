import { MODELS, type ModelConfig } from '../lib/models';
import ModelCatalogNotice from './ModelCatalogNotice';
import TranslationLimits from './TranslationLimits';

type Props = {
  selectedModel: string;
  selectedModelData: ModelConfig;
  disabled: boolean;
  budgetUsd: number;
  retryLimit: number;
  estimatedUsd: number;
  onModelChange: (modelId: string) => void;
  onBudgetChange: (value: number) => void;
  onRetryLimitChange: (value: number) => void;
};

export default function ModelSelectionPanel({
  selectedModel,
  selectedModelData,
  disabled,
  budgetUsd,
  retryLimit,
  estimatedUsd,
  onModelChange,
  onBudgetChange,
  onRetryLimitChange,
}: Props) {
  return (
    <div className="app-card model-card bg-slate-900 p-6 rounded-2xl shadow-lg shadow-black/20 border border-slate-800">
      <div className="section-heading">
        <div className="step-badge">1</div>
        <div>
          <h2 className="text-lg font-semibold text-slate-200">選擇 AI 模型</h2>
          <p className="text-xs text-slate-500 mt-0.5">依照品質、速度和預算選擇</p>
        </div>
      </div>

      <label htmlFor="model-select" className="block text-xs font-semibold text-slate-500 mb-2">翻譯模型</label>
      <select
        id="model-select"
        value={selectedModel}
        disabled={disabled}
        onChange={(event) => onModelChange(event.target.value)}
        className="model-select w-full px-4 py-3 bg-slate-950 border border-slate-700 rounded-xl text-sm text-slate-200 focus:ring-2 focus:ring-blue-500 outline-none disabled:cursor-not-allowed disabled:opacity-60"
      >
        <optgroup label="Google Gemini">
          {MODELS.filter((model) => model.provider === 'google').map((model) => (
            <option key={model.id} value={model.id}>{model.name} — {model.badge}</option>
          ))}
        </optgroup>
        <optgroup label="OpenAI GPT">
          {MODELS.filter((model) => model.provider === 'openai').map((model) => (
            <option key={model.id} value={model.id}>{model.name} — {model.badge}</option>
          ))}
        </optgroup>
      </select>

      <div className="selected-model mt-4 rounded-xl border border-slate-800 p-4">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
              {selectedModelData.provider === 'google' ? 'Google Gemini' : 'OpenAI GPT'}
            </p>
            <p className="font-semibold text-slate-200 mt-0.5 truncate">{selectedModelData.name}</p>
          </div>
          <span className="model-badge shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold">{selectedModelData.badge}</span>
        </div>
        <div className="price-grid grid grid-cols-3 gap-2 mt-4 text-center">
          <div><span>輸入</span><strong>${selectedModelData.inputPrice}</strong></div>
          <div><span>快取</span><strong>${selectedModelData.cachedInputPrice}</strong></div>
          <div><span>輸出</span><strong>${selectedModelData.outputPrice}</strong></div>
        </div>
        <p className="text-[11px] text-slate-500 mt-3">每 1M tokens{selectedModelData.priceNote ? `・${selectedModelData.priceNote}` : ''}</p>
      </div>

      <ModelCatalogNotice />
      <TranslationLimits
        budgetUsd={budgetUsd}
        retryLimit={retryLimit}
        estimatedUsd={estimatedUsd}
        onBudgetChange={onBudgetChange}
        onRetryLimitChange={onRetryLimitChange}
      />
    </div>
  );
}
