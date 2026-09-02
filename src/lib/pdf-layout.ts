export type PdfTextItemLike = {
  str: string;
  transform?: ArrayLike<number>;
  width?: number;
  height?: number;
  hasEOL?: boolean;
};

type PositionedItem = { text: string; x: number; y: number; width: number; height: number; hasEOL: boolean };
type LineFragment = { text: string; x: number; y: number; right: number };

const median = (values: number[]) => {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
};

const normalizeLine = (line: string) => line.replace(/\s+/g, ' ').trim();
const normalizedRepeatedLine = (line: string) => normalizeLine(line)
  .toLocaleLowerCase();

function positionItems(items: PdfTextItemLike[]): PositionedItem[] {
  return items
    .filter((item) => item.str?.trim())
    .map((item) => {
      const transform = item.transform;
      const height = Math.max(1, Math.abs(Number(transform?.[3] ?? item.height ?? 10)));
      return {
        text: item.str,
        x: Number(transform?.[4] ?? 0),
        y: Number(transform?.[5] ?? 0),
        width: Math.max(0, Number(item.width ?? item.str.length * height * 0.45)),
        height,
        hasEOL: Boolean(item.hasEOL),
      };
    });
}

function buildFragments(items: PositionedItem[]): LineFragment[] {
  const lineTolerance = Math.max(2, median(items.map((item) => item.height)) * 0.45);
  const rows: PositionedItem[][] = [];
  for (const item of [...items].sort((a, b) => b.y - a.y || a.x - b.x)) {
    const row = rows.find((candidate) => Math.abs(candidate[0].y - item.y) <= lineTolerance);
    if (row) row.push(item); else rows.push([item]);
  }
  const fragments: LineFragment[] = [];
  for (const row of rows) {
    const sorted = row.sort((a, b) => a.x - b.x);
    let text = '';
    let startX = sorted[0].x;
    let right = startX;
    const flush = () => {
      const normalized = normalizeLine(text);
      if (normalized) fragments.push({ text: normalized, x: startX, y: sorted[0].y, right });
    };
    for (const item of sorted) {
      const gap = item.x - right;
      const splitGap = Math.max(45, item.height * 4.5);
      if (text && gap > splitGap) {
        flush();
        text = '';
        startX = item.x;
      }
      const needsSpace = text && gap > Math.max(1.5, item.height * 0.12) && !/\s$/.test(text);
      text += `${needsSpace ? ' ' : ''}${item.text}`;
      right = Math.max(right, item.x + item.width);
      if (item.hasEOL) right += splitGap;
    }
    flush();
  }
  return fragments;
}

function orderFragments(fragments: LineFragment[]) {
  if (fragments.length < 8) return [...fragments].sort((a, b) => b.y - a.y || a.x - b.x);
  const minX = Math.min(...fragments.map((item) => item.x));
  const maxRight = Math.max(...fragments.map((item) => item.right));
  const midpoint = minX + (maxRight - minX) / 2;
  const left = fragments.filter((item) => item.x < midpoint && item.right < midpoint + 25);
  const right = fragments.filter((item) => item.x >= midpoint - 25);
  const overlappingRows = left.filter((leftItem) => right.some((rightItem) => Math.abs(leftItem.y - rightItem.y) <= 3)).length;
  if (left.length < 3 || right.length < 3 || overlappingRows < 3) {
    return [...fragments].sort((a, b) => b.y - a.y || a.x - b.x);
  }
  const spanning = fragments.filter((item) => !left.includes(item) && !right.includes(item));
  const columnTop = Math.max(...left.map((item) => item.y), ...right.map((item) => item.y));
  const columnBottom = Math.min(...left.map((item) => item.y), ...right.map((item) => item.y));
  const top = spanning.filter((item) => item.y >= columnTop);
  const bottom = spanning.filter((item) => item.y <= columnBottom);
  if (top.length + bottom.length !== spanning.length) {
    return [...fragments].sort((a, b) => b.y - a.y || a.x - b.x);
  }
  return [
    ...top.sort((a, b) => b.y - a.y || a.x - b.x),
    ...left.sort((a, b) => b.y - a.y || a.x - b.x),
    ...right.sort((a, b) => b.y - a.y || a.x - b.x),
    ...bottom.sort((a, b) => b.y - a.y || a.x - b.x),
  ];
}

export function orderPdfPageText(items: PdfTextItemLike[]) {
  const positioned = positionItems(items);
  if (!positioned.length) return '';
  return orderFragments(buildFragments(positioned)).map((fragment) => fragment.text).join('\n');
}

const PAGE_NUMBER_PATTERN = /^(?:page\s*)?[-–—]?\s*(?:\d+(?:\s*(?:of|\/)\s*\d+)?|[ivxlcdm]+)\s*[-–—]?$/iu;

export function removeRepeatedHeadersAndFooters(pages: string[]) {
  if (pages.length < 3) return pages;
  const threshold = Math.max(2, Math.ceil(pages.length * 0.6));
  const counts = new Map<string, number>();
  const candidatesByPage = pages.map((page) => {
    const lines = page.split('\n').map(normalizeLine).filter(Boolean);
    const candidates = [...lines.slice(0, 2), ...lines.slice(-2)].map(normalizedRepeatedLine);
    for (const candidate of new Set(candidates)) counts.set(candidate, (counts.get(candidate) ?? 0) + 1);
    return lines;
  });
  return candidatesByPage.map((lines) => lines
    .filter((line, index) => {
      const edge = index < 2 || index >= lines.length - 2;
      if (!edge) return true;
      if (PAGE_NUMBER_PATTERN.test(line)) return false;
      return (counts.get(normalizedRepeatedLine(line)) ?? 0) < threshold;
    })
    .join('\n'));
}

export function repairPdfLineBreaks(text: string) {
  const lines = text.split('\n').map(normalizeLine).filter(Boolean);
  let result = '';
  for (const line of lines) {
    if (!result) { result = line; continue; }
    if (/[-‐‑]$/u.test(result) && /^\p{Ll}/u.test(line)) {
      result = `${result.slice(0, -1)}${line}`;
    } else if (!/[.!?。！？:：;；]$/.test(result) && /^\p{Ll}/u.test(line)) {
      result += ` ${line}`;
    } else {
      result += `\n${line}`;
    }
  }
  return result;
}

export function cleanPdfPages(pages: string[]) {
  return repairPdfLineBreaks(removeRepeatedHeadersAndFooters(pages).join('\n'));
}
