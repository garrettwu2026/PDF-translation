import { useReducer } from 'react';
import {
  initialTranslationMachineState,
  isTranslationMachineActive,
  translationMachineReducer,
  type TranslationStage,
} from '../lib/translation-state-machine';

export function useTranslationMachine() {
  const [state, dispatch] = useReducer(translationMachineReducer, initialTranslationMachineState);
  return {
    state,
    isActive: isTranslationMachineActive(state.stage),
    start: (stage: 'extracting' | 'translating', message = '') => dispatch({ type: 'START', stage, message }),
    transition: (stage: Exclude<TranslationStage, 'idle'>, message?: string) => dispatch({ type: 'TRANSITION', stage, message }),
    setStatus: (message: string) => dispatch({ type: 'STATUS', message }),
    fail: (error: string) => dispatch({ type: 'FAIL', error }),
    reset: () => dispatch({ type: 'RESET' }),
  };
}
