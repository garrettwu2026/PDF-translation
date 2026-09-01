export type TranslationQualityIssueCode =
  | 'empty_translation'
  | 'suspiciously_short'
  | 'missing_heading'
  | 'missing_url'
  | 'missing_link_target'
  | 'missing_code'
  | 'missing_footnote'
  | 'missing_number'
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

const countMatches = (text: string, pattern: RegExp) => [...text.matchAll(pattern)].length;

const normalizeNumber = (value: string) => value
  .replace(/[，,]/g, '')
  .replace(/[％]/g, '%')
  .replace(/[：]/g, ':')
  .trim();

const missingValues = (sourceValues: string[], targetValues: string[], normalize = (value: string) => value) => {
  const normalizedTargets = new Set(targetValues.map(normalize));
  return sourceValues.filter((value) => !normalizedTargets.has(normalize(value)));
};

const issue = (
  code: TranslationQualityIssueCode,
  severity: TranslationQualityIssue['severity'],
  message: string,
  evidence?: string,
): TranslationQualityIssue => ({ code, severity, message, evidence });

export function assessTranslationQuality(source: string, translation: string): TranslationQualityReport {
  const issues: TranslationQualityIssue[] = [];
  const compactSource = source.replace(/\s+/g, '');
  const compactTarget = translation.replace(/\s+/g, '');

  if (!compactTarget) {
    issues.push(issue('empty_translation', 'error', '譯文為空白。'));
  } else if (compactSource.length >= 120 && compactTarget.length < compactSource.length * 0.15) {
    issues.push(issue('suspiciously_short', 'error', '譯文長度異常，可能有大範圍漏譯。'));
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
      severity: 'warning',
      values: collectMatches(source, /(?:(?:NT\$|[$€£¥])\s*)?\d[\d,.]*(?:\.\d+)?(?:%|％)?/gu),
      targetValues: collectMatches(translation, /(?:(?:NT\$|[$€£¥])\s*)?\d[\d,.]*(?:\.\d+)?(?:%|％)?/gu),
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

