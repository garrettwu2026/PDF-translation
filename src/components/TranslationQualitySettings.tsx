import { DOCUMENT_TYPES, type DocumentTypeId } from '../lib/document-types';

type Props = {
  documentType: DocumentTypeId;
  chapterProofreading: boolean;
  disabled: boolean;
  onDocumentTypeChange: (type: DocumentTypeId) => void;
  onChapterProofreadingChange: (enabled: boolean) => void;
};

export default function TranslationQualitySettings({
  documentType,
  chapterProofreading,
  disabled,
  onDocumentTypeChange,
  onChapterProofreadingChange,
}: Props) {
  const selected = DOCUMENT_TYPES.find((item) => item.id === documentType) ?? DOCUMENT_TYPES[0];
  return (
    <div className="space-y-4">
      <div>
        <label htmlFor="document-type" className="block text-sm font-medium text-slate-400 mb-1.5">文件類型</label>
        <select
          id="document-type"
          value={documentType}
          disabled={disabled}
          onChange={(event) => onDocumentTypeChange(event.target.value as DocumentTypeId)}
          className="w-full px-4 py-2.5 bg-slate-950 border border-slate-700 rounded-lg text-sm text-slate-200 focus:ring-2 focus:ring-blue-500 outline-none disabled:opacity-60"
        >
          {DOCUMENT_TYPES.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
        </select>
        <p className="mt-1.5 text-xs text-slate-500">{selected.description}</p>
      </div>
      <label className="friendly-option flex items-start gap-3 p-3 bg-slate-950/50 border border-slate-800 rounded-xl cursor-pointer">
        <input
          type="checkbox"
          checked={chapterProofreading}
          disabled={disabled}
          onChange={(event) => onChapterProofreadingChange(event.target.checked)}
          className="mt-0.5 w-4 h-4 text-blue-600 bg-slate-900 border-slate-700 rounded focus:ring-blue-500"
        />
        <span>
          <span className="block text-sm font-medium text-slate-300">章節一致性校稿</span>
          <span className="block mt-1 text-xs text-slate-500">在章節邊界依術語、角色與品質風險決定是否校稿，兼顧一致性並避免不必要用量。</span>
        </span>
      </label>
    </div>
  );
}
