import type { DetectedDocumentType } from './document-types.ts';

export type TranslationQualityIssueCode =
  | 'empty_translation'
  | 'suspiciously_short'
  | 'suspiciously_long'
  | 'repeated_paragraph'
  | 'source_language_residue'
  | 'missing_heading'
  | 'missing_url'
  | 'missing_link_target'
  | 'missing_code'
  | 'missing_footnote'
  | 'missing_number'
  | 'added_number'
  | 'lost_negation'
  | 'lost_condition'
  | 'missing_unit'
  | 'missing_glossary_term'
  | 'unbalanced_code_fence';

export type TranslationQualityIssue = {
  code: TranslationQualityIssueCode;
  severity: 'error' | 'warning';
  message: string;
  evidence?: string;
};

export type TranslationQualityReport = {
  score: number;
  blocking: boolean;
  issues: TranslationQualityIssue[];
};

const unique = (values: string[]) => [...new Set(values.filter(Boolean))];

const collectMatches = (text: string, pattern: RegExp, group = 0) => {
  const values: string[] = [];
  for (const match of text.matchAll(pattern)) values.push(match[group] || '');
  return unique(values);
};

const collectAllMatches = (text: string, pattern: RegExp, group = 0) =>
  [...text.matchAll(pattern)].map((match) => match[group] || '').filter(Boolean);

const countMatches = (text: string, pattern: RegExp) => [...text.matchAll(pattern)].length;

const normalizeNumber = (value: string) => value
  .replace(/[，,]/g, '')
  .replace(/[％]/g, '%')
  .replace(/[：]/g, ':')
  .trim();

const missingValues = (sourceValues: string[], targetValues: string[], normalize = (value: string) => value) => {
  const normalizedTargets = new Map<string, number>();
  for (const value of targetValues) {
    const normalized = normalize(value);
    normalizedTargets.set(normalized, (normalizedTargets.get(normalized) ?? 0) + 1);
  }
  return sourceValues.filter((value) => {
    const normalized = normalize(value);
    const remaining = normalizedTargets.get(normalized) ?? 0;
    if (remaining <= 0) return true;
    normalizedTargets.set(normalized, remaining - 1);
    return false;
  });
};

const issue = (
  code: TranslationQualityIssueCode,
  severity: TranslationQualityIssue['severity'],
  message: string,
  evidence?: string,
): TranslationQualityIssue => ({ code, severity, message, evidence });

export type TranslationQualityOptions = {
  documentType?: DetectedDocumentType;
  glossary?: string;
};

const NUMBER_PATTERN = /(?:(?:NT\$|US\$|[$€£¥])\s*)?(?:\d{1,3}(?:[,，]\d{3})+(?:\.\d+)?|\d+(?:\.\d+)?)(?:%|％)?/gu;
const HIGH_PRECISION_TYPES = new Set<DetectedDocumentType>(['technical', 'academic', 'business_legal']);
const NEGATION_SOURCE_PATTERN = /\b(?:not|no|never|neither|nor|without|cannot|can't|mustn't|shall\s+not|prohibited?)\b|[不無未非沒勿莫禁止不得]/giu;
const NEGATION_TARGET_PATTERN = /\b(?:not|no|never|without|cannot|can't|prohibited?)\b|[不無未非沒勿莫]|禁止|不得|最遲/giu;
const CONDITION_SOURCE_PATTERN = /\b(?:if|unless|provided\s+that|subject\s+to|only\s+if|in\s+the\s+event\s+that)\b|(?:如果|若|倘若|除非|前提|條件)/giu;
const CONDITION_TARGET_PATTERN = /\b(?:if|unless|provided\s+that|subject\s+to|only\s+if)\b|(?:如果|若|倘若|除非|前提|條件|須視|僅於)/giu;
const UNIT_PATTERN = /(?:\b(?:kg|g|mg|km|m|cm|mm|mph|km\/h|ms|mb|gb|tb|hz|khz|mhz|ghz|kw|kwh|v|ma)\b|°[cf])/giu;

const normalizeSemanticSource = (text: string) => text
  .replace(/\bnot\s+only\b/giu, '')
  .replace(/\bno\s+later\s+than\b/giu, '');

export type GlossaryEntry = { source: string; target: string };

export function parseGlossaryEntries(glossary = ''): GlossaryEntry[] {
  if (!glossary.trim() || glossary.trim() === '無') return [];
  const entries: GlossaryEntry[] = [];
  for (const rawLine of glossary.split('\n')) {
    const line = rawLine.trim().replace(/^[-*]\s*/, '').replace(/^\[([^\]]+)]\s*[:：]\s*\[([^\]]+)]$/, '$1: $2');
    const match = line.match(/^(.+?)\s*(?:[:：]|=>|→)\s*(.+)$/u);
    if (!match) continue;
    const source = match[1].replace(/^\[|]$/g, '').trim();
    const target = match[2].replace(/^\[|]$/g, '').trim();
    if (source && target && source.toLocaleLowerCase() !== target.toLocaleLowerCase()) entries.push({ source, target });
  }
  return entries;
}

