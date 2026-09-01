const PRINT_STYLES = `
  body { font-family: "Microsoft JhengHei", "PingFang TC", sans-serif; padding: 20mm; color: #000; background: #fff; line-height: 1.6; font-size: 12pt; }
  * { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  h1 { font-size: 24pt; border-bottom: 2px solid #333; padding-bottom: 10px; margin-top: 0; }
  h2 { font-size: 20pt; margin-top: 25px; border-bottom: 1px solid #eee; page-break-after: avoid; }
  h3 { font-size: 16pt; margin-top: 20px; page-break-after: avoid; }
  p, li { margin-bottom: 10px; overflow-wrap: anywhere; }
  pre { background: #f4f4f4; padding: 15px; border-radius: 5px; white-space: pre-wrap; overflow-wrap: anywhere; font-size: 10pt; border: 1px solid #ddd; }
  code { background: #f4f4f4; padding: 2px 5px; border-radius: 3px; font-family: monospace; }
  blockquote { border-left: 5px solid #ddd; padding-left: 20px; color: #444; font-style: italic; margin: 20px 0; }
  table { width: 100%; border-collapse: collapse; margin: 20px 0; page-break-inside: auto; }
  tr { page-break-inside: avoid; page-break-after: auto; }
  th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
  th { background: #f9f9f9; }
  img { max-width: 100%; height: auto; display: block; margin: 10px auto; }
  @page { size: A4; margin: 15mm; }
`;

export const downloadBlob = (blob: Blob, filename: string) => {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  window.setTimeout(() => {
    URL.revokeObjectURL(url);
    anchor.remove();
  }, 1000);
};

export const downloadMarkdown = (markdown: string, filename: string) =>
  downloadBlob(new Blob([markdown], { type: 'text/markdown;charset=utf-8' }), filename);

export const requestEpub = async (payload: { title: string; markdown: string; author?: string; cover?: string }) => {
  const response = await fetch('/api/generate-epub', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Failed to generate EPUB: ${response.status} ${detail}`);
  }
  return response.blob();
};

export const printElementToPdf = (element: HTMLElement, title: string) => {
  const iframe = document.createElement('iframe');
  Object.assign(iframe.style, { position: 'fixed', right: '0', bottom: '0', width: '0', height: '0', border: 'none' });
  document.body.appendChild(iframe);
  const iframeDoc = iframe.contentWindow?.document;
  if (!iframeDoc) {
    iframe.remove();
    throw new Error('無法建立列印環境');
  }

  iframeDoc.open();
  iframeDoc.write('<!doctype html><html><head></head><body></body></html>');
  iframeDoc.close();
  iframeDoc.title = title;
  const style = iframeDoc.createElement('style');
  style.textContent = PRINT_STYLES;
  iframeDoc.head.appendChild(style);
  const content = element.cloneNode(true) as HTMLElement;
  content.removeAttribute('id');
  iframeDoc.body.appendChild(content);

  window.setTimeout(() => {
    iframe.contentWindow?.focus();
    iframe.contentWindow?.print();
    window.setTimeout(() => iframe.remove(), 1000);
  }, 300);
};
