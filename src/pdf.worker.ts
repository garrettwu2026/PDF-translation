import * as pdfjsLib from 'pdfjs-dist';
import { PDFDocument } from 'pdf-lib';
import pdfWorker from 'pdfjs-dist/build/pdf.worker.mjs?url';
import { uint8ArrayToBase64 } from './lib/text';

// Set the worker source for pdfjs-dist
pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorker;

self.onmessage = async (e: MessageEvent) => {
  const { type, payload } = e.data;

  try {
    if (type === 'CALCULATE_TOKENS') {
      const { fileBuffer } = payload;
      const pdfDoc = await PDFDocument.load(fileBuffer);
      const pageCount = pdfDoc.getPageCount();
      
      self.postMessage({ type: 'TOTAL_PAGES', payload: { pageCount } });

      if (pageCount <= 1000) {
        const base64 = uint8ArrayToBase64(new Uint8Array(fileBuffer));
        self.postMessage({ type: 'TOKEN_CHUNK', payload: { base64, isLast: true } });
      } else {
        const CHUNK_SIZE = 500;
        const totalChunks = Math.ceil(pageCount / CHUNK_SIZE);
        for (let i = 0; i < totalChunks; i++) {
          const start = i * CHUNK_SIZE;
          const end = Math.min(start + CHUNK_SIZE, pageCount);
          const pageIndices = Array.from({ length: end - start }, (_, k) => start + k);
          const chunkPdf = await PDFDocument.create();
          const copiedPages = await chunkPdf.copyPages(pdfDoc, pageIndices);
          copiedPages.forEach(page => chunkPdf.addPage(page));
          const chunkBytes = await chunkPdf.save();
          const base64 = uint8ArrayToBase64(chunkBytes);
          self.postMessage({ type: 'TOKEN_CHUNK', payload: { base64, isLast: i === totalChunks - 1 } });
        }
      }
    } else if (type === 'GET_EXTRACTION_CHUNKS') {
      const { fileBuffer } = payload;
      const pdfDoc = await PDFDocument.load(fileBuffer);
      const pdfjsDoc = await pdfjsLib.getDocument({ data: fileBuffer }).promise;
      const pageCount = pdfDoc.getPageCount();
      
      const CHUNK_SIZE = 5;
      const totalChunks = Math.ceil(pageCount / CHUNK_SIZE);
      
      self.postMessage({ type: 'TOTAL_CHUNKS', payload: { totalChunks, pageCount } });

      for (let i = 0; i < totalChunks; i++) {
        const startPage = i * CHUNK_SIZE;
        const endPage = Math.min(startPage + CHUNK_SIZE, pageCount) - 1;
        let chunkRawText = '';
        try {
          for (let p = startPage + 1; p <= endPage + 1; p++) {
            const page = await pdfjsDoc.getPage(p);
            const textContent = await page.getTextContent();
            chunkRawText += textContent.items.map((item: any) => item.str).join(' ') + '\n';
          }
        } catch (e) {
          console.warn(`Worker failed to extract raw text for chunk ${i}`, e);
        }

        // Text-based PDFs do not need an additional PDF copy. Only create a
        // mini-PDF when OCR is required, which sharply reduces memory use for
        // long documents.
        let chunkBase64: string | undefined;
        if (chunkRawText.replace(/\s+/g, '').length <= 10) {
          const pageIndices = Array.from({ length: endPage - startPage + 1 }, (_, idx) => startPage + idx);
          const chunkPdf = await PDFDocument.create();
          const copiedPages = await chunkPdf.copyPages(pdfDoc, pageIndices);
          copiedPages.forEach((page) => chunkPdf.addPage(page));
          chunkBase64 = uint8ArrayToBase64(await chunkPdf.save());
        }
        
        self.postMessage({ 
          type: 'EXTRACTION_CHUNK', 
          payload: { 
            index: i, 
            base64: chunkBase64, 
            rawText: chunkRawText,
            isLast: i === totalChunks - 1
          } 
        });
      }
    }
  } catch (err: unknown) {
    self.postMessage({
      type: 'ERROR',
      payload: { message: err instanceof Error ? err.message : 'Unknown PDF worker error' },
    });
  }
};
