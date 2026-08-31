import { Info, X } from 'lucide-react';

const stages = [
  ['階段一：文字提取與格式修復', '背景解析 PDF，將碎片化文字修復為連貫 Markdown；此階段保持原始語言，不進行翻譯。'],
  ['階段二：全域分析與風格建模', '一次提取術語表、角色圖譜與翻譯風格指南，確保長篇內容的一致性。'],
  ['階段三：迭代式分段翻譯', '以 3,500 字區塊翻譯，並帶入術語、角色、前情提要及上一段上下文。'],
  ['階段四：自我校對與動態更新', '逐段檢查漏譯、幻覺、格式與術語，同步更新後續段落使用的上下文。'],
] as const;

export default function InfoModal({ onClose }: { onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl w-full max-w-3xl max-h-[85vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        <div className="flex items-center justify-between p-6 border-b border-slate-800 bg-slate-900/50">
          <div className="flex items-center gap-3"><div className="bg-blue-600/20 p-2 rounded-xl border border-blue-500/30"><Info className="w-5 h-5 text-blue-400" /></div><h2 className="text-xl font-semibold text-slate-100">系統說明與翻譯流程</h2></div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-200 p-2 hover:bg-slate-800 rounded-lg" aria-label="關閉說明"><X className="w-5 h-5" /></button>
        </div>
        <div className="p-6 overflow-y-auto custom-scrollbar space-y-8 text-slate-300">
          <section>
            <h3 className="text-lg font-medium text-slate-100 mb-3">核心功能</h3>
            <ul className="list-disc list-inside space-y-2 text-sm leading-relaxed ml-2">
              <li>支援 Google Gemini 與 OpenAI GPT 模型。</li><li>支援 PDF 與 Markdown 上傳。</li><li>自動修復 PDF 斷行與 Markdown 結構。</li><li>可匯出 Markdown、PDF 與 EPUB。</li><li>自動保存進度並支援中斷續傳。</li>
            </ul>
          </section>
          <section>
            <h3 className="text-lg font-medium text-slate-100 mb-3">AI 翻譯流程</h3>
            <div className="space-y-4 text-sm leading-relaxed">{stages.map(([title, description]) => <div key={title} className="bg-slate-800/50 p-4 rounded-xl border border-slate-700/50"><h4 className="font-semibold text-purple-400 mb-2">{title}</h4><p>{description}</p></div>)}</div>
          </section>
          <section>
            <h3 className="text-lg font-medium text-slate-100 mb-3">主要參數</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
              {[['區塊大小','3,500 字元'],['提取溫度','0.1'],['翻譯溫度','0.2'],['校對溫度','0.0']].map(([label,value]) => <div key={label} className="bg-slate-800/30 p-3 rounded-lg border border-slate-700/30"><span className="text-slate-400 block mb-1">{label}</span><strong className="text-slate-200">{value}</strong></div>)}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
