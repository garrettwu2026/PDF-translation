import * as pdfjsLib from 'pdfjs-dist';
import { PDFDocument } from 'pdf-lib';
import pdfWorker from 'pdfjs-dist/build/pdf.worker.mjs?url';
import { uint8ArrayToBase64 } from './lib/text';
import { assertPdfPageLimit } from './lib/file-limits';

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorker;

const cancelledTasks = new Set<string>();
const acknowledgementWaiters = new Map<string, () => void>();

type WorkerRequest = {
  type: 'CALCULATE_TOKENS' | 'GET_EXTRACTION_CHUNKS' | 'TOKEN_CHUNK_ACK' | 'EXTRACTION_CHUNK_ACK' | 'CANCEL_TASK';
  payload: {
    requestId: string;
    fileBuffer?: ArrayBuffer;
    index?: number;
  };
};

const acknowledgementKey = (requestId: string, kind: 'token' | 'extraction', index: number) =>
  `${requestId}:${kind}:${index}`;

const waitForAcknowledgement = (requestId: string, kind: 'token' | 'extraction', index: number) =>
  new Promise<void>((resolve) => {
    acknowledgementWaiters.set(acknowledgementKey(requestId, kind, index), resolve);
  });

const cancelTask = (requestId: string) => {
  cancelledTasks.add(requestId);
  for (const [key, resolve] of acknowledgementWaiters) {
    if (key.startsWith(`${requestId}:`)) {
      acknowledgementWaiters.delete(key);
      resolve();
    }
  }
};

self.onmessage = async (event: MessageEvent<WorkerRequest>) => {
  const { type, payload } = event.data;
  const { requestId } = payload;

  if (type === 'CANCEL_TASK') {
    cancelTask(requestId);
    self.postMessage({ type: 'TASK_CANCELLED', payload: { requestId } });
    return;
  }

  if (type === 'TOKEN_CHUNK_ACK' || type === 'EXTRACTION_CHUNK_ACK') {
    const kind = type === 'TOKEN_CHUNK_ACK' ? 'token' : 'extraction';
    const key = acknowledgementKey(requestId, kind, payload.index ?? 0);
    acknowledgementWaiters.get(key)?.();
    acknowledgementWaiters.delete(key);
    return;
  }

  const fileBuffer = payload.fileBuffer;
  if (!fileBuffer) {
    self.postMessage({ type: 'ERROR', payload: { requestId, message: 'PDF data is missing' } });
    return;
  }

  try {
    if (type === 'CALCULATE_TOKENS') {
      const pdfDoc = await PDFDocument.load(fileBuffer);
      const pageCount = pdfDoc.getPageCount();
      assertPdfPageLimit(pageCount);

      self.postMessage({ type: 'TOTAL_PAGES', payload: { requestId, pageCount } });

      if (pageCount <= 1_000) {
        if (cancelledTasks.has(requestId)) return;
        const base64 = uint8ArrayToBase64(new Uint8Array(fileBuffer));
        self.postMessage({ type: 'TOKEN_CHUNK', payload: { requestId, index: 0, base64, isLast: true } });
        await waitForAcknowledgement(requestId, 'token', 0);
      } else {
        const chunkSize = 500;
        const totalChunks = Math.ceil(pageCount / chunkSize);
        for (let index = 0; index < totalChunks; index++) {
          if (cancelledTasks.has(requestId)) return;
          const start = index * chunkSize;
          const end = Math.min(start + chunkSize, pageCount);
          const pageIndices = Array.from({ length: end - start }, (_, offset) => start + offset);
          const chunkPdf = await PDFDocument.create();
          const copiedPages = await chunkPdf.copyPages(pdfDoc, pageIndices);
          copiedPages.forEach((page) => chunkPdf.addPage(page));
          const base64 = uint8ArrayToBase64(await chunkPdf.save());
          self.postMessage({
            type: 'TOKEN_CHUNK',
            payload: { requestId, index, base64, isLast: index === totalChunks - 1 },
          });
          await waitForAcknowledgement(requestId, 'token', index);
        }
      }
    } else if (type === 'GET_EXTRACTION_CHUNKS') {
      const pdfDoc = await PDFDocument.load(fileBuffer);
      const pdfjsDoc = await pdfjsLib.getDocument({ data: fileBuffer }).promise;
      const pageCount = pdfDoc.getPageCount();
      assertPdfPageLimit(pageCount);

      const chunkSize = 5;
      const totalChunks = Math.ceil(pageCount / chunkSize);
      self.postMessage({ type: 'TOTAL_CHUNKS', payload: { requestId, totalChunks, pageCount } });

      for (let index = 0; index < totalChunks; index++) {
        if (cancelledTasks.has(requestId)) return;
        const startPage = index * chunkSize;
        const endPage = Math.min(startPage + chunkSize, pageCount) - 1;
        let chunkRawText = '';

        try {
          for (let pageNumber = startPage + 1; pageNumber <= endPage + 1; pageNumber++) {
            if (cancelledTasks.has(requestId)) return;
            const page = await pdfjsDoc.getPage(pageNumber);
            const textContent = await page.getTextContent();
            chunkRawText += textContent.items
              .map((item) => ('str' in item ? item.str : ''))
              .join(' ') + '\n';
            page.cleanup();
          }
        } catch (error) {
          console.warn(`Worker failed to extract raw text for chunk ${index}`, error);
        }

        let chunkBase64: string | undefined;
        if (chunkRawText.replace(/\s+/g, '').length <= 10) {
          const pageIndices = Array.from(
            { length: endPage - startPage + 1 },
            (_, offset) => startPage + offset,
          );
          const chunkPdf = await PDFDocument.create();
          const copiedPages = await chunkPdf.copyPages(pdfDoc, pageIndices);
          copiedPages.forEach((page) => chunkPdf.addPage(page));
          chunkBase64 = uint8ArrayToBase64(await chunkPdf.save());
        }

        self.postMessage({
          type: 'EXTRACTION_CHUNK',
          payload: {
            requestId,
            index,
            base64: chunkBase64,
            rawText: chunkRawText,
            isLast: index === totalChunks - 1,
          },
        });
        await waitForAcknowledgement(requestId, 'extraction', index);
      }

      await pdfjsDoc.destroy();
    }
  } catch (error: unknown) {
    if (!cancelledTasks.has(requestId)) {
      self.postMessage({
        type: 'ERROR',
        payload: { requestId, message: error instanceof Error ? error.message : 'Unknown PDF worker error' },
      });
    }
  } finally {
    cancelledTasks.delete(requestId);
  }
};
