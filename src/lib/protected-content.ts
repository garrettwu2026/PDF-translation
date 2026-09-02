export type ProtectedContentKind = 'code_block' | 'inline_code' | 'link_target' | 'url' | 'email' | 'math' | 'html';

export type ProtectedContentEntry = {
  placeholder: string;
  value: string;
  kind: ProtectedContentKind;
};

export type ProtectedContent = {
  text: string;
  entries: ProtectedContentEntry[];
};

type Candidate = { start: number; end: number; value: string; kind: ProtectedContentKind; priority: number };

const PATTERNS: Array<{ pattern: RegExp; kind: ProtectedContentKind; priority: number; group?: number }> = [
  { pattern: /(?:^|\n)(`{3,}|~{3,})[^\n]*\n[\s\S]*?\n\1(?=\n|$)/g, kind: 'code_block', priority: 100 },
  { pattern: /\$\$[\s\S]*?\$\$|\\\[[\s\S]*?\\\]|\\\([\s\S]*?\\\)/g, kind: 'math', priority: 90 },
  { pattern: /`[^`\n]+`/g, kind: 'inline_code', priority: 80 },
  { pattern: /\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g, kind: 'link_target', priority: 75, group: 1 },
  { pattern: /https?:\/\/[^\s)\]}>'"]+/giu, kind: 'url', priority: 70 },
  { pattern: /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/giu, kind: 'email', priority: 60 },
  { pattern: /<\/?[A-Za-z][^>]*>/g, kind: 'html', priority: 50 },
];

const overlaps = (left: Candidate, right: Candidate) => left.start < right.end && right.start < left.end;

export function protectContent(text: string): ProtectedContent {
  const candidates: Candidate[] = [];
  for (const { pattern, kind, priority, group = 0 } of PATTERNS) {
    for (const match of text.matchAll(pattern)) {
      const value = match[group];
      if (!value || match.index === undefined) continue;
      const relativeStart = group === 0 ? 0 : match[0].indexOf(value);
      const start = match.index + Math.max(0, relativeStart);
      candidates.push({ start, end: start + value.length, value, kind, priority });
    }
  }

  const selected: Candidate[] = [];
  for (const candidate of candidates.sort((a, b) => b.priority - a.priority || a.start - b.start)) {
    if (!selected.some((entry) => overlaps(entry, candidate))) selected.push(candidate);
  }
  selected.sort((a, b) => a.start - b.start);

  const entries: ProtectedContentEntry[] = [];
  let cursor = 0;
  let protectedText = '';
  selected.forEach((candidate, index) => {
    const placeholder = `__PDFT_PROTECTED_${String(index + 1).padStart(4, '0')}__`;
    protectedText += text.slice(cursor, candidate.start) + placeholder;
    entries.push({ placeholder, value: candidate.value, kind: candidate.kind });
    cursor = candidate.end;
  });
  protectedText += text.slice(cursor);
  return { text: protectedText, entries };
}

export function restoreProtectedContent(text: string, entries: ProtectedContentEntry[]) {
  const placeholderPattern = /__PDFT_PROTECTED_\d{4}__/g;
  const expected = new Set(entries.map((entry) => entry.placeholder));
  const encountered = text.match(placeholderPattern) ?? [];
  const missing: string[] = [];
  const duplicates: string[] = [];
  const counts = new Map<string, number>();
  for (const placeholder of encountered) {
    counts.set(placeholder, (counts.get(placeholder) ?? 0) + 1);
  }
  for (const entry of entries) {
    const count = counts.get(entry.placeholder) ?? 0;
    if (count === 0) missing.push(entry.placeholder);
    if (count > 1) duplicates.push(entry.placeholder);
  }
  const unknown = [...new Set(encountered.filter((placeholder) => !expected.has(placeholder)))];
  const expectedPresentOrder = entries
    .filter((entry) => counts.has(entry.placeholder))
    .map((entry) => entry.placeholder);
  const actualKnownOrder = encountered.filter((placeholder) => expected.has(placeholder));
  const outOfOrder = actualKnownOrder.length !== expectedPresentOrder.length
    || actualKnownOrder.some((placeholder, index) => placeholder !== expectedPresentOrder[index]);

  let restored = text;
  for (const entry of entries) {
    if (!restored.includes(entry.placeholder)) continue;
    restored = restored.split(entry.placeholder).join(entry.value);
  }
  return { text: restored, missing, unknown, duplicates, outOfOrder };
}

export const formatProtectedContentInstruction = (entries: ProtectedContentEntry[]) => entries.length
  ? `文中含 ${entries.length} 個 __PDFT_PROTECTED_XXXX__ 佔位符。它們代表程式碼、網址、電子郵件、數學式或標記；必須逐字保留，每個只出現一次，不得翻譯、改寫、刪除或重新編號。`
  : '';
