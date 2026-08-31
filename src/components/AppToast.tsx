import { AlertCircle, CheckCircle2, X } from 'lucide-react';

export type ToastMessage = {
  id: number;
  message: string;
  type: 'success' | 'error';
};

export default function AppToast({ toast, onClose }: { toast: ToastMessage | null; onClose: () => void }) {
  if (!toast) return null;
  return (
    <div key={toast.id} className={`fixed top-4 right-4 z-50 p-4 rounded-xl shadow-lg flex items-start gap-3 w-[calc(100%-2rem)] sm:w-auto max-w-sm animate-in slide-in-from-top-4 fade-in duration-300 print:hidden ${
      toast.type === 'success' ? 'bg-emerald-950/80 text-emerald-400 border border-emerald-900/50 backdrop-blur-sm' : 'bg-red-950/80 text-red-400 border border-red-900/50 backdrop-blur-sm'
    }`}>
      {toast.type === 'success'
        ? <CheckCircle2 className="w-5 h-5 text-emerald-500 shrink-0 mt-0.5" />
        : <AlertCircle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium leading-relaxed whitespace-pre-wrap break-words">{toast.message}</p>
      </div>
      <button onClick={onClose} className="ml-2 shrink-0 text-slate-500 hover:text-slate-300 transition-colors" aria-label="關閉通知">
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}
