import assert from 'node:assert/strict';
import test from 'node:test';
import {
  annotateTranslationSegments,
  applySentenceRevisions,
  applySentenceRepairs,
  extractSegmentTranslations,
  findMissingSegmentIds,
  inspectTranslationSegments,
  stripSegmentMarkers,
} from '../src/lib/sentence-segments.ts';

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

test('segments adjacent CJK sentences without requiring spaces', () => {
  const source = '第一句。第二句！第三句？';
  const annotated = annotateTranslationSegments(source);
  assert.equal(annotated.segments.length, 3);
  assert.equal(stripSegmentMarkers(annotated.text), source);
});

test('detects empty, duplicated, unknown and reordered sentence markers', () => {
  const annotated = annotateTranslationSegments('One. Two. Three.');
  const [first, second, third] = annotated.segments;
  const invalid = `${second.marker}二。${first.marker}${third.marker}三。${third.marker}重複。[[PDFT_SEG:S9999]]未知。`;
  const inspection = inspectTranslationSegments(invalid, annotated.segments);
  assert.deepEqual(inspection.empty, [first.id]);
  assert.deepEqual(inspection.duplicates, [third.id]);
  assert.deepEqual(inspection.unknown, ['S9999']);
  assert.equal(inspection.outOfOrder, true);
});

test('repairs a marker whose translated content is empty', () => {
  const annotated = annotateTranslationSegments('One. Two.');
  const empty = `${annotated.segments[0].marker}${annotated.segments[1].marker}二。`;
  assert.deepEqual(findMissingSegmentIds(empty, annotated.segments), [annotated.segments[0].id]);
  const repaired = applySentenceRepairs(empty, annotated.segments, [{ id: annotated.segments[0].id, translation: '一。' }]);
  assert.deepEqual(inspectTranslationSegments(repaired, annotated.segments).empty, []);
  assert.ok(repaired.includes(`${annotated.segments[0].marker}一。`));
});

test('extracts and selectively replaces one translated sentence without changing markers', () => {
  const annotated = annotateTranslationSegments('One. Two.');
  const translation = `${annotated.segments[0].marker}一。${annotated.segments[1].marker}錯誤。`;
  assert.equal(extractSegmentTranslations(translation, annotated.segments).get(annotated.segments[1].id), '錯誤。');
  const revised = applySentenceRevisions(translation, annotated.segments, [{ id: annotated.segments[1].id, translation: '二。' }]);
  assert.equal(revised, `${annotated.segments[0].marker}一。${annotated.segments[1].marker}二。`);
  assert.equal(inspectTranslationSegments(revised, annotated.segments).outOfOrder, false);
});
