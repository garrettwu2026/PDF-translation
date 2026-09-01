import assert from 'node:assert/strict';
import test from 'node:test';
import { annotateTranslationSegments, applySentenceRepairs, findMissingSegmentIds, stripSegmentMarkers } from '../src/lib/sentence-segments.ts';

test('annotates sentences with stable IDs and strips markers losslessly', () => {
  const source = '# Heading\n\nFirst sentence. Second sentence!';
  const annotated = annotateTranslationSegments(source);
  assert.equal(annotated.segments.length, 3);
  assert.equal(stripSegmentMarkers(annotated.text), source);
});

test('locates and repairs an exact missing sentence', () => {
  const annotated = annotateTranslationSegments('One. Two. Three.');
  const missing = annotated.segments[1];
  const translation = annotated.text.replace(`${missing.marker}${missing.source}`, '');
  assert.deepEqual(findMissingSegmentIds(translation, annotated.segments), [missing.id]);
  const repaired = applySentenceRepairs(translation, annotated.segments, [{ id: missing.id, translation: '二。' }]);
  assert.deepEqual(findMissingSegmentIds(repaired, annotated.segments), []);
  assert.ok(repaired.includes(`${missing.marker}二。`));
});
