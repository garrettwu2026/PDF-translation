export type LayeredDocumentMemory = {
  globalSummary: string;
  chapterSummaries: string[];
  recentSummaries: string[];
  currentChapter?: { title: string; summaries: string[] };
};

const GLOBAL_MARKER = '【全書摘要】';
const CHAPTER_MARKER = '【章節摘要】';
const RECENT_MARKER = '【近期進展】';
const compactChapter = (title: string, summaries: string[]) => title + '：' +
  summaries.map(summary => summary.slice(0, Math.max(1, Math.floor(4000 / Math.max(1, summaries.length))))).join('；');

const cleanLines = (values: string[]) => values
  .map((value) => value.replace(/^[-*]\s*/, '').trim())
  .filter(Boolean);

const uniqueRecent = (values: string[], limit: number) => {
  const seen = new Set<string>();
  const output: string[] = [];
  for (const value of [...values].reverse()) {
    const key = value.toLocaleLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      output.unshift(value);
    }
  }
  return output.slice(-limit);
};

export function createLayeredDocumentMemory(
  globalSummary = '',
  storedSummary = '',
): LayeredDocumentMemory {
  if (storedSummary.trimStart().startsWith('{')) {
    try {
      const data = JSON.parse(storedSummary);
      const strings = (value: unknown): value is string[] => Array.isArray(value) && value.every(item => typeof item === 'string');
      if (data.version === 1 && typeof data.globalSummary === 'string' && strings(data.chapterSummaries) && strings(data.recentSummaries)
        && (!data.currentChapter || typeof data.currentChapter.title === 'string' && strings(data.currentChapter.summaries))) {
        return { globalSummary: data.globalSummary, chapterSummaries: data.chapterSummaries.slice(-24),
          recentSummaries: data.recentSummaries.slice(-6),
          ...(data.currentChapter ? {currentChapter: {title: data.currentChapter.title, summaries: data.currentChapter.summaries.slice(-64)}} : {}) };
      }
    } catch { /* Legacy plain-text summaries remain readable. */ }
  }
  if (![GLOBAL_MARKER, CHAPTER_MARKER, RECENT_MARKER].some(marker => storedSummary.includes(marker))) {
    return {
      globalSummary: globalSummary.trim(),
      chapterSummaries: [],
      recentSummaries: cleanLines(storedSummary.split('\n')).slice(-6),
    };
  }

  const globalPart = storedSummary.includes(GLOBAL_MARKER)
    ? storedSummary.split(GLOBAL_MARKER)[1].split(/【章節摘要】|【近期進展】/)[0].trim() : '';
  const chapterPart = storedSummary.includes(CHAPTER_MARKER)
    ? storedSummary.split(CHAPTER_MARKER)[1].split(RECENT_MARKER)[0]
    : '';
  const recentPart = storedSummary.includes(RECENT_MARKER)
    ? storedSummary.split(RECENT_MARKER)[1]
    : '';
  return {
    globalSummary: globalPart || globalSummary.trim(),
    chapterSummaries: cleanLines(chapterPart.split('\n')).slice(-24),
    recentSummaries: cleanLines(recentPart.split('\n')).slice(-6),
  };
}

export function updateLayeredDocumentMemory(
  memory: LayeredDocumentMemory,
  chunkSummary: string,
  sourceChunk: string,
  chapterEnds = false,
): LayeredDocumentMemory {
  const summary = chunkSummary.trim();
  const heading = sourceChunk.match(/^#{1,3}\s+(.+)$/m)?.[1]?.trim();
  let chapterSummaries = memory.chapterSummaries;
  let current = memory.currentChapter;
  if (heading && current?.summaries.length) {
    chapterSummaries = uniqueRecent([...chapterSummaries, compactChapter(current.title, current.summaries)], 24);
    current = undefined;
  }
  current = {title: heading || current?.title || '未命名章節',
    summaries: uniqueRecent([...(current?.summaries ?? []), ...(summary ? [summary.slice(0, 2000)] : [])], 64)};
  if (chapterEnds && current.summaries.length) {
    chapterSummaries = uniqueRecent([...chapterSummaries, compactChapter(current.title, current.summaries)], 24);
  }
  const next: LayeredDocumentMemory = {
    ...memory,
    chapterSummaries,
    recentSummaries: uniqueRecent([...memory.recentSummaries, ...(summary ? [summary] : [])], 6),
  };
  if (chapterEnds) delete next.currentChapter;
  else next.currentChapter = current;
  return next;
}

/** Versioned persistence; human-readable prompt formatting is deliberately separate. */
export const serializeLayeredDocumentMemory = (memory: LayeredDocumentMemory) => JSON.stringify({version: 1, ...memory});

export function formatLayeredDocumentMemory(memory: LayeredDocumentMemory): string {
  const sections: string[] = [];
  if (memory.globalSummary) sections.push(`${GLOBAL_MARKER}\n${memory.globalSummary}`);
  const chapters = [...memory.chapterSummaries, ...(memory.currentChapter?.summaries.length
    ? [compactChapter(memory.currentChapter.title + '（進行中）', memory.currentChapter.summaries)] : [])];
  if (chapters.length) {
    sections.push(`${CHAPTER_MARKER}\n${chapters.map((value) => `- ${value}`).join('\n')}`);
  }
  if (memory.recentSummaries.length) {
    sections.push(`${RECENT_MARKER}\n${memory.recentSummaries.map((value) => `- ${value}`).join('\n')}`);
  }
  return sections.join('\n\n');
}

const knowledgeKey = (line: string) => line
  .replace(/^[-*]\s*/, '')
  .split(/[:：]/, 1)[0]
  .replace(/[\[\]]/g, '')
  .trim()
  .toLocaleLowerCase();

export function getNewKnowledgeLines(current: string, additions: string[]): string[] {
  const base = current.trim() && current.trim() !== '無' ? current.trim().split('\n').filter(Boolean) : [];
  const seen = new Set(base.map(knowledgeKey));
  const newLines: string[] = [];
  for (const addition of additions.map((value) => value.trim()).filter(Boolean)) {
    const key = knowledgeKey(addition);
    if (key && !seen.has(key)) {
      seen.add(key);
      newLines.push(addition);
    }
  }
  return newLines;
}

/** Keeps the first accepted translation for a term/character and adds only new keys. */
export function mergeKnowledgeLines(current: string, additions: string[]): string {
  const base = current.trim() && current.trim() !== '無' ? current.trim().split('\n').filter(Boolean) : [];
  base.push(...getNewKnowledgeLines(current, additions));
  return base.length ? base.join('\n') : '無';
}

