const DEFAULT_CHUNK_SIZE = 3_500;
const DEFAULT_TRANSLATION_TOKEN_BUDGET = 1_800;

const CJK_CHARACTER = /[\u3000-\u303f\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uac00-\ud7af]/u;

/**
 * Provider-independent token estimate for chunk planning. CJK characters are
 * conservatively treated as one token; other runs use roughly four characters
 * per token. Provider usage metadata remains authoritative for billing.
 */
export function estimateTextTokens(text: string): number {
  let tokens = 0;
  let nonCjkRun = 0;
  const flushRun = () => {
    if (nonCjkRun > 0) tokens += Math.ceil(nonCjkRun / 4);
    nonCjkRun = 0;
  };

  for (const character of text) {
    if (CJK_CHARACTER.test(character)) {
      flushRun();
      tokens += 1;
    } else {
      nonCjkRun += 1;
    }
  }
  flushRun();
  return tokens;
}

type MarkdownBlock = { text: string; indivisible: boolean };

const markdownBlocks = (text: string): MarkdownBlock[] => {
  const blocks: MarkdownBlock[] = [];
  const current: string[] = [];
  let inFence = false;

  const flush = () => {
    const value = current.join('\n').trim();
    if (value) blocks.push({ text: value, indivisible: value.startsWith('```') || value.startsWith('~~~') });
    current.length = 0;
  };

  for (const line of text.replace(/\r\n?/g, '\n').trim().split('\n')) {
    if (/^\s*(```|~~~)/.test(line)) {
      if (!inFence && current.length) flush();
      current.push(line);
      inFence = !inFence;
      if (!inFence) flush();
      continue;
    }
    if (inFence) {
      current.push(line);
      continue;
    }
    if (!line.trim()) {
      flush();
      continue;
    }
    if (/^#{1,6}\s+/.test(line) && current.length) flush();
    current.push(line);
    if (/^#{1,6}\s+/.test(line)) flush();
  }
  flush();
  return blocks;
};

const splitOversizedProse = (text: string, tokenBudget: number): string[] => {
  const sentences = text.match(/[^.!?。！？\n]+(?:[.!?。！？]+["'」』）)]*|$)|\n+/gu) ?? [text];
  const output: string[] = [];
  let current = '';

  const flush = () => {
    if (current.trim()) output.push(current.trim());
    current = '';
  };

  for (const sentence of sentences) {
    const candidate = `${current}${sentence}`;
    if (estimateTextTokens(candidate) <= tokenBudget) {
      current = candidate;
      continue;
    }
    flush();
    if (estimateTextTokens(sentence) <= tokenBudget) {
      current = sentence;
      continue;
    }

    let fragment = '';
    for (const character of sentence) {
      if (fragment && estimateTextTokens(fragment + character) > tokenBudget) {
        output.push(fragment);
        fragment = '';
      }
      fragment += character;
    }
    if (fragment.trim()) current = fragment;
  }
  flush();
  return output;
};

/**
 * Splits on Markdown block boundaries using a token budget. Fenced code blocks
 * remain intact even if they exceed the preferred budget; prose falls back to
 * sentence and Unicode-code-point boundaries without dropping content.
 */
export function splitMarkdownIntoTokenChunks(
  text: string,
  tokenBudget = DEFAULT_TRANSLATION_TOKEN_BUDGET,
): string[] {
  if (!Number.isInteger(tokenBudget) || tokenBudget < 1) {
    throw new RangeError('tokenBudget must be a positive integer');
  }

  const blocks = markdownBlocks(text);
  if (!blocks.length) return [];

  const chunks: string[] = [];
  let current = '';
  const flush = () => {
    if (current.trim()) chunks.push(current.trim());
    current = '';
  };

  const append = (block: string) => {
    const candidate = current ? `${current}\n\n${block}` : block;
    if (current && estimateTextTokens(candidate) > tokenBudget) flush();
    current = current ? `${current}\n\n${block}` : block;
  };

  for (const block of blocks) {
    if (estimateTextTokens(block.text) <= tokenBudget || block.indivisible) {
      append(block.text);
      continue;
    }
    flush();
    for (const fragment of splitOversizedProse(block.text, tokenBudget)) append(fragment);
  }
  flush();
  return chunks;
}

/**
 * Splits Markdown without dropping content and keeps every chunk within the
 * requested limit. Headings and paragraph boundaries are preferred, with a
 * sentence/character fallback for unusually long paragraphs.
 */
export function splitTextIntoChunks(
  text: string,
  maxChunkSize = DEFAULT_CHUNK_SIZE,
): string[] {
  if (!Number.isInteger(maxChunkSize) || maxChunkSize < 1) {
    throw new RangeError('maxChunkSize must be a positive integer');
  }

  const normalized = text.replace(/\r\n?/g, '\n').trim();
  if (!normalized) return [];

  const chunks: string[] = [];
  let current = '';

  const flush = () => {
    const value = current.trim();
    if (value) chunks.push(value);
    current = '';
  };

  const append = (value: string, separator = '\n\n') => {
    const part = value.trim();
    if (!part) return;

    if (part.length > maxChunkSize) {
      flush();
      for (let offset = 0; offset < part.length; offset += maxChunkSize) {
        chunks.push(part.slice(offset, offset + maxChunkSize));
      }
      return;
    }

    const candidate = current ? `${current}${separator}${part}` : part;
    if (candidate.length > maxChunkSize) flush();
    current = current ? `${current}${separator}${part}` : part;
  };

  const sections = normalized.split(/(?=^#{1,3}\s)/m);
  for (const section of sections) {
    if (section.trim().length <= maxChunkSize) {
      append(section, '\n');
      continue;
    }

    for (const paragraph of section.split(/\n{2,}/)) {
      if (paragraph.trim().length <= maxChunkSize) {
        append(paragraph);
        continue;
      }

      const sentences = paragraph.match(/[^.!?。！？]+(?:[.!?。！？]+["'」』]?|$)/g) ?? [paragraph];
      for (const sentence of sentences) append(sentence, '');
    }
  }

  flush();
  return chunks;
}

/** Avoids spreading an entire PDF buffer onto the call stack. */
export function uint8ArrayToBase64(bytes: Uint8Array): string {
  const sliceSize = 0x8000;
  const parts: string[] = [];

  for (let offset = 0; offset < bytes.length; offset += sliceSize) {
    const slice = bytes.subarray(offset, offset + sliceSize);
    parts.push(String.fromCharCode(...slice));
  }

  return btoa(parts.join(''));
}

