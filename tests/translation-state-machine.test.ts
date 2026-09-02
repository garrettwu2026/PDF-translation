import assert from 'node:assert/strict';
import test from 'node:test';
import { initialTranslationMachineState, isTranslationMachineActive, translationMachineReducer } from '../src/lib/translation-state-machine.ts';

test('tracks translation stages and terminal states', () => {
  const started = translationMachineReducer(initialTranslationMachineState, { type: 'START', stage: 'extracting' });
  const reviewing = translationMachineReducer(started, { type: 'TRANSITION', stage: 'chapter_review', message: '校稿' });
  assert.equal(reviewing.statusMessage, '校稿');
  assert.equal(isTranslationMachineActive(reviewing.stage), true);
  const done = translationMachineReducer(reviewing, { type: 'TRANSITION', stage: 'completed' });
  assert.equal(isTranslationMachineActive(done.stage), false);
});

test('selective semantic review remains an active translation stage', () => {
  const state = translationMachineReducer(initialTranslationMachineState, { type: 'TRANSITION', stage: 'semantic_review', message: '複審' });
  assert.equal(state.statusMessage, '複審');
  assert.equal(isTranslationMachineActive(state.stage), true);
});
