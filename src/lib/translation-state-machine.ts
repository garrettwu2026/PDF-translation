export type TranslationStage = 'idle' | 'extracting' | 'analyzing' | 'translating' | 'correcting' | 'repairing' | 'semantic_review' | 'chapter_review' | 'saving' | 'paused' | 'completed' | 'failed';

export type TranslationMachineState = { stage: TranslationStage; statusMessage: string; error?: string };
export type TranslationMachineEvent =
  | { type: 'START'; stage: 'extracting' | 'translating'; message?: string }
  | { type: 'TRANSITION'; stage: Exclude<TranslationStage, 'idle'>; message?: string }
  | { type: 'STATUS'; message: string }
  | { type: 'RESET' }
  | { type: 'FAIL'; error: string };

export const initialTranslationMachineState: TranslationMachineState = { stage: 'idle', statusMessage: '' };

export function translationMachineReducer(state: TranslationMachineState, event: TranslationMachineEvent): TranslationMachineState {
  switch (event.type) {
    case 'START':
    case 'TRANSITION':
      return { stage: event.stage, statusMessage: event.message ?? state.statusMessage };
    case 'STATUS':
      return { ...state, statusMessage: event.message };
    case 'FAIL':
      return { stage: 'failed', statusMessage: '', error: event.error };
    case 'RESET':
      return initialTranslationMachineState;
  }
}

export const isTranslationMachineActive = (stage: TranslationStage) => !['idle', 'paused', 'completed', 'failed'].includes(stage);
