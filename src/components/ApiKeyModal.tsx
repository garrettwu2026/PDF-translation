import type { Dispatch, SetStateAction } from 'react';
import { Key, X } from 'lucide-react';

type Props = {
  googleKey: string;
  openaiKey: string;
  rememberOnDevice: boolean;
  setGoogleKey: Dispatch<SetStateAction<string>>;
  setOpenaiKey: Dispatch<SetStateAction<string>>;
  setRememberOnDevice: Dispatch<SetStateAction<boolean>>;
  onClose: () => void;
  onSave: () => void;
};

export default function ApiKeyModal({ googleKey, openaiKey, rememberOnDevice, setGoogleKey, setOpenaiKey, setRememberOnDevice, onClose, onSave }: Props) {
  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl w-full max-w-md overflow-hidden relative">
        <button onClick={onClose} className="absolute top-4 right-4 text-slate-500 hover:text-slate-300 p-1" aria-label="關閉 API Key 設定"><X className="w-5 h-5" /></button>
        <div className="p-8 text-center">
          <div className="w-16 h-16 bg-blue-900/30 text-blue-400 rounded-full flex items-center justify-center mx-auto mb-4 border border-blue-500/20"><Key className="w-8 h-8" /></div>
          <h2 className="text-2xl font-semibold mb-2 text-slate-100">API Key 設定</h2>
          <p className="text-slate-400 mb-6 text-sm leading-relaxed">預設只保留到此分頁工作階段結束，並直接傳送給所選的 AI 服務。</p>
          <div className="text-left space-y-4">
            <div><p className="text-sm text-slate-300 mb-2 font-medium flex justify-between"><span>Google Gemini API Key：</span><a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noreferrer" className="text-xs text-blue-400 underline">獲取金鑰</a></p><input type="password" placeholder="AIzaSy..." value={googleKey} onChange={(event) => setGoogleKey(event.target.value)} className="w-full px-4 py-2 bg-slate-950 border border-slate-700 rounded-lg text-sm text-slate-200 focus:ring-2 focus:ring-blue-500 outline-none" /></div>
            <div><p className="text-sm text-slate-300 mb-2 font-medium flex justify-between"><span>OpenAI API Key（選填）：</span><a href="https://platform.openai.com/api-keys" target="_blank" rel="noreferrer" className="text-xs text-emerald-400 underline">獲取金鑰</a></p><input type="password" placeholder="sk-proj-..." value={openaiKey} onChange={(event) => setOpenaiKey(event.target.value)} className="w-full px-4 py-2 bg-slate-950 border border-slate-700 rounded-lg text-sm text-slate-200 focus:ring-2 focus:ring-emerald-500 outline-none" /></div>
            <label className="flex items-start gap-3 rounded-xl border border-slate-800 bg-slate-950/50 p-3 cursor-pointer"><input type="checkbox" checked={rememberOnDevice} onChange={(event) => setRememberOnDevice(event.target.checked)} className="mt-0.5 h-4 w-4 rounded border-slate-700 text-blue-600" /><span><span className="block text-sm font-medium text-slate-300">在這台裝置記住金鑰</span><span className="mt-0.5 block text-xs leading-relaxed text-slate-500">只建議在自己的私人裝置啟用。瀏覽器儲存空間不是密碼保管庫。</span></span></label>
            <button onClick={onSave} className="w-full py-3 px-4 bg-blue-600 hover:bg-blue-500 text-white rounded-xl font-medium border border-blue-400/50">儲存並套用</button>
          </div>
          <p className="text-xs text-slate-500 mt-6">若要清除金鑰，請將輸入框留空後儲存。金鑰不會傳送到本網站伺服器。</p>
        </div>
      </div>
    </div>
  );
}
