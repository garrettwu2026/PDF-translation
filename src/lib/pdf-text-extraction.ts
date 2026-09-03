import { assertPdfPageLimit } from './file-limits';
import { cleanPdfPages, orderPdfPageText, type PdfTextItemLike } from './pdf-layout';
import { throwIfAborted } from './abort';
import { estimateTextTokens } from './text';

export const extractPdfText = async (
  file: File,
  onProgress: (page: number, total: number, text: string, pageText: string) => void,
  signal?: AbortSignal,
  incrementalText = true,
) => {
  throwIfAborted(signal);
  const arrayBuffer = await file.arrayBuffer();
  const [pdfjsLib, workerModule] = await Promise.all([
    import('pdfjs-dist'),
    import('pdfjs-dist/build/pdf.worker.mjs?url'),
  ]);
  pdfjsLib.GlobalWorkerOptions.workerSrc = workerModule.default;
  throwIfAborted(signal);
  const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
  const cancel = () => { void loadingTask.destroy().catch(() => undefined); };
  signal?.addEventListener('abort', cancel, { once: true });
  try {
    const pdf = await loadingTask.promise;
    throwIfAborted(signal);
    assertPdfPageLimit(pdf.numPages);
    const pageTexts: string[] = [];
    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber++) {
      throwIfAborted(signal);
      const page = await pdf.getPage(pageNumber);
      const textContent = await page.getTextContent();
      throwIfAborted(signal);
      const pageText = orderPdfPageText(textContent.items as PdfTextItemLike[]);
      pageTexts.push(pageText);
      page.cleanup();
      const fullText = incrementalText ? cleanPdfPages(pageTexts) : '';
      onProgress(pageNumber, pdf.numPages, fullText, pageText);
    }
    return cleanPdfPages(pageTexts);
  } finally {
    signal?.removeEventListener('abort', cancel);
    await loadingTask.destroy();
  }
};

/** Never infer source length from compressed PDF bytes or image token accounting.
 * Sparse pages may be scans: conservatively defer the estimate until OCR completes.
 */
export async function estimatePdfSourceTokens(file: File, onPages: (total: number) => void, signal?: AbortSignal) {
  let hasSparsePage = false;
  const text = await extractPdfText(file, (_page, total, _text, pageText) => {
    onPages(total);
    if (pageText.replace(/\s/g, '').length < 20) hasSparsePage = true;
  }, signal, false);
  return hasSparsePage || !text.trim() ? null : estimateTextTokens(text);
}
