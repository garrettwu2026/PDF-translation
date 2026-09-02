import { useRef, useState, type ChangeEvent, type DragEvent, type KeyboardEvent } from 'react';
import { FileText, FileUp } from 'lucide-react';

type Props = {
  file: File | null;
  totalPages: number;
  onFile: (file: File) => void;
};

export default function DocumentUploadDropzone({ file, totalPages, onFile }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);

  const selectFile = (selected: File | undefined) => {
    if (selected) onFile(selected);
  };
  const openPicker = () => inputRef.current?.click();
  const handleInput = (event: ChangeEvent<HTMLInputElement>) => {
    selectFile(event.target.files?.[0]);
    event.target.value = '';
  };
  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setIsDragging(false);
    selectFile(event.dataTransfer.files?.[0]);
  };
  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      openPicker();
    }
  };

  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={file ? `更換文件，目前為 ${file.name}` : '上傳 PDF 或 Markdown 文件'}
      onClick={openPicker}
      onKeyDown={handleKeyDown}
      onDragEnter={(event) => { event.preventDefault(); setIsDragging(true); }}
      onDragOver={(event) => { event.preventDefault(); event.dataTransfer.dropEffect = 'copy'; setIsDragging(true); }}
      onDragLeave={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setIsDragging(false); }}
      onDrop={handleDrop}
      className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-blue-500 ${
        isDragging ? 'border-teal-400 bg-teal-500/10 scale-[1.01]' : file ? 'border-blue-500/50 bg-blue-900/10' : 'border-slate-700 hover:border-blue-500 hover:bg-slate-800/50'
      }`}
    >
      <input ref={inputRef} type="file" data-testid="file-input" onChange={handleInput} accept="application/pdf,.md,text/markdown" className="hidden" />
      {file ? (
        <div className="flex flex-col items-center">
          <FileText className="w-10 h-10 text-blue-400 mb-3 drop-shadow-[0_0_8px_rgba(96,165,250,0.5)]" />
          <p className="font-medium text-slate-200 truncate max-w-full px-4">{file.name}</p>
          <p className="text-sm text-slate-500 mt-1">{(file.size / 1024 / 1024).toFixed(2)} MB {totalPages > 0 && `· 共 ${totalPages} 頁`}</p>
          <p className="text-xs text-slate-500 mt-2">點擊或拖入另一份文件即可更換</p>
        </div>
      ) : (
        <div className="flex flex-col items-center">
          <FileUp className={`w-10 h-10 mb-3 ${isDragging ? 'text-teal-400' : 'text-slate-500'}`} />
          <p className="font-medium text-slate-300">點擊或拖曳上傳 PDF／Markdown</p>
          <p className="text-sm text-slate-500 mt-1">PDF 最大 50 MB／3,600 頁；Markdown 最大 12 MB</p>
        </div>
      )}
    </div>
  );
}
