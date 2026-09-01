export type LayeredDocumentMemory = {
  globalSummary: string;
  chapterSummaries: string[];
  recentSummaries: string[];
};

const GLOBAL_MARKER = '【全書摘要】';
const CHAPTER_MARKER = '【章節摘要】';
const RECENT_MARKER = '【近期進展】';

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
  if (!storedSummary.includes(GLOBAL_MARKER) && !storedSummary.includes(RECENT_MARKER)) {
    return {
      globalSummary: globalSummary.trim(),
      chapterSummaries: [],
      recentSummaries: cleanLines(storedSummary.split('\n')).slice(-6),
    };
  }

  const globalPart = storedSummary.split(CHAPTER_MARKER)[0].replace(GLOBAL_MARKER, '').trim();
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
): LayeredDocumentMemory {
  const summary = chunkSummary.trim();
  if (!summary) return memory;
  const heading = sourceChunk.match(/^#{1,3}\s+(.+)$/m)?.[1]?.trim();
  const chapterSummaries = heading
    ? uniqueRecent([...memory.chapterSummaries, `${heading}：${summary}`], 24)
    : memory.chapterSummaries;
  return {
    ...memory,
    chapterSummaries,
    recentSummaries: uniqueRecent([...memory.recentSummaries, summary], 6),
  };
}

export function formatLayeredDocumentMemory(memory: LayeredDocumentMemory): string {
  const sections: string[] = [];
  if (memory.globalSummary) sections.push(`${GLOBAL_MARKER}\n${memory.globalSummary}`);
  if (memory.chapterSummaries.length) {
    sections.push(`${CHAPTER_MARKER}\n${memory.chapterSummaries.map((value) => `- ${value}`).join('\n')}`);
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

/** Keeps the first accepted translation for a term/character and adds only new keys. */
export function mergeKnowledgeLines(current: string, additions: string[]): string {
  const base = current.trim() && current.trim() !== '無' ? current.trim().split('\n').filter(Boolean) : [];
  const seen = new Set(base.map(knowledgeKey));
  for (const addition of additions.map((value) => value.trim()).filter(Boolean)) {
    const key = knowledgeKey(addition);
    if (key && !seen.has(key)) {
      seen.add(key);
      base.push(addition);
    }
  }
  return base.length ? base.join('\n') : '無';
}

