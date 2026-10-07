import type { PdfTextItemLike } from './pdf-layout.ts';

export type PdfPageQuality = { needsOcr: boolean; reason: 'native' | 'sparse' | 'garbled' | 'mixed'; imageCount: number };
export function assessPdfPage(text: string, items: PdfTextItemLike[] = [], imageCount = 0, pageHeight = 0): PdfPageQuality {
  const compact = text.replace(/\s/g, '');
  const bad = (compact.match(/[\uFFFD\u0000-\u0008\uE000-\uF8FF]/g) ?? []).length;
  const positions = items.filter(i => i.str?.trim()).map(i => Number(i.transform?.[5] ?? 0));
  const spread = positions.length > 1 ? Math.max(...positions) - Math.min(...positions) : 0;
  const edgeOnly = pageHeight > 0 && positions.length > 0 && positions.every(y => y < pageHeight * .15 || y > pageHeight * .85);
  const reason = compact.length <= 10 ? 'sparse' : bad > 0 && bad / compact.length > .03 ? 'garbled'
    : imageCount > 0 && (compact.length < 300 || edgeOnly || pageHeight > 0 && spread < pageHeight * .15) ? 'mixed' : 'native';
  return { needsOcr: reason !== 'native', reason, imageCount };
}

export async function inspectPdfPage(page: { getTextContent: () => Promise<{items: unknown[]}>; getOperatorList: () => Promise<{fnArray: number[]}>; getViewport: (o: {scale: number}) => {height: number} }, imageOps: number[], text: string) {
  const [content, operators] = await Promise.all([page.getTextContent(), page.getOperatorList()]);
  return assessPdfPage(text, content.items as PdfTextItemLike[], operators.fnArray.filter(op => imageOps.includes(op)).length, page.getViewport({scale: 1}).height);
}
