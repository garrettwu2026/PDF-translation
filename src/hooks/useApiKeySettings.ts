import { useState } from 'react';
import {
  LOCAL_STORAGE_KEY_NAME,
  LOCAL_STORAGE_OPENAI_KEY_NAME,
  SESSION_STORAGE_KEY_NAME,
  SESSION_STORAGE_OPENAI_KEY_NAME,
  persistStoredKey,
  readStoredKey,
} from '../lib/api-key-storage';

/** Owns browser-only credentials and their opt-in persistence policy. */
export function useApiKeySettings(showToast: (message: string, type?: 'success' | 'error') => void) {
  const [manualApiKey, setManualApiKey] = useState(() =>
    readStoredKey(SESSION_STORAGE_KEY_NAME, LOCAL_STORAGE_KEY_NAME));
  const [isManualKeyActive, setIsManualKeyActive] = useState(() =>
    readStoredKey(SESSION_STORAGE_KEY_NAME, LOCAL_STORAGE_KEY_NAME).length > 20);
  const [manualOpenaiApiKey, setManualOpenaiApiKey] = useState(() =>
    readStoredKey(SESSION_STORAGE_OPENAI_KEY_NAME, LOCAL_STORAGE_OPENAI_KEY_NAME));
  const [isOpenaiKeyActive, setIsOpenaiKeyActive] = useState(() =>
    readStoredKey(SESSION_STORAGE_OPENAI_KEY_NAME, LOCAL_STORAGE_OPENAI_KEY_NAME).length > 10);
  const [rememberApiKeys, setRememberApiKeys] = useState(() =>
    Boolean(localStorage.getItem(LOCAL_STORAGE_KEY_NAME) || localStorage.getItem(LOCAL_STORAGE_OPENAI_KEY_NAME)));
  const [showKeyModal, setShowKeyModal] = useState(false);

  const handleSaveApiKeys = () => {
    const trimmedGoogle = manualApiKey.trim();
    const trimmedOpenai = manualOpenaiApiKey.trim();
    if (trimmedGoogle !== '' && trimmedGoogle.length <= 20) {
      showToast('Google API Key 格式不正確', 'error');
      return;
    }
    if (trimmedOpenai !== '' && trimmedOpenai.length <= 10) {
      showToast('OpenAI API Key 格式不正確', 'error');
      return;
    }
    persistStoredKey(trimmedGoogle, SESSION_STORAGE_KEY_NAME, LOCAL_STORAGE_KEY_NAME, rememberApiKeys);
    persistStoredKey(trimmedOpenai, SESSION_STORAGE_OPENAI_KEY_NAME, LOCAL_STORAGE_OPENAI_KEY_NAME, rememberApiKeys);
    setIsManualKeyActive(trimmedGoogle.length > 20);
    setIsOpenaiKeyActive(trimmedOpenai.length > 10);
    setManualApiKey(trimmedGoogle);
    setManualOpenaiApiKey(trimmedOpenai);
    showToast(
      trimmedGoogle === '' && trimmedOpenai === ''
        ? '已清除所有儲存的 API Key'
        : rememberApiKeys ? '已在這台裝置記住並套用金鑰' : '已在此分頁工作階段套用金鑰',
      'success',
    );
    setShowKeyModal(false);
  };

  return { manualApiKey, setManualApiKey, isManualKeyActive, manualOpenaiApiKey, setManualOpenaiApiKey, isOpenaiKeyActive, rememberApiKeys, setRememberApiKeys, showKeyModal, setShowKeyModal, handleSaveApiKeys };
}
