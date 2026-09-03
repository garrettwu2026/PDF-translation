import { Book, X, Image as ImageIcon } from 'lucide-react';
type Props = {
  authorName: string;
  setAuthorName: (value: string) => void;
  coverImage: string | null;
  setCoverImage: (value: string | null) => void;
  showToast: (message: string, type?: 'success' | 'error') => void;
};

/** EPUB metadata presentation; validation and browser-only image reading are unchanged. */
export default function EpubMetadataSettings({ authorName, setAuthorName, coverImage, setCoverImage, showToast }: Props) {
  return (
  <details className="advanced-settings mt-6 pt-5 border-t border-slate-800">
    <summary className="text-sm font-semibold text-slate-300 flex items-center gap-2 cursor-pointer">
      <Book className="w-4 h-4 text-blue-400" />
      EPUB 匯出設定 <span className="ml-auto text-xs font-normal text-slate-500">選填</span>
    </summary>
    <div className="space-y-4">
      <div>
        <label className="block text-xs text-slate-500 mb-1.5">作者名稱 (選填)</label>
        <input
          type="text"
          value={authorName}
          onChange={(e) => setAuthorName(e.target.value)}
          placeholder="例如：John Doe"
          className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-lg text-sm text-slate-200 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
        />
      </div>
      <div>
        <label className="block text-xs text-slate-500 mb-1.5">自訂封面圖片 (選填)</label>
        <div className="flex items-center gap-3">
          <label className="flex-1 cursor-pointer">
            <div className="flex items-center justify-center gap-2 px-3 py-2 bg-slate-950 border border-slate-700 border-dashed rounded-lg text-sm text-slate-400 hover:text-slate-200 hover:border-slate-500 transition-colors">
              <ImageIcon className="w-4 h-4" />
              {coverImage ? '更換封面' : '上傳圖片'}
            </div>
            <input
              type="file"
              accept="image/jpeg,image/png"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) {
                  if (!['image/jpeg', 'image/png'].includes(file.type)) {
                    showToast('封面僅支援 JPG 或 PNG 圖片', 'error');
                    return;
                  }
                  if (file.size > 5 * 1024 * 1024) {
                    showToast('封面圖片不可超過 5 MB', 'error');
                    return;
                  }
                  const reader = new FileReader();
                  reader.onload = (e) => setCoverImage(e.target?.result as string);
                  reader.readAsDataURL(file);
                }
              }}
            />
          </label>
          {coverImage && (
            <button
              onClick={() => setCoverImage(null)}
              className="p-2 text-slate-500 hover:text-red-400 hover:bg-red-400/10 rounded-lg transition-colors"
              title="移除封面"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
        {coverImage && (
          <div className="mt-2 relative w-20 h-28 rounded-md overflow-hidden border border-slate-700 shadow-sm">
            <img src={coverImage} alt="Cover Preview" className="w-full h-full object-cover" />
          </div>
        )}
      </div>
    </div>
  </details>
  );
}
