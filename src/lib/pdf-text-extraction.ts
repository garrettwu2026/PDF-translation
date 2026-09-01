import { assertPdfPageLimit } from './file-limits';

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
    let fullText = '';
    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber++) {
      const page = await pdf.getPage(pageNumber);
      const textContent = await page.getTextContent();
      fullText += `${textContent.items.map((item: any) => item.str).join(' ')}\n\n`;
      page.cleanup();
      onProgress(pageNumber, pdf.numPages, fullText);
    }
    return fullText;
  } finally {
    await pdf.destroy();
  }
};