const includesTerm = (text: string, term: string) => {
  if (/^[\p{Script=Latin}\p{Number}\s_.+/#-]+$/u.test(term)) {
    const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+');
    return new RegExp(`(?<![\\p{Letter}\\p{Number}])${escaped}(?![\\p{Letter}\\p{Number}])`, 'iu').test(text);
  }
  return text.toLocaleLowerCase().includes(term.toLocaleLowerCase());
};

export function assessTranslationQuality(
  source: string,
  translation: string,
  options: TranslationQualityOptions = {},
): TranslationQualityReport {
  const issues: TranslationQualityIssue[] = [];
  const compactSource = source.replace(/\s+/g, '');
  const compactTarget = translation.replace(/\s+/g, '');

  if (!compactTarget) {
    issues.push(issue('empty_translation', 'error', '譯文為空白。'));
  } else if (compactSource.length >= 120 && compactTarget.length < compactSource.length * 0.15) {
    issues.push(issue('suspiciously_short', 'error', '譯文長度異常，可能有大範圍漏譯。'));
  } else if (compactSource.length >= 200 && compactTarget.length > compactSource.length * 3.5 && compactTarget.length - compactSource.length > 300) {
    issues.push(issue('suspiciously_long', 'error', '譯文長度異常膨脹，可能加入了原文沒有的內容。'));
  }

  const normalizeParagraphs = (text: string) => text
    .split(/\n{2,}/)
    .map((value) => value.replace(/\s+/g, ' ').trim())
    .filter((value) => value.length >= 40);
  const sourceParagraphCounts = new Map<string, number>();
  for (const paragraph of normalizeParagraphs(source)) {
    sourceParagraphCounts.set(paragraph, (sourceParagraphCounts.get(paragraph) ?? 0) + 1);
  }
  const targetParagraphCounts = new Map<string, number>();
  for (const paragraph of normalizeParagraphs(translation)) {
    targetParagraphCounts.set(paragraph, (targetParagraphCounts.get(paragraph) ?? 0) + 1);
  }
  const repeatedParagraph = [...targetParagraphCounts].find(([paragraph, count]) => count > 1 && count > (sourceParagraphCounts.get(paragraph) ?? 0))?.[0];
  if (repeatedParagraph) issues.push(issue('repeated_paragraph', 'error', '譯文出現完全重複的長段落。', repeatedParagraph.slice(0, 80)));

  const sourceLatin = (source.match(/[A-Za-z]/g) ?? []).length;
  const targetLatin = (translation.match(/[A-Za-z]/g) ?? []).length;
  const targetCjk = (translation.match(/[\p{Script=Han}]/gu) ?? []).length;
  if (compactSource.length >= 120 && sourceLatin > compactSource.length * 0.55 && targetLatin > 80 && targetLatin > targetCjk * 2) {
    issues.push(issue('source_language_residue', 'warning', '譯文保留大量原文語言，可能有未翻譯段落。'));
  }

  const sourceHeadingCount = countMatches(source, /^#{1,6}\s+/gm);
  const targetHeadingCount = countMatches(translation, /^#{1,6}\s+/gm);
  if (targetHeadingCount < sourceHeadingCount) {
    issues.push(issue('missing_heading', 'error', '譯文遺失 Markdown 標題結構。', `${targetHeadingCount}/${sourceHeadingCount}`));
  }

  const checks: Array<{
    code: TranslationQualityIssueCode;
    severity: TranslationQualityIssue['severity'];
    values: string[];
    targetValues: string[];
    message: string;
    normalize?: (value: string) => string;
  }> = [
    {
      code: 'missing_url',
      severity: 'error',
      values: collectMatches(source, /https?:\/\/[^\s)\]}>'"]+/giu),
      targetValues: collectMatches(translation, /https?:\/\/[^\s)\]}>'"]+/giu),
      message: '譯文遺失 URL。',
    },
    {
      code: 'missing_link_target',
      severity: 'error',
      values: collectMatches(source, /\[[^\]]*\]\(([^)\s]+)(?:\s+"[^"]*")?\)/gu, 1),
      targetValues: collectMatches(translation, /\[[^\]]*\]\(([^)\s]+)(?:\s+"[^"]*")?\)/gu, 1),
      message: '譯文遺失 Markdown 連結目標。',
    },
    {
      code: 'missing_code',
      severity: 'error',
      values: unique([
        ...collectMatches(source, /`([^`\n]+)`/gu, 1),
        ...collectMatches(source, /^```[^\n]*\n([\s\S]*?)^```/gmu, 1).map((value) => value.trim()),
      ]),
      targetValues: unique([
        ...collectMatches(translation, /`([^`\n]+)`/gu, 1),
        ...collectMatches(translation, /^```[^\n]*\n([\s\S]*?)^```/gmu, 1).map((value) => value.trim()),
      ]),
      message: '譯文遺失行內程式碼或識別字。',
    },
    {
      code: 'missing_footnote',
      severity: 'error',
      values: collectMatches(source, /\[\^(\w[\w-]*)\]/gu, 1),
      targetValues: collectMatches(translation, /\[\^(\w[\w-]*)\]/gu, 1),
      message: '譯文遺失註腳引用。',
    },
    {
      code: 'missing_number',
      severity: options.documentType && HIGH_PRECISION_TYPES.has(options.documentType) ? 'error' : 'warning',
      values: collectAllMatches(source, NUMBER_PATTERN),
      targetValues: collectAllMatches(translation, NUMBER_PATTERN),
      message: '譯文可能遺失數字、金額或百分比。',
      normalize: normalizeNumber,
    },
  ];

  for (const check of checks) {
    const missing = missingValues(check.values, check.targetValues, check.normalize);
    if (missing.length) {
      issues.push(issue(check.code, check.severity, check.message, missing.slice(0, 5).join(', ')));
    }
  }

  const addedNumbers = missingValues(
    collectAllMatches(translation, NUMBER_PATTERN),
    collectAllMatches(source, NUMBER_PATTERN),
    normalizeNumber,
  );
  if (addedNumbers.length) {
    const severity = options.documentType && HIGH_PRECISION_TYPES.has(options.documentType) ? 'error' : 'warning';
    issues.push(issue('added_number', severity, '譯文加入原文沒有的數字、金額或百分比。', addedNumbers.slice(0, 5).join(', ')));
  }

  const semanticSource = normalizeSemanticSource(source);
  if (NEGATION_SOURCE_PATTERN.test(semanticSource) && !NEGATION_TARGET_PATTERN.test(translation)) {
    const severity = options.documentType && HIGH_PRECISION_TYPES.has(options.documentType) ? 'error' : 'warning';
    issues.push(issue('lost_negation', severity, '譯文可能遺失否定、禁止或排除語意。'));
  }
  NEGATION_SOURCE_PATTERN.lastIndex = 0;
  NEGATION_TARGET_PATTERN.lastIndex = 0;
  if (CONDITION_SOURCE_PATTERN.test(source) && !CONDITION_TARGET_PATTERN.test(translation)) {
    issues.push(issue('lost_condition', 'warning', '譯文可能遺失條件或例外關係。'));
  }
  CONDITION_SOURCE_PATTERN.lastIndex = 0;
  CONDITION_TARGET_PATTERN.lastIndex = 0;

  const sourceUnits = collectAllMatches(source, UNIT_PATTERN).map((value) => value.toLocaleLowerCase());
  UNIT_PATTERN.lastIndex = 0;
  const targetUnits = collectAllMatches(translation, UNIT_PATTERN).map((value) => value.toLocaleLowerCase());
  UNIT_PATTERN.lastIndex = 0;
  const missingUnits = missingValues(sourceUnits, targetUnits);
  if (missingUnits.length) {
    const severity = options.documentType && HIGH_PRECISION_TYPES.has(options.documentType) ? 'error' : 'warning';
    issues.push(issue('missing_unit', severity, '譯文可能遺失量測單位。', missingUnits.slice(0, 5).join(', ')));
  }

  const missingTerms = parseGlossaryEntries(options.glossary)
    .filter((entry) => includesTerm(source, entry.source) && !includesTerm(translation, entry.target));
  if (missingTerms.length) {
    issues.push(issue(
      'missing_glossary_term',
      'error',
      '譯文未遵守指定術語。',
      missingTerms.slice(0, 5).map((entry) => `${entry.source} → ${entry.target}`).join(', '),
    ));
  }

  const sourceFenceCount = countMatches(source, /^```/gm);
  const targetFenceCount = countMatches(translation, /^```/gm);
  if (targetFenceCount !== sourceFenceCount || targetFenceCount % 2 !== 0) {
    issues.push(issue('unbalanced_code_fence', 'error', '譯文的 Markdown 程式碼區塊不完整。', `${targetFenceCount}/${sourceFenceCount}`));
  }

  const errors = issues.filter((item) => item.severity === 'error').length;
  const warnings = issues.length - errors;
  return {
    score: Math.max(0, 100 - errors * 20 - warnings * 5),
    blocking: errors > 0,
    issues,
  };
}

export const formatQualityIssuesForPrompt = (report: TranslationQualityReport) => report.issues.length
  ? report.issues.map((item) => `- ${item.message}${item.evidence ? ` 缺少：${item.evidence}` : ''}`).join('\n')
  : '- 未發現可由程式判定的結構或內容遺失。';

