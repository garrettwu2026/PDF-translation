export type NovelEntity = {
  sourceName: string;
  translatedName: string;
  aliases: string[];
  facts: string[];
  firstSeenChunk: number;
  lastSeenChunk: number;
};

export type NovelTimelineEntry = {
  chunk: number;
  chapter?: string;
  summary: string;
};

export type NovelContinuityMemory = {
  version: 1;
  entities: NovelEntity[];
  timeline: NovelTimelineEntry[];
};

export const EMPTY_NOVEL_CONTINUITY: NovelContinuityMemory = {
  version: 1,
  entities: [],
  timeline: [],
};

const normalizeKey = (value: string) => value
  .normalize('NFKC')
  .replace(/^[-*]\s*/, '')
  .replace(/[\[\]"'「」『』]/g, '')
  .trim()
  .toLocaleLowerCase();

const unique = (values: string[], limit: number) => {
  const seen = new Set<string>();
  return values.filter((value) => {
    const clean = value.trim();
    const key = normalizeKey(clean);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(-limit);
};

const parseCharacterLine = (line: string, chunk: number): NovelEntity | null => {
  const cleaned = line.replace(/^[-*]\s*/, '').trim();
  const separator = cleaned.search(/[:：]/);
  if (separator <= 0) return null;
  const sourceName = cleaned.slice(0, separator).replace(/[\[\]]/g, '').trim();
  const detail = cleaned.slice(separator + 1).trim();
  if (!sourceName || !detail) return null;
  const translatedName = detail.split(/[（(,，;；]/, 1)[0].trim();
  if (!translatedName) return null;
  const aliases = translatedName.split(/[／/、]/).map((value) => value.trim()).filter(Boolean);
  return {
    sourceName,
    translatedName: aliases[0] ?? translatedName,
    aliases: aliases.slice(1),
    facts: detail === translatedName ? [] : [detail],
    firstSeenChunk: chunk,
    lastSeenChunk: chunk,
  };
};

export const normalizeNovelContinuity = (value?: Partial<NovelContinuityMemory> | null): NovelContinuityMemory => {
  if (!value || !Array.isArray(value.entities) || !Array.isArray(value.timeline)) {
    return { ...EMPTY_NOVEL_CONTINUITY, entities: [], timeline: [] };
  }
  return {
    version: 1,
    entities: value.entities.filter((entity): entity is NovelEntity => Boolean(
      entity
      && typeof entity.sourceName === 'string'
      && typeof entity.translatedName === 'string'
      && Number.isFinite(entity.firstSeenChunk)
      && Number.isFinite(entity.lastSeenChunk)
      && Array.isArray(entity.aliases)
      && entity.aliases.every((alias) => typeof alias === 'string')
      && Array.isArray(entity.facts)
      && entity.facts.every((fact) => typeof fact === 'string'),
    )).slice(-200),
    timeline: value.timeline.filter((entry): entry is NovelTimelineEntry => Boolean(
      entry && Number.isFinite(entry.chunk) && typeof entry.summary === 'string'
      && (entry.chapter === undefined || typeof entry.chapter === 'string'),
    )).slice(-80),
  };
};

export function seedNovelContinuity(characterMap: string, chunk = 0): NovelContinuityMemory {
  return mergeNovelContinuity(EMPTY_NOVEL_CONTINUITY, {
    characterLines: characterMap.split('\n'),
    chunk,
  }).memory;
}

export function mergeNovelContinuity(
  current: NovelContinuityMemory,
  input: {
    characterLines?: string[];
    chunk: number;
    chunkSummary?: string;
    sourceChunk?: string;
  },
) {
  const memory = normalizeNovelContinuity(current);
  const entities = memory.entities.map((entity) => ({ ...entity, aliases: [...entity.aliases], facts: [...entity.facts] }));
  const conflicts: Array<{ sourceName: string; canonical: string; candidate: string }> = [];

  for (const line of input.characterLines ?? []) {
    const candidate = parseCharacterLine(line, input.chunk);
    if (!candidate) continue;
    const index = entities.findIndex((entity) => normalizeKey(entity.sourceName) === normalizeKey(candidate.sourceName));
    if (index < 0) {
      entities.push(candidate);
      continue;
    }
    const existing = entities[index];
    if (normalizeKey(existing.translatedName) !== normalizeKey(candidate.translatedName)) {
      conflicts.push({
        sourceName: existing.sourceName,
        canonical: existing.translatedName,
        candidate: candidate.translatedName,
      });
    }
    entities[index] = {
      ...existing,
      aliases: unique([...existing.aliases, candidate.translatedName, ...candidate.aliases]
        .filter((alias) => normalizeKey(alias) !== normalizeKey(existing.translatedName)), 12),
      facts: unique([...existing.facts, ...candidate.facts], 12),
      lastSeenChunk: Math.max(existing.lastSeenChunk, input.chunk),
    };
  }

  const summary = input.chunkSummary?.trim();
  const heading = input.sourceChunk?.match(/^#{1,3}\s+(.+)$/m)?.[1]?.trim();
  const timeline = summary
    ? [...memory.timeline, { chunk: input.chunk, chapter: heading, summary }].slice(-80)
    : memory.timeline;

  return {
    memory: { version: 1 as const, entities: entities.slice(-200), timeline },
    conflicts,
  };
}

export function formatNovelContinuity(memory: NovelContinuityMemory): string {
  const normalized = normalizeNovelContinuity(memory);
  const sections: string[] = [];
  if (normalized.entities.length) {
    sections.push(`【小說角色／實體正典】\n${normalized.entities.map((entity) => {
      const aliases = entity.aliases.length ? `；其他曾見譯名：${entity.aliases.join('、')}（不得取代正典）` : '';
      const facts = entity.facts.length ? `；已知設定：${entity.facts.join('；')}` : '';
      return `- ${entity.sourceName} → ${entity.translatedName}${aliases}${facts}`;
    }).join('\n')}`);
  }
  if (normalized.timeline.length) {
    sections.push(`【小說時間線（依文本出現順序，非推定事件年代）】\n${normalized.timeline.slice(-16).map((entry) =>
      `- 第 ${entry.chunk} 段${entry.chapter ? `（${entry.chapter}）` : ''}：${entry.summary}`).join('\n')}`);
  }
  return sections.join('\n\n');
}

export function getNovelCanonicalGlossary(memory: NovelContinuityMemory): string[] {
  return normalizeNovelContinuity(memory).entities
    .filter((entity) => entity.sourceName && entity.translatedName)
    .map((entity) => `- ${entity.sourceName}: ${entity.translatedName}`);
}
