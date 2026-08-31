const DEFAULT_CHUNK_SIZE = 3_500;

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
