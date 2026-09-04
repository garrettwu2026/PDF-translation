import type { MouseEvent } from 'react';
import { AlertCircle, CheckCircle2, Clock, History, Loader2, Trash2, X } from 'lucide-react';
import { HISTORY_MAX_RECORDS, type HistoryRecord } from '../lib/db';
import AccessibleDialog from './AccessibleDialog';

type HistoryModalProps = {
  records: HistoryRecord[];
  currentFileId: string | null;
  onClose: () => void;
  onLoad: (record: HistoryRecord) => void;
  onRequestDelete: (id: string, event: MouseEvent) => void;
};

export function HistoryModal({ records, currentFileId, onClose, onLoad, onRequestDelete }: HistoryModalProps) {
  return (
    <AccessibleDialog labelledBy="history-dialog-title" onClose={onClose} className="bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl w-full max-w-3xl max-h-[80vh] flex flex-col overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-900/50">
          <h2 id="history-dialog-title" className="text-xl font-semibold text-slate-100 flex items-center gap-2"><History className="w-5 h-5 text-blue-400" />歷史紀錄</h2>
          <button onClick={onClose} className="p-2 text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded-lg" aria-label="關閉歷史紀錄"><X className="w-5 h-5" /></button>
        </div>
        <div className="flex-1 overflow-y-auto p-6">
          {records.length === 0 ? (
            <div className="text-center py-12 text-slate-500"><History className="w-12 h-12 mx-auto mb-3 opacity-20" /><p>尚無歷史紀錄</p></div>
          ) : (
            <div className="space-y-3">{records.map((record) => (
              <div key={record.id} className={`p-4 rounded-xl border transition-all group ${currentFileId === record.id ? 'bg-blue-900/20 border-blue-500/50 shadow-[0_0_15px_rgba(37,99,235,0.1)]' : 'bg-slate-800/50 border-slate-700 hover:bg-slate-800 hover:border-slate-600'}`}>
                <div className="flex items-start justify-between gap-4">
                  <button onClick={() => onLoad(record)} className="flex-1 min-w-0 text-left rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" aria-label={`載入 ${record.title}`}>
                    <h3 className="font-medium text-slate-200 truncate mb-1">{record.title}</h3>
                    {!!record.pendingRequests && <p className="text-xs text-amber-600 mb-2">有 {record.pendingRequests} 筆請求用量待確認；費用僅包含已知用量。</p>}
                    <div className="flex items-center gap-3 text-xs text-slate-400">
                      <span className="flex items-center gap-1"><Clock className="w-3.5 h-3.5" />{new Date(record.timestamp).toLocaleString()}</span>
                      <span className="flex items-center gap-1">
                        {record.status === 'completed' ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" /> : record.status === 'error' ? <AlertCircle className="w-3.5 h-3.5 text-red-500" /> : <Loader2 className="w-3.5 h-3.5 text-blue-500 animate-spin" />}
                        {record.status === 'completed' ? '已完成' : record.status === 'error' ? '錯誤' : `翻譯中 (${record.currentChunk}/${record.totalChunks})`}
                      </span>
                    </div>
                  </button>
                  <button onClick={(event) => onRequestDelete(record.id, event)} className="p-2 text-slate-500 hover:text-red-400 hover:bg-red-400/10 rounded-lg transition-colors opacity-0 group-hover:opacity-100 focus:opacity-100" aria-label={`刪除 ${record.title}`}><Trash2 className="w-4 h-4" /></button>
                </div>
              </div>
            ))}</div>
          )}
        </div>
        <div className="border-t border-slate-800 px-6 py-3 text-xs text-slate-500">
          已保存 {records.length}/{HISTORY_MAX_RECORDS} 筆；超限時清理舊紀錄及中間結果，未完成翻譯暫不自動移除。
        </div>
    </AccessibleDialog>
  );
}

export function DeleteHistoryDialog({ onCancel, onConfirm }: { onCancel: () => void; onConfirm: () => void }) {
  return (
    <AccessibleDialog labelledBy="delete-history-dialog-title" onClose={onCancel} overlayClassName="z-[60]" className="bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl w-full max-w-md overflow-hidden p-6">
        <div className="flex items-center gap-3 mb-4 text-red-400"><AlertCircle className="w-6 h-6" /><h2 id="delete-history-dialog-title" className="text-xl font-semibold">確認刪除</h2></div>
        <p className="text-slate-300 mb-6">您確定要刪除這筆歷史紀錄嗎？此操作無法復原。</p>
        <div className="flex justify-end gap-3">
          <button onClick={onCancel} className="px-4 py-2 rounded-lg text-slate-300 hover:bg-slate-800">取消</button>
          <button onClick={onConfirm} className="px-4 py-2 rounded-lg bg-red-500/10 text-red-400 hover:bg-red-500/20 border border-red-500/20">確認刪除</button>
        </div>
    </AccessibleDialog>
  );
}
