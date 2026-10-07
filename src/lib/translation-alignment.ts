import { restoreProtectedContent, type ProtectedContentEntry } from './protected-content.ts';
import { stripSegmentMarkers, type SourceSegment } from './sentence-segments.ts';

export type TranslationAlignment = { id: string; sourceStart: number; sourceEnd: number; translatedStart: number; translatedEnd: number; stale?: boolean };
// Chunking normalizes whitespace; retain offsets in the original uploaded text.
export function sourceChunkLocations(source: string, chunks: string[]) {
  const positions: number[] = [];
  let compact = '';
  for (let i = 0; i < source.length; i++) if (!/\s/.test(source[i])) {compact += source[i]; positions.push(i);}
  let cursor = 0;
  return chunks.map(chunk => {
    const start = compact.indexOf(chunk.replace(/\s/g, ''), cursor);
    if (start < 0) throw new Error('翻譯分段無法定位原文。');
    const localPositions: number[] = [];
    let index = start;
    for (let i = 0; i < chunk.length; i++) {
      localPositions.push(positions[index] ?? source.length);
      if (!/\s/.test(chunk[i])) index++;
    }
    localPositions.push((positions[index - 1] ?? -1) + 1);
    cursor = index;
    return localPositions;
  });
}
export function buildAlignment(source: string, translation: string, segments: SourceSegment[], entries: ProtectedContentEntry[], chunk: number): TranslationAlignment[] {
  const offset = (text: string, end: number) => restoreProtectedContent(stripSegmentMarkers(text.slice(0, end)), entries).text.length;
  return segments.map((segment, i) => {
    const sourceStart = source.indexOf(segment.marker) + segment.marker.length;
    const translatedStart = translation.indexOf(segment.marker) + segment.marker.length;
    const sourceEnd = i + 1 < segments.length ? source.indexOf(segments[i + 1].marker) : source.length;
    const translatedEnd = i + 1 < segments.length ? translation.indexOf(segments[i + 1].marker) : translation.length;
    return { id: `C${chunk}-${segment.id}`, sourceStart: offset(source, sourceStart), sourceEnd: offset(source, sourceEnd), translatedStart: offset(translation, translatedStart), translatedEnd: offset(translation, translatedEnd) };
  });
}

// Conservative rebasing: revised spans require review; unaffected ranges stay exact.
export function rebaseAlignment(rows: TranslationAlignment[], before: string, after: string) {
  if (before === after) return rows;
  let start = 0, suffix = 0;
  while (start < Math.min(before.length, after.length) && before[start] === after[start]) start++;
  while (suffix < Math.min(before.length, after.length) - start && before[before.length - suffix - 1] === after[after.length - suffix - 1]) suffix++;
  const end = before.length - suffix, delta = after.length - before.length;
  return rows.map(row => row.translatedEnd <= start ? row : row.translatedStart >= end ? { ...row, translatedStart: row.translatedStart + delta, translatedEnd: row.translatedEnd + delta }
    : { ...row, translatedStart: Math.min(row.translatedStart, start), translatedEnd: Math.max(start, after.length - suffix), stale: true });
}
