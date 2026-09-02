import { assertPdfPageLimit } from './file-limits';
import { cleanPdfPages, orderPdfPageText, type PdfTextItemLike } from './pdf-layout';

export const extractPdfText = async (file: File, onProgress: (page: number, total: number, text: string) => void) => {
  const arrayBuffer = await file.arrayBuffer();
  const [pdfjsLib, workerModule] = await Promise.all([
    import('pdfjs-dist'),
    import('pdfjs-dist/build/pdf.worker.mjs?url'),
  ]);
  pdfjsLib.GlobalWorkerOptions.workerSrc = workerModule.default;
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  try {
    assertPdfPageLimit(pdf.numPages);
    const pageTexts: string[] = [];
    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber++) {
      const page = await pdf.getPage(pageNumber);
      const textContent = await page.getTextContent();
      pageTexts.push(orderPdfPageText(textContent.items as PdfTextItemLike[]));
      page.cleanup();
      const fullText = cleanPdfPages(pageTexts);
      onProgress(pageNumber, pdf.numPages, fullText);
    }
    return cleanPdfPages(pageTexts);
  } finally {
    await pdf.destroy();
  }
};
