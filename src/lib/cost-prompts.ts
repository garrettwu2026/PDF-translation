import { estimateTextTokens } from './text.ts';
import {
  buildTranslationSystemInstruction, buildTranslationPrompt, buildCorrectionPrompt,
  buildExtractionPrompt, extractionSystemInstruction, CORRECTION_SCHEMA,
} from './translation-prompts.ts';
import { buildDocumentAnalysisPrompt, DOCUMENT_ANALYSIS_SCHEMA } from './document-analysis.ts';
import { buildChapterProofreadingPrompt, CHAPTER_PROOFREADING_SCHEMA } from './chapter-proofreading.ts';
import { buildSemanticReviewPrompt, SEMANTIC_REVIEW_SCHEMA } from './translation-risk.ts';
import { getDocumentTypeInstruction, type DetectedDocumentType } from './document-types.ts';

/** Count current prompt templates and context without generating content or calling a provider.
 * Source/translation text and sentence-marker expansion are budgeted separately in the forecast.
 */
export function estimatePromptOverheads(context: {
  style: string; glossary: string; characterMap: string; plotSummary: string;
  customInstructions: string; documentType: DetectedDocumentType;
}) {
  const documentTypeInstruction = getDocumentTypeInstruction(context.documentType);
  const count = (prompt: string, schema?: unknown) =>
    estimateTextTokens(prompt + (schema ? JSON.stringify(schema) : ''));
  return {
    extraction: count(extractionSystemInstruction(true) + buildExtractionPrompt('', true)),
    analysis: count(buildDocumentAnalysisPrompt(''), DOCUMENT_ANALYSIS_SCHEMA),
    // Prior source/translation tails are up to 1000 characters each; allow 1250 tokens.
    draft: count(buildTranslationSystemInstruction({ ...context, documentTypeInstruction,
      previousSourceText: '', previousTranslatedText: '',
    }) + buildTranslationPrompt('')) + 1250,
    correction: count(buildCorrectionPrompt({ ...context, documentTypeInstruction,
      sourceText: '', draftTranslation: '',
    }), CORRECTION_SCHEMA),
    semantic_review: count(buildSemanticReviewPrompt({
      sentences: [], glossary: context.glossary, documentTypeInstruction,
    }), SEMANTIC_REVIEW_SCHEMA),
    chapter_review: count(buildChapterProofreadingPrompt({
      ...context, sourceChapter: '', translatedChapter: '',
    }), CHAPTER_PROOFREADING_SCHEMA),
  };
}
