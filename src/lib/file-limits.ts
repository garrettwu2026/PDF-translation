export const MAX_PDF_FILE_BYTES = 50 * 1024 * 1024;
export const MAX_MARKDOWN_FILE_BYTES = 12 * 1024 * 1024;
export const MAX_PDF_PAGES = 3_600;

type UploadCandidate = Pick<File, 'name' | 'type' | 'size'>;

export type SupportedUpload = {
  kind: 'pdf' | 'markdown';
};

export const validateUpload = (file: UploadCandidate): SupportedUpload => {
  const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
  const isMarkdown = file.name.toLowerCase().endsWith('.md');

  if (!isPdf && !isMarkdown) {
    throw new Error('請上傳 PDF 或 Markdown 檔案 (Please upload a PDF or MD file).');
  }

  const maxBytes = isPdf ? MAX_PDF_FILE_BYTES : MAX_MARKDOWN_FILE_BYTES;
  if (file.size > maxBytes) {
    const maxMegabytes = Math.round(maxBytes / 1024 / 1024);
    throw new Error(`${isPdf ? 'PDF' : 'Markdown'} 檔案不可超過 ${maxMegabytes} MB。`);
  }

  return { kind: isPdf ? 'pdf' : 'markdown' };
};

export const assertPdfPageLimit = (pageCount: number) => {
  if (!Number.isInteger(pageCount) || pageCount < 0) {
    throw new Error('PDF 頁數無效。');
  }
  if (pageCount > MAX_PDF_PAGES) {
    throw new Error(`PDF 頁數不可超過 ${MAX_PDF_PAGES.toLocaleString()} 頁`);
  }
};
