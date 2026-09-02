import assert from 'node:assert/strict';
import test from 'node:test';
import {
  assessSentenceRisk,
  parseSemanticReview,
  selectRiskySentences,
} from '../src/lib/translation-risk.ts';

test('semantic risk prioritizes lost negation and glossary violations', () => {
  const risk = assessSentenceRisk({
    id: 'S0001',
    source: 'The supplier shall not disclose the trade secret.',
    translation: '供應商應揭露營業秘密。',
    glossary: '- trade secret: 商業機密',
    documentType: 'business_legal',
  });
  assert.ok(risk.score >= 6);
  assert.ok(risk.reasons.includes('deterministic_error'));
});

test('selective review caps requests to the highest-risk quarter', () => {
  const segments = Array.from({ length: 8 }, (_, index) => ({
    id: `S${String(index + 1).padStart(4, '0')}`,
    marker: `[[PDFT_SEG:S${String(index + 1).padStart(4, '0')}]]`,
    source: index < 4 ? 'If the system is not ready, it must not start.' : 'The service starts normally.',
  }));
  const translations = new Map(segments.map((segment) => [segment.id, '服務正常啟動。']));
  const selected = selectRiskySentences({ segments, translations, glossary: '無', documentType: 'technical' });
  assert.equal(selected.length, 2);
  assert.ok(selected.every((item) => item.score >= 4));
});

test('semantic review rejects revisions outside the requested sentence set', () => {
  assert.throws(() => parseSemanticReview(
    '{"revisions":[{"id":"S9999","translation":"錯誤","reason":"not requested"}]}',
    new Set(['S0001']),
  ));
});
