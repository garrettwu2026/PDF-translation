import type { DetectedDocumentType } from './document-types.ts';
import type { SourceSegment } from './sentence-segments.ts';
import { assessTranslationQuality } from './translation-quality.ts';

export type SentenceRiskReason =
  | 'deterministic_warning'
  | 'deterministic_error'
  | 'long_sentence'
  | 'complex_relation'
  | 'precision_content'
  | 'abnormal_length'
  | 'correction_uncertainty';

export type RiskySentence = {
  id: string;
  source: string;
  translation: string;
  score: number;
  reasons: SentenceRiskReason[];
};

const COMPLEX_RELATION_PATTERN = /\b(?:although|whereas|unless|except|provided\s+that|subject\s+to|notwithstanding|therefore|however|because|if|neither|without)\b|(?:雖然|然而|除非|但書|前提|條件|因此|否則|不得)/giu;
const PRECISION_PATTERN = /(?:\d|[$€£¥％%]|\b(?:section|article|clause|table|figure|equation|version|kg|km|mb|gb|°c)\b)/giu;
const HIGH_PRECISION_TYPES = new Set<DetectedDocumentType>(['technical', 'academic', 'business_legal']);

export function assessSentenceRisk(input: {
  id: string;
  source: string;
  translation: string;
  glossary: string;
  documentType: DetectedDocumentType;
  correctionUncertain?: boolean;
}): RiskySentence {
  const reasons: SentenceRiskReason[] = [];
  let score = 0;
  const report = assessTranslationQuality(input.source, input.translation, {
    documentType: input.documentType,
    glossary: input.glossary,
  });
  const errors = report.issues.filter((issue) => issue.severity === 'error').length;
  const warnings = report.issues.length - errors;
  if (errors) { score += 6 + Math.min(4, errors); reasons.push('deterministic_error'); }
  if (warnings) { score += 3 + Math.min(3, warnings); reasons.push('deterministic_warning'); }
  if (input.source.length >= 220) { score += 2; reasons.push('long_sentence'); }
  if ((input.source.match(COMPLEX_RELATION_PATTERN) ?? []).length >= 2) {
    score += 3;
    reasons.push('complex_relation');
  }
  COMPLEX_RELATION_PATTERN.lastIndex = 0;
  if (HIGH_PRECISION_TYPES.has(input.documentType) && PRECISION_PATTERN.test(input.source)) {
    score += 2;
    reasons.push('precision_content');
  }
  PRECISION_PATTERN.lastIndex = 0;
  const sourceLength = input.source.replace(/\s+/g, '').length;
  const targetLength = input.translation.replace(/\s+/g, '').length;
  const ratio = sourceLength ? targetLength / sourceLength : 1;
  if (sourceLength >= 40 && (ratio < 0.2 || ratio > 3.2)) {
    score += 4;
    reasons.push('abnormal_length');
  }
  if (input.correctionUncertain) { score += 2; reasons.push('correction_uncertainty'); }
  return { id: input.id, source: input.source, translation: input.translation, score, reasons };
}

export function selectRiskySentences(input: {
  segments: SourceSegment[];
  translations: Map<string, string>;
  glossary: string;
  documentType: DetectedDocumentType;
  correctionUncertain?: boolean;
  threshold?: number;
  maxRatio?: number;
  maxCount?: number;
}) {
  const ranked = input.segments
    .map((segment) => assessSentenceRisk({
      id: segment.id,
      source: segment.source,
      translation: input.translations.get(segment.id) ?? '',
      glossary: input.glossary,
      documentType: input.documentType,
      correctionUncertain: input.correctionUncertain,
    }))
    .filter((item) => item.score >= (input.threshold ?? 4))
    .sort((a, b) => b.score - a.score);
  const ratioLimit = Math.max(1, Math.ceil(input.segments.length * (input.maxRatio ?? 0.25)));
  return ranked.slice(0, Math.min(input.maxCount ?? 8, ratioLimit));
}

export const SEMANTIC_REVIEW_SCHEMA = {
  name: 'selective_semantic_review',
  schema: {
    type: 'object',
    additionalProperties: false,
    properties: {
      revisions: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          properties: {
            id: { type: 'string' },
            translation: { type: 'string' },
            reason: { type: 'string' },
          },
          required: ['id', 'translation', 'reason'],
        },
      },
    },
    required: ['revisions'],
  },
} as const;

export function buildSemanticReviewPrompt(input: {
  sentences: RiskySentence[];
  glossary: string;
  documentTypeInstruction: string;
}) {
  const sentenceBlock = input.sentences.map((item) => [
    `ID: ${item.id}`,
    `風險：${item.reasons.join(', ')}`,
    `原文：${item.source}`,
    `目前譯文：${item.translation}`,
  ].join('\n')).join('\n\n');
  return `你是獨立的繁體中文翻譯品質評審。只檢查下列高風險句子的語意是否忠實，尤其注意否定、條件、因果、比較、主客體、時間、單位、數字與術語。不要潤飾已正確的句子。只有確實存在誤譯、漏譯或術語錯誤時才加入 revisions；正確句子不要回傳。translation 只放完整修正版譯句，不含 ID 標記。不得增添原文沒有的資訊，所有 __PDFT_PROTECTED_XXXX__ 必須逐字保留。\n\n【文件規則】\n${input.documentTypeInstruction}\n\n【強制術語】\n${input.glossary}\n\n【待複審句子】\n${sentenceBlock}`;
}

export function parseSemanticReview(text: string, allowedIds: Set<string>) {
  const normalized = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  const parsed = JSON.parse(normalized) as { revisions?: unknown };
  if (!Array.isArray(parsed.revisions)) throw new Error('Semantic review response does not match the required schema');
  const revisions = parsed.revisions.filter((item): item is { id: string; translation: string; reason: string } => Boolean(
    item && typeof item === 'object'
    && typeof (item as Record<string, unknown>).id === 'string'
    && typeof (item as Record<string, unknown>).translation === 'string'
    && typeof (item as Record<string, unknown>).reason === 'string',
  ));
  const ids = revisions.map((item) => item.id);
  if (
    revisions.length !== parsed.revisions.length
    || new Set(ids).size !== ids.length
    || revisions.some((item) => !allowedIds.has(item.id) || !item.translation.trim())
  ) {
    throw new Error('Semantic review returned an invalid sentence revision');
  }
  return revisions;
}
