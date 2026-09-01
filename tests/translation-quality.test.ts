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

