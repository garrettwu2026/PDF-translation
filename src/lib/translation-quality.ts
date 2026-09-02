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

export type TranslationQualityOptions = { documentType?: DetectedDocumentType };

const NUMBER_PATTERN = /(?:(?:NT\$|US\$|[$€£¥])\s*)?(?:\d{1,3}(?:[,，]\d{3})+(?:\.\d+)?|\d+(?:\.\d+)?)(?:%|％)?/gu;
const HIGH_PRECISION_TYPES = new Set<DetectedDocumentType>(['technical', 'academic', 'business_legal']);

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

