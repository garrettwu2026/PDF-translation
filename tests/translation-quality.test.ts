import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { assessTranslationQuality, type TranslationQualityIssueCode } from '../src/lib/translation-quality.ts';

type BaselineCase = {
  name: string;
  source: string;
  translation: string;
  expectedCodes: TranslationQualityIssueCode[];
};

const cases = JSON.parse(readFileSync(new URL('./fixtures/translation-quality-baseline.json', import.meta.url), 'utf8')) as BaselineCase[];

for (const baseline of cases) {
  test(`translation quality baseline: ${baseline.name}`, () => {
    const report = assessTranslationQuality(baseline.source, baseline.translation);
    assert.deepEqual(report.issues.map((item) => item.code).sort(), [...baseline.expectedCodes].sort());
  });
}

test('translation quality score treats protected-content loss as blocking', () => {
  const report = assessTranslationQuality('# Title\n\nUse `safeValue`.', '使用安全值。');
  assert.equal(report.blocking, true);
  assert.ok(report.score < 100);
});

test('balanced fenced code blocks pass structural validation', () => {
  const report = assessTranslationQuality('```js\nconst x = 1;\n```', '```js\nconst x = 1;\n```');
  assert.equal(report.blocking, false);
});
test('blocks missing and invented numbers in precision-sensitive document modes', () => {
  const report = assessTranslationQuality('The amount is $1,250 on 2026-09-01.', '金額為 $1,200，日期為 2026-09-02。', {
    documentType: 'business_legal',
  });
  assert.equal(report.blocking, true);
  assert.ok(report.issues.some((item) => item.code === 'missing_number' && item.severity === 'error'));
  assert.ok(report.issues.some((item) => item.code === 'added_number' && item.severity === 'error'));
});

test('does not treat sentence punctuation after a number as part of the number', () => {
  const report = assessTranslationQuality('The approved amount is $1,250.', '核准金額為 $1,250。', {
    documentType: 'business_legal',
  });
  assert.equal(report.issues.some((item) => item.code === 'missing_number' || item.code === 'added_number'), false);
});

test('reports suspicious expansion, repeated paragraphs and untranslated residue', () => {
  const source = 'This source paragraph contains enough English text to test whether a translation remains mostly untranslated and whether deterministic quality checks report that condition reliably. '.repeat(2);
  const repeated = 'This output paragraph remains entirely in English and should have been translated into Traditional Chinese before delivery to the user.';
  const report = assessTranslationQuality(source, `${repeated}\n\n${repeated}`);
  assert.ok(report.issues.some((item) => item.code === 'repeated_paragraph'));
  assert.ok(report.issues.some((item) => item.code === 'source_language_residue'));

  const expanded = assessTranslationQuality('A sufficiently long source sentence. '.repeat(8), '額外內容。'.repeat(400));
  assert.ok(expanded.issues.some((item) => item.code === 'suspiciously_long'));
});
