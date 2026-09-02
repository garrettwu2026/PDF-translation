export type SourceSegment = { id: string; marker: string; source: string };

const MARKER_PATTERN = /\[\[PDFT_SEG:(S\d{4})\]\]/g;
const PREFIX_PATTERN = /^(\s*(?:#{1,6}\s+|[-*+]\s+|\d+[.)]\s+|>\s+)?)([\s\S]*)$/;
const MARKDOWN_LINE_PATTERN = /^\s*(?:#{1,6}\s+|[-*+]\s+|\d+[.)]\s+|>\s+|\|)/;
const CLOSING_PUNCTUATION = new Set(['"', "'", '”', '’', '」', '』', '）', ')', ']', '】']);

function fallbackSplitSentences(text: string): string[] {
  const parts: string[] = [];
  let start = 0;
  for (let index = 0; index < text.length; index++) {
    if (!'.!?。！？'.includes(text[index])) continue;
    if (text[index] === '.' && /\d/.test(text[index - 1] ?? '') && /\d/.test(text[index + 1] ?? '')) continue;
    let end = index + 1;
    while (end < text.length && '.!?。！？'.includes(text[end])) end++;
    while (end < text.length && CLOSING_PUNCTUATION.has(text[end])) end++;
    parts.push(text.slice(start, end));
    start = end;
    index = end - 1;
  }
  if (start < text.length) parts.push(text.slice(start));
  return parts.filter(Boolean);
}

function splitSentences(text: string): string[] {
  if (!text) return [];
  if (typeof Intl.Segmenter === 'function') {
    const segmenter = new Intl.Segmenter(undefined, { granularity: 'sentence' });
    return [...segmenter.segment(text)].map((entry) => entry.segment).filter(Boolean);
  }
  return fallbackSplitSentences(text);
}

function splitMarkdownAware(text: string): string[] {
  const lines = text.split(/(?<=\n)/);
  if (lines.length > 1 && lines.filter((line) => line.trim()).every((line) => MARKDOWN_LINE_PATTERN.test(line))) {
    return lines.filter(Boolean);
  }
  return splitSentences(text);
}

export function annotateTranslationSegments(text: string) {
  const segments: SourceSegment[] = [];
  let index = 0;
  const annotated = text.split(/(\n{2,})/).map((block) => {
    if (!block.trim() || /^\n{2,}$/.test(block) || /^\s*__PDFT_PROTECTED_\d{4}__\s*$/.test(block)) return block;
    const match = block.match(PREFIX_PATTERN);
    const prefix = match?.[1] ?? '';
    const body = match?.[2] ?? block;
    const sentences = splitMarkdownAware(body);
    return prefix + sentences.map((sentence) => {
      if (!sentence.trim()) return sentence;
      const id = `S${String(++index).padStart(4, '0')}`;
      const marker = `[[PDFT_SEG:${id}]]`;
      segments.push({ id, marker, source: sentence.trim() });
      const leading = sentence.match(/^\s*/)?.[0] ?? '';
      return `${leading}${marker}${sentence.slice(leading.length)}`;
    }).join('');
  }).join('');
  return { text: annotated, segments };
}

export function findMissingSegmentIds(translation: string, segments: SourceSegment[]) {
  const inspection = inspectTranslationSegments(translation, segments);
  return [...new Set([...inspection.missing, ...inspection.empty])];
}

export type SegmentInspection = {
  missing: string[];
  empty: string[];
  duplicates: string[];
  unknown: string[];
  outOfOrder: boolean;
};

export function inspectTranslationSegments(translation: string, segments: SourceSegment[]): SegmentInspection {
  const expectedIds = new Set(segments.map((segment) => segment.id));
  const matches = [...translation.matchAll(MARKER_PATTERN)].map((match) => ({
    id: match[1],
    index: match.index,
    length: match[0].length,
  }));
  const counts = new Map<string, number>();
  for (const match of matches) counts.set(match.id, (counts.get(match.id) ?? 0) + 1);
  const missing = segments.filter((segment) => !counts.has(segment.id)).map((segment) => segment.id);
  const duplicates = segments.filter((segment) => (counts.get(segment.id) ?? 0) > 1).map((segment) => segment.id);
  const unknown = [...new Set(matches.filter((match) => !expectedIds.has(match.id)).map((match) => match.id))];
  const knownOrder = matches.filter((match) => expectedIds.has(match.id)).map((match) => match.id);
  const expectedPresentOrder = segments.filter((segment) => counts.has(segment.id)).map((segment) => segment.id);
  const outOfOrder = knownOrder.length !== expectedPresentOrder.length
    || knownOrder.some((id, index) => id !== expectedPresentOrder[index]);
  const empty = matches
    .filter((match) => expectedIds.has(match.id) && counts.get(match.id) === 1)
    .filter((match, index) => {
      const nextIndex = matches[index + 1]?.index ?? translation.length;
      return translation.slice(match.index + match.length, nextIndex).trim().length === 0;
    })
    .map((match) => match.id);
  return { missing, empty, duplicates, unknown, outOfOrder };
}

export function stripSegmentMarkers(text: string) {
  return text.replace(MARKER_PATTERN, '');
}

export const SENTENCE_REPAIR_SCHEMA = {
  name: 'sentence_translation_repairs',
  schema: {
    type: 'object',
    additionalProperties: false,
    properties: {
      repairs: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          properties: { id: { type: 'string' }, translation: { type: 'string' } },
          required: ['id', 'translation'],
        },
      },
    },
    required: ['repairs'],
  },
} as const;

export function buildSentenceRepairPrompt(segments: SourceSegment[], missingIds: string[], currentTranslation: string) {
  const missing = segments.filter((segment) => missingIds.includes(segment.id));
  return `以下譯文遺失了指定句子標記。只翻譯列出的原句為繁體中文，依 JSON Schema 回傳 repairs；translation 不要包含標記。\n\n【缺漏句子】\n${missing.map((segment) => `${segment.id}: ${segment.source}`).join('\n')}\n\n【目前譯文（供語氣參考）】\n${currentTranslation}`;
}

export function parseSentenceRepairs(text: string): Array<{ id: string; translation: string }> {
  const normalized = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  const parsed = JSON.parse(normalized) as { repairs?: unknown };
  if (!Array.isArray(parsed.repairs) || !parsed.repairs.every((item) => item && typeof item === 'object' && typeof (item as Record<string, unknown>).id === 'string' && typeof (item as Record<string, unknown>).translation === 'string')) {
    throw new Error('Sentence repair response does not match the required schema');
  }
  return parsed.repairs as Array<{ id: string; translation: string }>;
}

export function applySentenceRepairs(
  translation: string,
  segments: SourceSegment[],
  repairs: Array<{ id: string; translation: string }>,
) {
  let result = translation;
  const repairMap = new Map(repairs.map((repair) => [repair.id, repair.translation.trim()]));
  for (const segment of segments) {
    const repair = repairMap.get(segment.id);
    if (!repair) continue;
    const inspection = inspectTranslationSegments(result, segments);
    if (result.includes(segment.marker)) {
      if (!inspection.empty.includes(segment.id)) continue;
      const markerIndex = result.indexOf(segment.marker);
      const contentStart = markerIndex + segment.marker.length;
      const nextMarkerIndex = segments
        .filter((item) => item.id !== segment.id)
        .map((item) => result.indexOf(item.marker, contentStart))
        .filter((index) => index >= 0)
        .sort((a, b) => a - b)[0] ?? result.length;
      result = `${result.slice(0, contentStart)}${repair}\n${result.slice(nextMarkerIndex)}`;
      continue;
    }
    const segmentIndex = segments.findIndex((item) => item.id === segment.id);
    const next = segments.slice(segmentIndex + 1).find((item) => result.includes(item.marker));
    const insertion = `${segment.marker}${repair}\n`;
    result = next ? result.replace(next.marker, `${insertion}${next.marker}`) : `${result.trimEnd()}\n${insertion}`;
  }
  return result;
}
