export type SourceSegment = { id: string; marker: string; source: string };

const MARKER_PATTERN = /\[\[PDFT_SEG:(S\d{4})\]\]/g;
const PREFIX_PATTERN = /^(\s*(?:#{1,6}\s+|[-*+]\s+|\d+[.)]\s+|>\s+)?)([\s\S]*)$/;

function splitSentences(text: string): string[] {
  const parts = text.match(/[\s\S]*?(?:[.!?。！？]+(?=\s|$)|\n{2,}|$)/g) ?? [];
  return parts.filter(Boolean);
}

export function annotateTranslationSegments(text: string) {
  const segments: SourceSegment[] = [];
  let index = 0;
  const annotated = text.split(/(\n{2,})/).map((block) => {
    if (!block.trim() || /^\n{2,}$/.test(block) || /^\s*__PDFT_PROTECTED_\d{4}__\s*$/.test(block)) return block;
    const match = block.match(PREFIX_PATTERN);
    const prefix = match?.[1] ?? '';
    const body = match?.[2] ?? block;
    const sentences = splitSentences(body);
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
  return segments.filter((segment) => !translation.includes(segment.marker)).map((segment) => segment.id);
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
    if (result.includes(segment.marker)) continue;
    const repair = repairMap.get(segment.id);
    if (!repair) continue;
    const segmentIndex = segments.findIndex((item) => item.id === segment.id);
    const next = segments.slice(segmentIndex + 1).find((item) => result.includes(item.marker));
    const insertion = `${segment.marker}${repair}\n`;
    result = next ? result.replace(next.marker, `${insertion}${next.marker}`) : `${result.trimEnd()}\n${insertion}`;
  }
  return result;
}
