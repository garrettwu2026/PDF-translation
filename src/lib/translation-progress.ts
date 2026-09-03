export type TranslationProgress = {
  completedChunks: number;
  inFlightChunk: number | null;
};

export const createTranslationProgress = (completedChunks = 0): TranslationProgress => ({
  completedChunks: Math.max(0, Math.floor(completedChunks)),
  inFlightChunk: null,
});

export const beginTranslationChunk = (
  progress: TranslationProgress,
  zeroBasedChunkIndex: number,
): TranslationProgress => ({
  ...progress,
  inFlightChunk: zeroBasedChunkIndex,
});

export const commitTranslationChunk = (
  progress: TranslationProgress,
  zeroBasedChunkIndex: number,
): TranslationProgress => ({
  completedChunks: Math.max(progress.completedChunks, zeroBasedChunkIndex + 1),
  inFlightChunk: null,
});

export const pauseTranslationProgress = (progress: TranslationProgress): TranslationProgress => ({
  completedChunks: progress.completedChunks,
  inFlightChunk: null,
});
