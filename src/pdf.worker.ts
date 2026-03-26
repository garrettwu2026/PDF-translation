import * as pdfjsLib from 'pdfjs-dist';
import { PDFDocument } from 'pdf-lib';
import pdfWorker from 'pdfjs-dist/build/pdf.worker.mjs?url';

// Set the worker source for pdfjs-dist
pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorker;

// Helper to convert Uint8Array to Base64
function uint8ArrayToBase64(uint8Array: Uint8Array): string {
  let binary = '';
  const len = uint8Array.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(uint8Array[i]);
  }
  return btoa(binary);
}

self.onmessage = async (e: MessageEvent) => {
  const { type, payload } = e.data;

  try {
    if (type === 'CALCULATE_TOKENS') {
      const { fileBuffer } = payload;
      const pdfDoc = await PDFDocument.load(fileBuffer);
      const pageCount = pdfDoc.getPageCount();
      
      self.postMessage({ type: 'TOTAL_PAGES', payload: { pageCount } });

      if (pageCount <= 1000) {
        const pdfBytes = await pdfDoc.save();
        const base64 = uint8ArrayToBase64(pdfBytes);
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
        const pageIndices = Array.from({length: endPage - startPage + 1}, (_, idx) => startPage + idx);
        
        const chunkPdf = await PDFDocument.create();
        const copiedPages = await chunkPdf.copyPages(pdfDoc, pageIndices);
        copiedPages.forEach(page => chunkPdf.addPage(page));
        
        const chunkBytes = await chunkPdf.save();
        const chunkBase64 = uint8ArrayToBase64(chunkBytes);
        
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
  } catch (err: any) {
    self.postMessage({ type: 'ERROR', payload: { message: err.message } });
  }
};
